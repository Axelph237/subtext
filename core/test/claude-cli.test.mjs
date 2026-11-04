import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKENDS } from '../subtext.mjs';
import { runClaude } from '../node/claude-cli.mjs';

// Stands in for the claude CLI. The stdin text picks the behavior, and argv and stdin are recorded next to the script.
const FAKE_CLAUDE = `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const input = fs.readFileSync(0, 'utf8');
fs.writeFileSync(path.join(__dirname, 'argv.json'), JSON.stringify(process.argv.slice(2)));
fs.writeFileSync(path.join(__dirname, 'stdin.txt'), input);
const json = (value) => process.stdout.write(JSON.stringify(value));
switch (input) {
  case 'model error':
    json({ type: 'result', is_error: true, result: 'There is an issue with the selected model (claude-nope-1).' });
    process.exit(1);
  case 'not json':
    process.stdout.write('Welcome to Claude Code');
    break;
  case 'logged out':
    process.stderr.write('Invalid API key. Please run /login\\n');
    process.exit(1);
  case 'silent':
    process.exit(3);
  case 'hang':
    setInterval(() => {}, 1000);
    break;
  default:
    json({ type: 'result', is_error: false, stop_reason: 'end_turn', result: '$' + input + '$' });
}
`;

let dir;
let claudePath;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'subtext-fake-claude-'));
  claudePath = join(dir, 'claude');
  await writeFile(claudePath, FAKE_CLAUDE);
  await chmod(claudePath, 0o755);
});

after(() => rm(dir, { recursive: true, force: true }));

test('runClaude sends the input on stdin with the claude-code args and returns the cleaned LaTeX', async () => {
  const result = await runClaude({ input: 'x^{2}', context: '' }, { model: 'claude-sonnet-5-5', claudePath });
  assert.deepEqual(result, { ok: true, latex: 'x^{2}' });
  const argv = JSON.parse(await readFile(join(dir, 'argv.json'), 'utf8'));
  assert.deepEqual(argv, BACKENDS['claude-code'].buildArgs({ model: 'claude-sonnet-5-5' }));
  assert.equal(await readFile(join(dir, 'stdin.txt'), 'utf8'), 'x^{2}');
});

test('runClaude sends the context and the math on stdin', async () => {
  const result = await runClaude({ input: 'v dot w', context: 'Let $v$ be a vector.' }, { model: 'claude-haiku-5-5', claudePath });
  assert.equal(result.ok, true);
  assert.equal(await readFile(join(dir, 'stdin.txt'), 'utf8'), '<context>\nLet $v$ be a vector.\n</context>\n\n<math>\nv dot w\n</math>');
});

test('runClaude reports the CLI message when the JSON has is_error', async () => {
  const result = await runClaude({ input: 'model error', context: '' }, { model: 'claude-nope-1', claudePath });
  assert.deepEqual(result, { ok: false, error: 'There is an issue with the selected model (claude-nope-1).' });
});

test('runClaude rejects output that is not JSON', async () => {
  const result = await runClaude({ input: 'not json', context: '' }, { model: 'claude-haiku-5-5', claudePath });
  assert.deepEqual(result, { ok: false, error: 'The Claude CLI did not return JSON.' });
});

test('runClaude returns stderr when stdout is empty', async () => {
  const result = await runClaude({ input: 'logged out', context: '' }, { model: 'claude-haiku-5-5', claudePath });
  assert.deepEqual(result, { ok: false, error: 'Invalid API key. Please run /login' });
});

test('runClaude returns the exit code when the CLI prints nothing', async () => {
  const result = await runClaude({ input: 'silent', context: '' }, { model: 'claude-haiku-5-5', claudePath });
  assert.deepEqual(result, { ok: false, error: `${claudePath} exited with code 3 and printed nothing.` });
});

test('runClaude kills a CLI that does not answer in time', async () => {
  const started = Date.now();
  const result = await runClaude({ input: 'hang', context: '' }, { model: 'claude-haiku-5-5', claudePath, timeoutMs: 300 });
  assert.equal(result.ok, false);
  assert.match(result.error, /did not answer within 0.3 seconds/);
  assert.ok(Date.now() - started < 5000);
});

test('runClaude tells the user to set the path when claude is missing', async () => {
  const result = await runClaude({ input: 'x', context: '' }, { model: 'claude-haiku-5-5', claudePath: join(dir, 'no-such-claude') });
  assert.equal(result.ok, false);
  assert.match(result.error, /Set its path/);
});
