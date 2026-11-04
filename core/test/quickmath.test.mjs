import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findTrigger, cleanLatex, BACKENDS, SYSTEM_PROMPT, MODELS, DEFAULT_MODEL } from '../quickmath.mjs';

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

test('the default model is the first and cheapest listed model', () => {
  assert.equal(DEFAULT_MODEL, 'claude-haiku-5-5');
  assert.equal(MODELS[0].id, DEFAULT_MODEL);
});

const anthropic = BACKENDS.anthropic;

test('anthropic buildRequest targets the Messages API with the key, model, prompt, and input', () => {
  const { url, init } = anthropic.buildRequest({ model: 'claude-haiku-5-5', apiKey: 'sk-test' }, 'x squared');
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['x-api-key'], 'sk-test');
  assert.equal(init.headers['anthropic-version'], '2026-10-21');
  const body = JSON.parse(init.body);
  assert.equal(body.model, 'claude-haiku-5-5');
  assert.equal(body.system, SYSTEM_PROMPT);
  assert.deepEqual(body.messages, [{ role: 'user', content: 'x squared' }]);
  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.deepEqual(body.output_config, { effort: 'low' });
  assert.equal('temperature' in body, false, 'API version 2026-10-21 rejects temperature');
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

test('claude-code sends the input on stdin', () => {
  assert.equal(claudeCode.stdinFor('x squared'), 'x squared');
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

test('claude-code parseOutput rejects output that is not JSON', () => {
  assert.equal(claudeCode.parseOutput('Not logged in').ok, false);
  assert.equal(claudeCode.parseOutput('').ok, false);
});
