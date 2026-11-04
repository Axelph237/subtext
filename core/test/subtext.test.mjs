import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findTrigger, cleanLatex, contextWindow, parseContextChars, userMessage, BACKENDS, FORMATS, SYSTEM_PROMPT, MODELS, DEFAULT_MODEL,
  DEFAULT_CONTEXT_CHARS, MAX_CONTEXT_CHARS, CANNOT_CONVERT, CANNOT_CONVERT_TOKEN, RESULT_MARKER,
} from '../subtext.mjs';

test('findTrigger returns the trigger when the closing delimiter is at the cursor', () => {
  assert.deepEqual(findTrigger('%% x squared %%'), { start: 0, end: 15, input: 'x squared' });
});

test('findTrigger offsets point past text before the trigger', () => {
  const text = 'The Gaussian integral %% integral of e to the minus x squared %%';
  const trigger = findTrigger(text);
  assert.deepEqual(trigger, { start: 22, end: text.length, input: 'integral of e to the minus x squared' });
  assert.equal(text.slice(trigger.start, trigger.end), '%% integral of e to the minus x squared %%');
});

test('findTrigger ignores a closing delimiter that is not at the cursor', () => {
  assert.equal(findTrigger('%% x squared %% and more'), null);
});

test('findTrigger ignores empty and whitespace-only input', () => {
  assert.equal(findTrigger(''), null);
  assert.equal(findTrigger('%%%%'), null);
  assert.equal(findTrigger('%%   %%'), null);
});

test('findTrigger ignores an unclosed trigger', () => {
  assert.equal(findTrigger('%% x squared'), null);
  assert.equal(findTrigger('just %%'), null);
});

test('findTrigger does not reuse the closing delimiter of an earlier pair', () => {
  assert.equal(findTrigger('%% a %% then b %%'), null);
  const text = '%% a %% then %% b %%';
  assert.deepEqual(findTrigger(text), { start: 13, end: text.length, input: 'b' });
});

test('findTrigger honors a custom delimiter', () => {
  const text = 'so ;; sum i=1 to n ;;';
  assert.deepEqual(findTrigger(text, ';;'), { start: 3, end: text.length, input: 'sum i=1 to n' });
  assert.equal(findTrigger('so %% x %%', ';;'), null);
});

test('cleanLatex strips code fences', () => {
  assert.equal(cleanLatex('```latex\n\\frac{a}{b}\n```'), '\\frac{a}{b}');
  assert.equal(cleanLatex('```\nx^{2}\n```'), 'x^{2}');
});

test('cleanLatex strips each delimiter style and surrounding whitespace', () => {
  assert.equal(cleanLatex('  $x^{2}$ '), 'x^{2}');
  assert.equal(cleanLatex('$$\\int_0^1 x\\,dx$$'), '\\int_0^1 x\\,dx');
  assert.equal(cleanLatex('\\(\\alpha\\)'), '\\alpha');
  assert.equal(cleanLatex('\\[\n\\sum_{i=1}^{n} i\n\\]'), '\\sum_{i=1}^{n} i');
  assert.equal(cleanLatex('```latex\n$$a+b$$\n```'), 'a+b');
});

test('cleanLatex leaves bare LaTeX unchanged', () => {
  assert.equal(cleanLatex('\\int_0^\\infty e^{-x^2}\\,dx'), '\\int_0^\\infty e^{-x^2}\\,dx');
});

test('FORMATS wraps LaTeX in each host syntax', () => {
  assert.equal(FORMATS.latex.inline('x^{2}'), '$x^{2}$');
  assert.equal(FORMATS.latex.display('x^{2}'), '\\[\nx^{2}\n\\]');
  assert.equal(FORMATS.markdown.inline('x^{2}'), '$x^{2}$');
  assert.equal(FORMATS.markdown.display('x^{2}'), '$$\nx^{2}\n$$');
});

test('the default model is the first and cheapest listed model', () => {
  assert.equal(DEFAULT_MODEL, 'claude-haiku-5-5');
  assert.equal(MODELS[0].id, DEFAULT_MODEL);
});

test('contextWindow is empty when context is off', () => {
  assert.equal(contextWindow('Let v be a vector.', 0), '');
  assert.equal(contextWindow('Let v be a vector.', -5), '');
});

