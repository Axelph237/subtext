export const DEFAULT_DELIMITER = '%%';

export const MODELS = [
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (cheapest)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
];

export const DEFAULT_MODEL = 'claude-haiku-5-5';

export const DEFAULT_CONTEXT_CHARS = 2000;
export const MAX_CONTEXT_CHARS = 20000;

export const SYSTEM_PROMPT = `You convert a short piece of math, written in plain language or sloppy notation, into LaTeX for the KaTeX renderer.

Output only the LaTeX. No prose, no explanation, no code fences, and no math delimiters such as $, $$, \\( or \\[.

Keep the meaning exactly. Do not solve, simplify, evaluate, expand, or reorder the math. Write what was said, in LaTeX.

Fix the notation:
- Put multi-character exponents and subscripts in braces: x^10 becomes x^{10}, a_ij becomes a_{ij}.
- Write Greek letter names as commands: alpha becomes \\alpha, capital Sigma becomes \\Sigma.
- Use \\frac, \\binom (not \\choose), \\sqrt, \\sum, \\prod, \\int, \\lim, \\infty, \\cdot, \\le, \\ge, \\ne, \\to, and named functions such as \\sin, \\log, \\exp.
- Give a definite or indefinite integral its differential, as in \\int_0^1 f(x)\\,dx.
- Write matrices with pmatrix (bmatrix if brackets were asked for) and piecewise functions with cases.

Write only ASCII. Spell every symbol as a command, such as \\pi, \\le, \\ne, \\pm, or ^\\circ, never as a Unicode character like π or ≤, because pdflatex rejects those.

A message may hold <context>, the document text just before the math, followed by <math>. Convert only the text in <math>. Use the context only to choose notation consistent with the document, such as \\mathbf{v} for a vector it writes in bold or a symbol it defined earlier. Never copy context into the output, and never use the context to solve, substitute values, or simplify.

If the input is already valid LaTeX, return it unchanged. Use only commands KaTeX supports. Never output \\begin{equation}, \\begin{align}, or \\label.`;

export function findTrigger(textBeforeCursor, delimiter = DEFAULT_DELIMITER) {
  // Pair delimiters left to right, so a leftover unconverted pair earlier in the
  // paragraph does not make its closing delimiter look like a new opening one.
  const positions = [];
  for (let i = textBeforeCursor.indexOf(delimiter); i !== -1; i = textBeforeCursor.indexOf(delimiter, i + delimiter.length)) {
    positions.push(i);
  }
  const last = positions.length - 1;
  if (last % 2 === 0 || positions[last] !== textBeforeCursor.length - delimiter.length) return null;
  const start = positions[last - 1];
  const input = textBeforeCursor.slice(start + delimiter.length, positions[last]).trim();
  if (!input) return null;
  return { start, end: textBeforeCursor.length, input };
}

export function contextWindow(textBefore, chars) {
  if (!(chars > 0)) return '';
  let text = textBefore.slice(-chars);
  const cutMidWord = text.length < textBefore.length && /\S/.test(textBefore[textBefore.length - text.length - 1]);
  if (cutMidWord) text = text.replace(/^\S+/, '');
  return text.trim();
}

export function parseContextChars(value) {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.min(MAX_CONTEXT_CHARS, Math.max(0, Math.round(n))) : DEFAULT_CONTEXT_CHARS;
}

// Without context the message stays the bare input, so requests and the eval baseline are unchanged.
export function userMessage({ input, context }) {
  return context ? `<context>\n${context}\n</context>\n\n<math>\n${input}\n</math>` : input;
}

export const FORMATS = {
  latex: { inline: (l) => `$${l}$`, display: (l) => `\\[\n${l}\n\\]` },
  markdown: { inline: (l) => `$${l}$`, display: (l) => `$$\n${l}\n$$` },
};

const WRAPPERS = [
  ['$$', '$$'],
  ['\\[', '\\]'],
  ['\\(', '\\)'],
  ['$', '$'],
];

export function cleanLatex(raw) {
  let latex = raw.trim();
  const fenced = latex.match(/^```[\w-]*\s*\n?([\s\S]*?)\n?```$/);
  if (fenced) latex = fenced[1].trim();
  for (const [open, close] of WRAPPERS) {
    if (latex.length > open.length + close.length && latex.startsWith(open) && latex.endsWith(close)) {
      latex = latex.slice(open.length, -close.length).trim();
      break;
    }
  }
  return latex;
}

function latexResult(text) {
  const latex = cleanLatex(text);
  return latex ? { ok: true, latex } : { ok: false, error: 'The model returned no LaTeX.' };
}

const REFUSAL = 'The model declined to convert this input.';

export const BACKENDS = {
  'claude-code': {
    label: 'Claude Code login',
    buildArgs({ model }) {
      return [
        '-p',
        '--model', model,
        '--effort', 'low',
        '--tools', '',
        '--strict-mcp-config',
        '--setting-sources', '',
        '--no-session-persistence',
        '--output-format', 'json',
        '--system-prompt', SYSTEM_PROMPT,
      ];
    },
    stdinFor(conversion) {
      return userMessage(conversion);
    },
    parseOutput(stdout) {
      let json;
      try {
        json = JSON.parse(stdout);
      } catch {
        return { ok: false, error: 'The Claude CLI did not return JSON.' };
      }
      if (json?.is_error) return { ok: false, error: typeof json.result === 'string' && json.result ? json.result : 'The Claude CLI reported an error.' };
      if (json?.stop_reason === 'refusal') return { ok: false, error: REFUSAL };
      if (typeof json?.result !== 'string') return { ok: false, error: 'The Claude CLI returned no result.' };
      return latexResult(json.result);
    },
  },
  anthropic: {
    label: 'Anthropic API key',
    buildRequest({ model, apiKey }, conversion) {
      return {
        url: 'https://api.anthropic.com/v1/messages',
        init: {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2026-10-21',
            'content-type': 'application/json',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model,
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userMessage(conversion) }],
            output_config: { effort: 'low' },
          }),
        },
      };
    },
    parseResponse(json) {
      if (json?.type === 'error') return { ok: false, error: json.error?.message || 'The Anthropic API returned an error.' };
      if (json?.stop_reason === 'refusal') return { ok: false, error: REFUSAL };
      if (!Array.isArray(json?.content)) return { ok: false, error: 'The Anthropic API returned an unexpected response.' };
      return latexResult(json.content.filter((block) => block.type === 'text').map((block) => block.text).join(''));
    },
  },
};

export const DEFAULT_BACKEND = 'claude-code';
