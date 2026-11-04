export const DEFAULT_DELIMITER = '%%';

export const MODELS = [
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (cheapest)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
];

export const DEFAULT_MODEL = 'claude-haiku-5-5';

export const DEFAULT_CONTEXT_CHARS = 2000;
export const MAX_CONTEXT_CHARS = 20000;

// The model answers with this token, and nothing else, when it cannot produce LaTeX.
export const CANNOT_CONVERT_TOKEN = 'SUBTEXT_CANNOT_CONVERT';
export const CANNOT_CONVERT = 'The model could not tell what math you meant. Your text is unchanged.';
// An operation's answer is the model's work, this marker, then the equation. Only the equation is kept.
export const RESULT_MARKER = 'SUBTEXT_RESULT';

export const SYSTEM_PROMPT = `You turn a short note into LaTeX for the KaTeX renderer. A message is either the note alone, or <context> (the document text just before the note) followed by the note in <math>. The note is one of three things.

1. Math, in plain language or sloppy notation. Convert it and keep its meaning exactly. Do not solve, simplify, evaluate, expand, or reorder it. Write what was said, in LaTeX. If it is already valid LaTeX, return it unchanged.

2. An operation on an equation, such as "x to both sides", "subtract 3 from both sides", "reduce sides by x", "divide by a", "drop x on right", "square both sides", or "simp left cross terms". Find the equation it means in <context>, usually the most recent one. Answer in two parts. First your work, as "kind: <add, subtract, multiply, divide, power, erase, or none>; side: <left or right if the note says left or right, otherwise both>; step: <the whole equation with the step written into it>; simplify: <no, or the note's simplify word and what it covers>". "Drop", "remove", and "delete" are kind erase, never subtract. Then ${RESULT_MARKER}, then the final equation: the step equation itself when simplify is no, or that equation with only the asked part simplified. Only the part after ${RESULT_MARKER} is kept. Operations are the only case where you change the math:
- A step that names a side ("right", "on right", "left side", "right-hand side", as in "reduce right by 5") applies to that side only. Leave the other side exactly as it was, even when the equation is then no longer true. A step that names no side, or says "both sides", "sides", or "through", applies to both sides.
- Leave every term in place: nothing cancels and no arithmetic is done.
- "Drop", "remove", or "delete" a term erases it from the side named, or from both sides when none is named. Erase the term that is there, with its sign, and write nothing in its place: v - u with u dropped is v, and y = mx + b with "remove b" gives y = mx.
- Simplify only when the note asks, with a word such as "simplify", "simp", "simpl", "combine like terms", "collect terms", or "and reduce" anywhere in it, as in "reduce sides by x, simp". The request may name a side ("simp left"), a kind of term ("cross terms", "like terms", "constants", "the fractions"), or both. Combine and do arithmetic only on what it names, and copy everything else character for character. Cross terms are mixed products such as ab and ba, or 2xy.
- Never solve for a variable unless the note asks.
For example, with the equation in <context>:
- 3y = 5 and "reduce sides by y": kind: subtract; side: both; step: 3y - y = 5 - y; simplify: no ${RESULT_MARKER} 3y - y = 5 - y
- 3y = 5 and "reduce sides by y, simp": kind: subtract; side: both; step: 3y - y = 5 - y; simplify: "simp", all ${RESULT_MARKER} 2y = 5 - y
- 2u - u = 9 and "u to both sides": kind: add; side: both; step: 2u - u + u = 9 + u; simplify: no ${RESULT_MARKER} 2u - u + u = 9 + u
- y + 5 = z and "minus 5 both sides": kind: subtract; side: both; step: y + 5 - 5 = z - 5; simplify: no ${RESULT_MARKER} y + 5 - 5 = z - 5
- 4t = s and "divide by 4": kind: divide; side: both; step: \\frac{4t}{4} = \\frac{s}{4}; simplify: no ${RESULT_MARKER} \\frac{4t}{4} = \\frac{s}{4}
- p = q + k and "reduce right side by k": kind: subtract; side: right; step: p = q + k - k; simplify: no ${RESULT_MARKER} p = q + k - k
- u + 2u = v - u and "drop u on right": kind: erase; side: right; step: u + 2u = v; simplify: no ${RESULT_MARKER} u + 2u = v
- w = 2r + s and "remove the s on the right": kind: erase; side: right; step: w = 2r; simplify: no ${RESULT_MARKER} w = 2r
- p^2 + pq + qp = 3 + 4 and "simp left cross terms": kind: none; side: left; step: p^2 + pq + qp = 3 + 4; simplify: "simp", left cross terms ${RESULT_MARKER} p^2 + 2pq = 3 + 4
- t + 1 + 2 = 2t + t and "simp right": kind: none; side: right; step: t + 1 + 2 = 2t + t; simplify: "simp", right ${RESULT_MARKER} t + 1 + 2 = 3t

3. Anything else: words that are neither math nor an operation, or an operation when there is no <context> with an equation it applies to. Output exactly ${CANNOT_CONVERT_TOKEN} and nothing else. Never answer in prose.

Use <context> to choose notation consistent with the document, such as \\mathbf{v} for a vector it writes in bold or a symbol it defined earlier. Never copy context text into the output, and never use the context to substitute values, solve, or simplify, except for the one equation an operation changes.

Output only the LaTeX, the token, or an operation's two parts. No prose, no explanation, no code fences, and no math delimiters such as $, $$, \\( or \\[.

Fix the notation:
- Put multi-character exponents and subscripts in braces: x^10 becomes x^{10}, a_ij becomes a_{ij}.
- Write Greek letter names as commands: alpha becomes \\alpha, capital Sigma becomes \\Sigma.
- Use \\frac, \\binom (not \\choose), \\sqrt, \\sum, \\prod, \\int, \\lim, \\infty, \\cdot, \\le, \\ge, \\ne, \\to, and named functions such as \\sin, \\log, \\exp.
- Give a definite or indefinite integral its differential, as in \\int_0^1 f(x)\\,dx.
- Write matrices with pmatrix (bmatrix if brackets were asked for) and piecewise functions with cases.

Write only ASCII. Spell every symbol as a command, such as \\pi, \\le, \\ne, \\pm, or ^\\circ, never as a Unicode character like π or ≤, because pdflatex rejects those.

Use only commands KaTeX supports. Never output \\begin{equation}, \\begin{align}, or \\label.`;

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

