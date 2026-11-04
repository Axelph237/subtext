// Spends real tokens: each case is one claude CLI call on Haiku (about $0.0002).
// Usage: node core/evals/run.mjs [path/to/claude]
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import katex from 'katex';
import { BACKENDS, DEFAULT_MODEL } from '../quickmath.mjs';

const CLAUDE = process.argv[2] || `${homedir()}/.local/bin/claude`;
const MODEL = process.env.QM_MODEL || DEFAULT_MODEL;
const backend = BACKENDS['claude-code'];

// `must` and `mustNot` check that meaning survives and the model did not solve the math.
// Patterns ignore spaces, so `x^{10}` also matches `x^{ 10 }`.
const CASES = [
  { input: 'integral from 0 to infinity of e to the minus x squared', must: [/\\int_\{?0\}?\^\{?\\infty\}?/, /e\^\{-x\^\{?2\}?\}/, /dx/], mustNot: [/\\sqrt\{?\\pi/] },
  { input: 'x^10 + y^12', must: [/x\^\{10\}/, /y\^\{12\}/] },
  { input: 'sum i=1 to n of i squared', must: [/\\sum_\{i=1\}\^\{?n\}?/, /i\^\{?2\}?/], mustNot: [/n\(n\+1\)/] },
  { input: 'alpha plus beta over gamma', must: [/\\alpha/, /\\beta/, /\\gamma/] },
  { input: '2 by 2 matrix with rows a b and c d', must: [/\\begin\{[pb]matrix\}/, /a&b\\\\c&d/] },
  { input: 'f of x equals x if x >= 0, minus x otherwise', must: [/\\begin\{cases\}/, /\\geq?0/, /-x/] },
  { input: '\\frac{a}{b} + \\sqrt{c}', exact: '\\frac{a}{b} + \\sqrt{c}' },
  { input: 'limit as x goes to 0 of sin x over x', must: [/\\lim_\{x\\to0\}/, /\\frac\{\\sin\(?x\)?\}\{x\}/], mustNot: [/=1/] },
  { input: 'derivative of x cubed with respect to x', must: [/\\frac\{d\}\{dx\}/, /x\^\{?3\}?/], mustNot: [/3x\^\{?2/] },
  { input: 'square root of b squared minus 4ac', must: [/\\sqrt\{b\^\{?2\}?-4ac\}/] },
  { input: 'a_ij times b_jk', must: [/a_\{ij\}/, /b_\{jk\}/] },
  { input: 'P of A given B equals P(B|A) P(A) over P(B)', must: [/P\(A(\\mid|\|)B\)/, /\\frac/] },
  { input: 'n choose k', must: [/\\binom\{n\}\{k\}/] },
  { input: 'for all epsilon > 0 there exists delta > 0', must: [/\\forall/, /\\(var)?epsilon/, /\\exists/, /\\delta/] },
  { input: 'theta hat sub MLE', must: [/\\hat\{\\theta\}_\{(\\(text|mathrm)\{)?MLE/] },
  { input: 'norm of x minus y is at most epsilon', must: [/(\\\||\\lVert)/, /\\leq?/, /\\(var)?epsilon/] },
  { input: 'e^(i pi) + 1 = 0', must: [/e\^\{i\\pi\}\+1=0/] },
];

function runCli(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE, backend.buildArgs({ model: MODEL }), { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.on('error', reject);
    child.on('close', () => resolve(stdout));
    child.stdin.end(backend.stdinFor(input));
  });
}

function judge(c, latex) {
  const problems = [];
  try {
    katex.renderToString(latex, { throwOnError: true, displayMode: true });
  } catch (e) {
    problems.push(`KaTeX: ${e.message.split('\n')[0]}`);
  }
  const squashed = latex.replace(/\s+/g, '');
  if (c.exact !== undefined && latex !== c.exact) problems.push('changed already-correct LaTeX');
  for (const re of c.must || []) if (!re.test(squashed)) problems.push(`missing ${re}`);
  for (const re of c.mustNot || []) if (re.test(squashed)) problems.push(`solved or simplified ${re}`);
  return problems;
}

async function runCase(c) {
  const stdout = await runCli(c.input);
  const result = backend.parseOutput(stdout);
  let cost = 0;
  try { cost = JSON.parse(stdout).total_cost_usd || 0; } catch {}
  if (!result.ok) return { c, latex: '', problems: [result.error], cost };
  return { c, latex: result.latex, problems: judge(c, result.latex), cost };
}

const results = [];
const queue = [...CASES];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) results.push(await runCase(queue.shift()));
}));
results.sort((a, b) => CASES.indexOf(a.c) - CASES.indexOf(b.c));

const cell = (s) => s.replace(/\|/g, '\\|');
console.log(`model ${MODEL}\n`);
console.log('| ok | input | output |');
console.log('| --- | --- | --- |');
for (const r of results) {
  console.log(`| ${r.problems.length ? 'FAIL' : 'pass'} | ${cell(r.c.input)} | \`${cell(r.latex)}\` |`);
}
const failed = results.filter((r) => r.problems.length);
for (const r of failed) console.log(`\nFAIL ${r.c.input}\n  ${r.problems.join('\n  ')}`);
const cost = results.reduce((sum, r) => sum + r.cost, 0);
console.log(`\n${results.length - failed.length}/${results.length} passed, total cost $${cost.toFixed(4)}`);
process.exit(failed.length ? 1 : 0);
