// Spends real tokens: each case is one claude CLI call on Haiku (about $0.0002).
// Usage: node core/evals/run.mjs [path/to/claude]
import { spawn } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import katex from 'katex';
import { BACKENDS, CANNOT_CONVERT, DEFAULT_CONTEXT_CHARS, DEFAULT_MODEL, contextWindow } from '../subtext.mjs';

const CLAUDE = process.argv[2] || `${homedir()}/.local/bin/claude`;
const MODEL = process.env.STX_MODEL || DEFAULT_MODEL;
// STX_REPEAT=10 runs each case ten times to measure a flaky case's pass rate. STX_ONLY=<regex> picks cases by input.
const REPEAT = Number(process.env.STX_REPEAT) || 1;
const ONLY = process.env.STX_ONLY ? new RegExp(process.env.STX_ONLY) : null;
const backend = BACKENDS['claude-code'];

// Document text before a trigger, cut to the default window, so one case has the realistic size and cost.
const PAPER = contextWindow(`${'We study the linear model through its least squares fit and the geometry of the projection it defines. '.repeat(14)}
Let $\\mathbf{X} \\in \\mathbb{R}^{n \\times p}$ be the design matrix with full column rank, let $\\mathbf{y} \\in \\mathbb{R}^n$ be the response, and let $\\boldsymbol{\\beta} \\in \\mathbb{R}^p$ be the unknown coefficients. The model is $\\mathbf{y} = \\mathbf{X}\\boldsymbol{\\beta} + \\boldsymbol{\\varepsilon}$, where the noise $\\boldsymbol{\\varepsilon}$ has mean zero and covariance $\\sigma^2 \\mathbf{I}_n$. Minimizing the residual sum of squares gives the normal equations, and solving them gives the estimator`, DEFAULT_CONTEXT_CHARS);

// `must` and `mustNot` check that meaning survives and the model did not solve the math.
// A `context` case checks that the document text before the trigger picks the notation and is not copied or used to solve.
// An operation case writes one step into the equation in its context, unsimplified unless the input asks; its `must` is anchored to the whole output.
// An `expectError` case passes only on the CANNOT_CONVERT error, from the token or from a prose answer.
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
  { input: 'area equals pi r squared', must: [/\\pi/, /r\^\{?2\}?/] },
  { input: 'x ≤ y and y ≠ z', must: [/\\leq?/, /\\neq?/] },
  { input: 'angle ABC is 90 degrees', must: [/\\angle/, /90/] },
  { input: 'mu sub x plus or minus sigma', must: [/\\mu_\{?x\}?/, /\\pm/, /\\sigma/] },
  { context: 'Let $\\mathbf{v}$ and $\\mathbf{w}$ be vectors in $\\mathbb{R}^n$.', input: 'v dot w', must: [/\\mathbf\{v\}/, /\\mathbf\{w\}/, /\\cdot/], mustNot: [/\\mathbb/] },
  { context: 'We train the network by minimizing the loss $\\mathcal{L}(\\theta)$ over its parameters $\\theta$.', input: 'gradient of L with respect to theta', must: [/\\mathcal\{L\}/, /\\(nabla|partial)/, /\\theta/] },
  { context: 'Fix $x = 3$ and $y = 4$, as in the example of Section 2.', input: 'x squared plus y squared', must: [/x\^\{?2\}?\+y\^\{?2\}?/], mustNot: [/25/, /3\^/, /9/, /Section/] },
  { context: "By Plancherel's theorem the Fourier transform $\\hat{f}(\\xi) = \\int f(x) e^{-2\\pi i x \\xi}\\,dx$ preserves the $L^2$ norm.", input: 'norm of f equals norm of f hat', must: [/\\hat\{?f\}?/], mustNot: [/\\int/, /Plancherel/, /e\^\{-2/] },
  { context: PAPER, input: 'beta hat equals X transpose X inverse X transpose y', must: [/\\hat\{\\boldsymbol\{\\beta\}\}|\\boldsymbol\{\\hat\{\\beta\}\}|\\hat\{\\beta\}/, /\\mathbf\{X\}\^\{?(\\top|T)\}?/, /\\mathbf\{y\}/, /\^\{-1\}/], mustNot: [/\\varepsilon/, /\\sigma/] },
  { context: 'Then $2x + 3 = 11$.', input: 'subtract 3 from both sides', must: [/^2x\+3-3=11-3$/], mustNot: [/2x=8/] },
  { context: 'Then $2x + 3 = 11$.', input: 'subtract 3 from both sides and simplify', must: [/^2x=8$/], mustNot: [/x=4/] },
  { context: '$3x = 7$', input: 'reduce sides by x', must: [/^3x-x=7-x$/] },
  { context: '$3x = 7$', input: 'reduce sides by x, simp', must: [/^2x=7-x$/] },
  { context: '$ax = c - b$', input: 'divide both sides by a', must: [/^\\frac\{ax\}\{a\}=\\frac\{c-b\}\{a\}$/], mustNot: [/^x=\\frac/] },
  { context: '$y = mx + b + c$', input: 'reduce right side by c', must: [/^y=mx\+b\+c-c$/] },
  { context: '\\[\nx - 5 = y\n\\]', input: 'reduce right by 5', must: [/^x-5=y-5$/] },
  { context: '$x - 5 = y$', input: 'add 5 to the left', must: [/^x-5\+5=y$/] },
  { context: '$ax + b = c$', input: 'minus b both sides', must: [/^ax\+b-b=c-b$/] },
  { context: '$3x - x = 7$', input: 'x to both sides', must: [/^3x-x\+x=7\+x$/] },
  { context: 'Halving gives $\\frac{x}{2} = 5$.', input: 'multiply through by 2', must: [/^(\\frac\{x\}\{2\}(\\cdot|\\times)2|2(\\cdot|\\times)?\\frac\{x\}\{2\})=(5(\\cdot|\\times)2|2(\\cdot|\\times)5)$/] },
  { context: 'so $\\sqrt{x} = y + 1$.', input: 'square both sides', must: [/^(\\left)?\(\\sqrt\{x\}(\\right)?\)\^\{?2\}?=(\\left)?\(y\+1(\\right)?\)\^\{?2\}?$/] },
  { context: '$3x - x = 7 - x$', input: 'drop x on right', must: [/^3x-x=7$/], mustNot: [/2x/] },
  { context: '$a^2 + ab + ba + b^2 = c + 2c$', input: 'simp left cross terms', must: [/^a\^\{?2\}?\+2ab\+b\^\{?2\}?=c\+2c$/], mustNot: [/3c/] },
  { context: '$x^2 + 2x + x + 5 = 4 + 6$', input: 'simp right', must: [/^x\^\{?2\}?\+2x\+x\+5=10$/], mustNot: [/3x/] },
  { context: '$y = mx + b$', input: 'remove the b on the right', must: [/^y=mx$/] },
  { input: 'x to both sides', expectError: true },
  { input: "what's the weather tomorrow", expectError: true },
];