function afterResultMarker(text) {
  const at = text.lastIndexOf(RESULT_MARKER);
  return at === -1 ? text : text.slice(at + RESULT_MARKER.length);
}

// Asked for the token, the model still answers some non-math notes in prose, which must never land in a
// document as math. Outside commands and \text{}, prose is a run of five or more words joined only by spaces
// and punctuation, with at least two real words. Math joins short variable names with operators and parentheses.
function looksLikeProse(latex) {
  const bare = latex.replace(/\\(?:text|mathrm|operatorname|textbf|textit|mbox)\{[^}]*\}/g, ' ').replace(/\\[a-zA-Z]+/g, ' ');
  return bare.split(/[^A-Za-z\s,.;:'"!?]+/).some((run) => {
    const words = run.match(/[A-Za-z]+/g) ?? [];
    return words.length >= 5 && words.filter((word) => word.length >= 4).length >= 2;
  });
}

function latexResult(text) {
  if (text.includes(CANNOT_CONVERT_TOKEN)) return { ok: false, error: CANNOT_CONVERT };
  const latex = cleanLatex(afterResultMarker(cleanLatex(text)));
  if (!latex) return { ok: false, error: 'The model returned no LaTeX.' };
  return looksLikeProse(latex) ? { ok: false, error: CANNOT_CONVERT } : { ok: true, latex };
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