test('contextWindow returns short text whole, trimmed', () => {
  assert.equal(contextWindow('\n  Let $v$ be a vector. ', 2000), 'Let $v$ be a vector.');
});

test('contextWindow keeps the last characters and drops a word the cut splits', () => {
  assert.equal(contextWindow('alpha bravo charlie', 9), 'charlie');
  assert.equal(contextWindow('alpha bravo charlie', 8), 'charlie');
  assert.equal(contextWindow('alpha bravo charlie', 13), 'bravo charlie');
});

test('contextWindow never returns more than the window', () => {
  const text = 'word '.repeat(1000);
  assert.ok(contextWindow(text, 2000).length <= 2000);
});

test('parseContextChars accepts integers in range, as numbers or strings', () => {
  assert.equal(parseContextChars(0), 0);
  assert.equal(parseContextChars(500), 500);
  assert.equal(parseContextChars('750'), 750);
  assert.equal(parseContextChars(MAX_CONTEXT_CHARS), MAX_CONTEXT_CHARS);
});

test('parseContextChars clamps out-of-range values and rounds fractions', () => {
  assert.equal(parseContextChars(-1), 0);
  assert.equal(parseContextChars(MAX_CONTEXT_CHARS + 1), MAX_CONTEXT_CHARS);
  assert.equal(parseContextChars('12.6'), 13);
});

test('parseContextChars falls back to the default for missing or garbage values', () => {
  for (const value of [undefined, null, '', '  ', 'lots', NaN, Infinity, {}, [], true]) {
    assert.equal(parseContextChars(value), DEFAULT_CONTEXT_CHARS, `for ${String(value)}`);
  }
});

test('userMessage is the bare input without context', () => {
  assert.equal(userMessage({ input: 'v dot w', context: '' }), 'v dot w');
});

test('userMessage wraps context and math in tags', () => {
  assert.equal(userMessage({ input: 'v dot w', context: 'Let $\\mathbf{v}$ be a vector.' }),
    '<context>\nLet $\\mathbf{v}$ be a vector.\n</context>\n\n<math>\nv dot w\n</math>');
});

test('the system prompt explains the context and says not to copy it', () => {
  assert.match(SYSTEM_PROMPT, /<context> \(the document text just before the note\) followed by the note in <math>/);
  assert.match(SYSTEM_PROMPT, /Never copy context text into the output/);
});

test('the system prompt names the exact token for input it cannot convert', () => {
  assert.equal(CANNOT_CONVERT_TOKEN, 'SUBTEXT_CANNOT_CONVERT');
  assert.ok(SYSTEM_PROMPT.includes(`Output exactly ${CANNOT_CONVERT_TOKEN} and nothing else`));
});

// Each is a way a model might return the token: bare, wrapped like LaTeX, or inside prose.
const TOKEN_ANSWERS = [
  CANNOT_CONVERT_TOKEN,
  `  ${CANNOT_CONVERT_TOKEN}\n`,
  `$${CANNOT_CONVERT_TOKEN}$`,
  `$$${CANNOT_CONVERT_TOKEN}$$`,
  `\`\`\`\n${CANNOT_CONVERT_TOKEN}\n\`\`\``,
  `\`\`\`latex\n${CANNOT_CONVERT_TOKEN}\n\`\`\``,
  `I cannot help with the weather. ${CANNOT_CONVERT_TOKEN}`,
  `\\text{${CANNOT_CONVERT_TOKEN}}`,
];

const anthropic = BACKENDS.anthropic;

test('anthropic buildRequest targets the Messages API with the key, model, prompt, and input', () => {
  const { url, init } = anthropic.buildRequest({ model: 'claude-haiku-5-5', apiKey: 'sk-test' }, { input: 'x squared', context: '' });
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['x-api-key'], 'sk-test');
  assert.equal(init.headers['anthropic-version'], '2026-10-21');
  assert.equal(init.headers['anthropic-dangerous-direct-browser-access'], 'true', 'the API rejects requests with a browser Origin without it');
  const body = JSON.parse(init.body);
  assert.equal(body.model, 'claude-haiku-5-5');
  assert.equal(body.system, SYSTEM_PROMPT);
  assert.deepEqual(body.messages, [{ role: 'user', content: 'x squared' }]);
  assert.equal('thinking' in body, false, 'Sonnet 5.5 and Opus 5.5 reject disabled thinking');
  assert.deepEqual(body.output_config, { effort: 'low' });
  assert.equal('temperature' in body, false, 'API version 2026-10-21 rejects temperature');
});