function runCli(conversion) {
  return new Promise((resolve, reject) => {
    // The hosts run claude from a temp dir. Run from this checkout, it sees the repo and answers differently.
    const child = spawn(CLAUDE, backend.buildArgs({ model: MODEL }), { cwd: tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.on('error', reject);
    child.on('close', () => resolve(stdout));
    child.stdin.end(backend.stdinFor(conversion));
  });
}

function judge(c, latex) {
  const problems = [];
  try {
    katex.renderToString(latex, { throwOnError: true, displayMode: true });
  } catch (e) {
    problems.push(`KaTeX: ${e.message.split('\n')[0]}`);
  }
  // pdflatex, Overleaf's default compiler, fails on Unicode math characters such as π or ≤.
  const unicode = latex.match(/[^\x00-\x7f]/g);
  if (unicode) problems.push(`non-ASCII ${[...new Set(unicode)].join(' ')}`);
  if (/<\/?(context|math)>/.test(latex)) problems.push('copied the message tags');
  const squashed = latex.replace(/\s+/g, '');
  if (c.exact !== undefined && latex !== c.exact) problems.push('changed already-correct LaTeX');
  for (const re of c.must || []) if (!re.test(squashed)) problems.push(`missing ${re}`);
  for (const re of c.mustNot || []) if (re.test(squashed)) problems.push(`solved or simplified ${re}`);
  return problems;
}

async function runCase(c) {
  const stdout = await runCli({ input: c.input, context: c.context ?? '' });
  const result = backend.parseOutput(stdout);
  let cost = 0;
  try { cost = JSON.parse(stdout).total_cost_usd || 0; } catch {}
  if (c.expectError) {
    const problems = result.ok || result.error !== CANNOT_CONVERT ? [`expected the cannot-convert error, got ${JSON.stringify(result)}`] : [];
    return { c, latex: result.ok ? result.latex : `error: ${result.error}`, problems, cost };
  }
  if (!result.ok) return { c, latex: `error: ${result.error}`, problems: [result.error], cost };
  return { c, latex: result.latex, problems: judge(c, result.latex), cost };
}

const picked = CASES.filter((c) => !ONLY || ONLY.test(c.input));
const results = [];
const queue = picked.flatMap((c) => Array(REPEAT).fill(c));
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) results.push(await runCase(queue.shift()));
}));
results.sort((a, b) => CASES.indexOf(a.c) - CASES.indexOf(b.c));

const cell = (s) => s.replace(/\|/g, '\\|');
console.log(`model ${MODEL}\n`);
const contextCell = (context = '') => (context.length > 200 ? `(${context.length} characters)` : context);
console.log('| ok | context | input | output | cost |');
console.log('| --- | --- | --- | --- | --- |');
for (const r of results) {
  console.log(`| ${r.problems.length ? 'FAIL' : 'pass'} | ${cell(contextCell(r.c.context))} | ${cell(r.c.input)} | \`${cell(r.latex)}\` | $${r.cost.toFixed(5)} |`);
}
const failed = results.filter((r) => r.problems.length);
for (const r of failed) console.log(`\nFAIL ${r.c.input}\n  ${r.problems.join('\n  ')}`);
if (REPEAT > 1) {
  console.log('\n| passed | context | input |\n| --- | --- | --- |');
  for (const c of picked) {
    const runs = results.filter((r) => r.c === c);
    console.log(`| ${runs.filter((r) => !r.problems.length).length}/${runs.length} | ${cell(contextCell(c.context))} | ${cell(c.input)} |`);
  }
}
const cost = results.reduce((sum, r) => sum + r.cost, 0);
console.log(`\n${results.length - failed.length}/${results.length} passed, total cost $${cost.toFixed(4)}`);
process.exit(failed.length ? 1 : 0);