test('anthropic buildRequest puts the context and the math in the user message', () => {
  const { init } = anthropic.buildRequest({ model: 'claude-haiku-5-5', apiKey: 'sk-test' }, { input: 'v dot w', context: 'Let $v$ be a vector.' });
  assert.deepEqual(JSON.parse(init.body).messages, [{ role: 'user', content: '<context>\nLet $v$ be a vector.\n</context>\n\n<math>\nv dot w\n</math>' }]);
});

test('anthropic parseResponse returns cleaned LaTeX from text blocks', () => {
  const json = { stop_reason: 'end_turn', content: [{ type: 'text', text: '$x^{2}$' }] };
  assert.deepEqual(anthropic.parseResponse(json), { ok: true, latex: 'x^{2}' });
});

test('anthropic parseResponse reports a refusal even when content has text', () => {
  const json = { stop_reason: 'refusal', content: [{ type: 'text', text: 'x' }] };
  const result = anthropic.parseResponse(json);
  assert.equal(result.ok, false);
  assert.match(result.error, /declined/);
});

test('anthropic parseResponse surfaces the API error message', () => {
  const json = { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } };
  assert.deepEqual(anthropic.parseResponse(json), { ok: false, error: 'invalid x-api-key' });
});

test('anthropic parseResponse rejects an empty answer', () => {
  assert.equal(anthropic.parseResponse({ stop_reason: 'end_turn', content: [] }).ok, false);
});

const claudeCode = BACKENDS['claude-code'];

test('claude-code buildArgs runs print mode with the model, no tools, no settings, and the system prompt', () => {
  const args = claudeCode.buildArgs({ model: 'claude-sonnet-5-5' });
  const valueOf = (flag) => args[args.indexOf(flag) + 1];
  assert.ok(args.includes('-p'));
  assert.equal(valueOf('--model'), 'claude-sonnet-5-5');
  assert.equal(valueOf('--tools'), '');
  assert.equal(valueOf('--setting-sources'), '');
  assert.equal(valueOf('--output-format'), 'json');
  assert.equal(valueOf('--system-prompt'), SYSTEM_PROMPT);
  assert.ok(args.includes('--no-session-persistence'));
  assert.ok(args.includes('--strict-mcp-config'));
  assert.equal(args.includes('--bare'), false, '--bare skips the keychain and breaks subscription login');
});

test('claude-code sends the bare input on stdin without context', () => {
  assert.equal(claudeCode.stdinFor({ input: 'x squared', context: '' }), 'x squared');
});

test('claude-code sends the context and the math on stdin', () => {
  assert.equal(claudeCode.stdinFor({ input: 'v dot w', context: 'Let $v$ be a vector.' }), '<context>\nLet $v$ be a vector.\n</context>\n\n<math>\nv dot w\n</math>');
});

test('claude-code parseOutput returns cleaned LaTeX from result', () => {
  const stdout = JSON.stringify({ type: 'result', is_error: false, stop_reason: 'end_turn', result: '$$\\int_{0}^{\\infty} e^{-x^{2}}\\,dx$$' });
  assert.deepEqual(claudeCode.parseOutput(stdout), { ok: true, latex: '\\int_{0}^{\\infty} e^{-x^{2}}\\,dx' });
});

test('claude-code parseOutput reports is_error with the CLI message', () => {
  const stdout = JSON.stringify({ type: 'result', is_error: true, result: 'There is an issue with the selected model (claude-nope-1).' });
  assert.deepEqual(claudeCode.parseOutput(stdout), { ok: false, error: 'There is an issue with the selected model (claude-nope-1).' });
});

test('claude-code parseOutput reports a refusal', () => {
  const stdout = JSON.stringify({ type: 'result', is_error: false, stop_reason: 'refusal', result: 'x' });
  const result = claudeCode.parseOutput(stdout);
  assert.equal(result.ok, false);
  assert.match(result.error, /declined/);
});

test('claude-code parseOutput maps any answer holding the token to the fixed error', () => {
  for (const answer of TOKEN_ANSWERS) {
    const stdout = JSON.stringify({ type: 'result', is_error: false, stop_reason: 'end_turn', result: answer });
    assert.deepEqual(claudeCode.parseOutput(stdout), { ok: false, error: CANNOT_CONVERT }, JSON.stringify(answer));
  }
});

test('anthropic parseResponse maps any answer holding the token to the fixed error', () => {
  for (const answer of TOKEN_ANSWERS) {
    const json = { stop_reason: 'end_turn', content: [{ type: 'text', text: answer }] };
    assert.deepEqual(anthropic.parseResponse(json), { ok: false, error: CANNOT_CONVERT }, JSON.stringify(answer));
  }
});

// An operation's answer: [model output, LaTeX kept].
const MARKED_ANSWERS = [
  [`3x = 7 ${RESULT_MARKER} 3x - x = 7 - x`, '3x - x = 7 - x'],
  [`3x - x = 7 - x\n${RESULT_MARKER}\n2x = 7 - x`, '2x = 7 - x'],
  [`a ${RESULT_MARKER} b ${RESULT_MARKER} c = d`, 'c = d'],
  [`$$3x = 7 ${RESULT_MARKER} 3x - x = 7 - x$$`, '3x - x = 7 - x'],
  [`\`\`\`latex\n3x = 7 ${RESULT_MARKER} $3x - x = 7 - x$\n\`\`\``, '3x - x = 7 - x'],
];

test('both backends keep only the equation after the last result marker', () => {
  for (const [answer, latex] of MARKED_ANSWERS) {
    const stdout = JSON.stringify({ type: 'result', is_error: false, stop_reason: 'end_turn', result: answer });
    assert.deepEqual(claudeCode.parseOutput(stdout), { ok: true, latex }, JSON.stringify(answer));
    assert.deepEqual(anthropic.parseResponse({ stop_reason: 'end_turn', content: [{ type: 'text', text: answer }] }), { ok: true, latex }, JSON.stringify(answer));
  }
});

// Prose answers the model gave in the eval instead of the token.
const PROSE_ANSWERS = [
  "This message is outside what I do here. I convert math notes into LaTeX for the KaTeX renderer, so I can't look up the weather.",
  "I can't do that operation because there's no <context> with an equation in this message.",
];
const WORDY_LATEX = [
  'f(x) = \\begin{cases} x & \\text{if } x \\ge 0 \\\\ -x & \\text{otherwise} \\end{cases}',
  '\\text{area} = \\pi r^{2}',
  '\\hat{\\theta}_{\\text{MLE}}',
  '\\forall \\varepsilon > 0 \\ \\exists \\delta > 0',
  '\\text{for every real number } x \\text{ there is an integer } n > x',
  '\\sin x \\cos x \\tan x \\log x \\exp x',
];

test('both backends map a prose answer to the fixed error and keep wordy LaTeX', () => {
  const both = (text) => [
    claudeCode.parseOutput(JSON.stringify({ type: 'result', is_error: false, stop_reason: 'end_turn', result: text })),
    anthropic.parseResponse({ stop_reason: 'end_turn', content: [{ type: 'text', text }] }),
  ];
  for (const text of PROSE_ANSWERS) {
    for (const result of both(text)) assert.deepEqual(result, { ok: false, error: CANNOT_CONVERT }, text);
  }
  for (const latex of WORDY_LATEX) {
    for (const result of both(latex)) assert.deepEqual(result, { ok: true, latex }, latex);
  }
});

test('a result marker with nothing after it is an error', () => {
  const stdout = JSON.stringify({ type: 'result', is_error: false, stop_reason: 'end_turn', result: `3x = 7 ${RESULT_MARKER}` });
  assert.equal(claudeCode.parseOutput(stdout).ok, false);
});

test('the token mapping leaves refusals and CLI errors as they were', () => {
  const refusal = { stop_reason: 'refusal', content: [{ type: 'text', text: CANNOT_CONVERT_TOKEN }] };
  assert.match(anthropic.parseResponse(refusal).error, /declined/);
  const cliError = JSON.stringify({ type: 'result', is_error: true, result: 'There is an issue with the selected model (claude-nope-1).' });
  assert.deepEqual(claudeCode.parseOutput(cliError), { ok: false, error: 'There is an issue with the selected model (claude-nope-1).' });
});

test('claude-code parseOutput rejects output that is not JSON', () => {
  assert.equal(claudeCode.parseOutput('Not logged in').ok, false);
  assert.equal(claudeCode.parseOutput('').ok, false);
});
