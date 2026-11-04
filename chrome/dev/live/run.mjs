// Loads build/extension into Playwright's Chromium with a throwaway profile, serves a stand-in
// Overleaf editor at https://www.overleaf.com/project/fixture, and drives it with real key events.
// Usage: node chrome/dev/live/run.mjs [work-dir]   (HEADED=1 to watch, ONLY="inline undo" to pick)
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const LIVE = dirname(fileURLToPath(import.meta.url));
const CHROME = resolve(LIVE, '../..');
const EXTENSION = join(CHROME, 'build/extension');
const WORK = resolve(process.argv[2] ?? mkdtempSync(join(tmpdir(), 'subtext-chrome-')));
const PROFILE = join(WORK, 'profile');
const SHOTS = join(WORK, 'shots');
const PROJECT_URL = 'https://www.overleaf.com/project/fixture';
const TAG = 'subtext';
const ONLY = process.env.ONLY?.split(/\s+/).filter(Boolean);

function extensionIdFromKey() {
  const { key } = JSON.parse(readFileSync(join(CHROME, 'manifest.json'), 'utf8'));
  const hex = createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32);
  return [...hex].map((digit) => String.fromCharCode(97 + parseInt(digit, 16))).join('');
}

rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });
execFileSync(join(CHROME, 'build.sh'), { stdio: 'inherit' });

const fixture = await build({ entryPoints: [join(LIVE, 'fixture/editor.mjs')], bundle: true, format: 'iife', target: 'chrome111', write: false });
const nonce = randomBytes(16).toString('base64');
// The policy Overleaf serves, so the content scripts meet the same CSP as on the real site.
const csp = `script-src 'nonce-${nonce}' 'unsafe-inline' 'strict-dynamic' https: 'report-sample'; object-src 'none'; base-uri 'none'`;
const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Fixture - Overleaf</title>
<style>html, body { margin: 0; height: 100%; } #editor { height: 100vh; }</style></head>
<body><div id="editor"></div><script nonce="${nonce}">${fixture.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;

const context = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chromium',
  headless: process.env.HEADED !== '1',
  viewport: { width: 860, height: 300 },
  args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
});
await context.route('https://www.overleaf.com/**', (route) => route.fulfill({
  status: 200, contentType: 'text/html', headers: { 'content-security-policy': csp }, body: html,
}));
const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
const extensionId = new URL(worker.url()).host;
console.log(`extension id ${extensionId} (from manifest key: ${extensionIdFromKey()})`);

const extensionPage = await context.newPage();
await extensionPage.goto(`chrome-extension://${extensionId}/options.html`);

function useSettings(settings) {
  return extensionPage.evaluate(async (settings) => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set(settings);
  }, settings);
}

let printedExports = false;
async function openEditor(theme = 'light') {
  const page = await context.newPage();
  const consoleLines = [];
  page.on('console', (message) => consoleLines.push(message.text()));
  await page.addInitScript((tag) => {
    window.stxResults = [];
    window.addEventListener('message', (event) => {
      if (event.data?.tag === tag && typeof event.data.result?.ok === 'boolean') window.stxResults.push(event.data.result);
    });
  }, TAG);
  await page.goto(`${PROJECT_URL}?theme=${theme}`);
  await page.waitForFunction(() => window.fixtureView);
  const exportsLine = consoleLines.find((line) => line.startsWith('SubTeXt: CodeMirror exports'));
  if (exportsLine && !printedExports) {
    console.log(exportsLine);
    printedExports = true;
  }
  page.hooked = Boolean(exportsLine);
  return page;
}

const line = (page, n) => page.evaluate((n) => window.fixtureView.state.doc.line(n).text, n);
const doc = (page) => page.evaluate(() => window.fixtureView.state.doc.toString());
const resultCount = (page) => page.evaluate(() => window.stxResults.length);
const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });

async function endOfLine(page, n) {
  await page.evaluate((n) => {
    const view = window.fixtureView;
    view.focus();
    view.dispatch({ selection: { anchor: view.state.doc.line(n).to } });
  }, n);
}

async function settle(page, count = 1) {
  await page.waitForFunction((count) => window.stxResults.length >= count, count, { timeout: 90000 });
  await page.waitForTimeout(250);
}

const ORIGINAL = ['\\documentclass{article}', '\\begin{document}', '', 'Intro line.', '', '\\end{document}'].join('\n');
const scenarios = [];
const scenario = (name, run) => scenarios.push({ name, run });

scenario('native-host-lookup', async (expect) => {
  await useSettings({});
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.click('#test');
  await page.waitForFunction(() => document.querySelector('#test-result').textContent !== 'Converting...');
  const before = await page.textContent('#test-result');
  expect(/native host is not installed/.test(before), `before install.sh the Test button reports a missing host: ${before}`);
  install();
  await page.click('#test');
  await page.waitForFunction(() => document.querySelector('#test-result').textContent !== 'Converting...', null, { timeout: 90000 });
  const after = await page.textContent('#test-result');
  expect(/\\int_\{?0\}?\^\{?\\infty\}?/.test(after), `after install.sh into <user-data-dir>/NativeMessagingHosts the Test button converts: ${after}`);
});

scenario('inline', async (expect) => {
  await useSettings({});
  const page = await openEditor();
  expect(page.hooked, 'overleaf.js received the UNSTABLE_editor:extensions hook');
  await endOfLine(page, 4);
  await page.keyboard.type(' The sum %% sum i=1 to n of i squared %%');
  await page.waitForSelector('.stx-pending', { timeout: 5000 });
  expect(await page.textContent('.stx-pending') === '%% sum i=1 to n of i squared %%', 'the pending mark covers exactly the trigger');
  await shot(page, 'pending-light');
  await settle(page);
  const text = await line(page, 4);
  expect(text.startsWith('Intro line. The sum $\\sum_{i=1}^{n}') && /i\^\{?2\}?\$$/.test(text), `line 4 holds inline math: ${text}`);
  expect(await page.locator('.stx-pending').count() === 0, 'the pending mark is gone');
  const cursorAtEnd = await page.evaluate(() => window.fixtureView.state.selection.main.head === window.fixtureView.state.doc.line(4).to);
  expect(cursorAtEnd, 'the cursor sits after the math');
  await shot(page, 'inline-done-light');
});

scenario('display', async (expect) => {
  await useSettings({});
  const page = await openEditor('dark');
  await endOfLine(page, 3);
  await page.keyboard.type('%% x squared plus y squared %%');
  await page.waitForSelector('.stx-pending', { timeout: 5000 });
  await shot(page, 'pending-dark');
  await settle(page);
  const lines = [await line(page, 3), await line(page, 4), await line(page, 5)];
  expect(lines[0] === '\\[' && /^x\^\{?2\}? ?\+ ?y\^\{?2\}?$/.test(lines[1]) && lines[2] === '\\]', `lines 3-5 hold display math: ${JSON.stringify(lines)}`);
  expect(await line(page, 6) === 'Intro line.', 'the next line is untouched');
  await shot(page, 'display-done-dark');
});

scenario('typing-while-pending', async (expect) => {
  await useSettings({});
  const page = await openEditor();
  await endOfLine(page, 4);
  await page.keyboard.type(' Then %% a over b %%');
  await page.keyboard.type(' keeps going');
  await page.keyboard.press('Home');
  await page.keyboard.type('Edited: ');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.type('Typed while pending.');
  expect(await resultCount(page) === 0, 'all edits happened before the result came back');
  await settle(page);
  const text = await line(page, 4);
  const match = text.match(/^Edited: Intro line\. Then \$([^$]+)\$ keeps going$/);
  expect(match && match[1].includes('\\frac{a}{b}'), `the result replaced exactly the trigger: ${text}`);
  expect(await line(page, 3) === 'Typed while pending.', 'the line above keeps what was typed');
  expect(!(await doc(page)).includes('%%'), 'no delimiter is left behind');
});

scenario('delete-while-pending', async (expect) => {
  await useSettings({});
  const page = await openEditor();
  await endOfLine(page, 4);
  const typed = ' %% alpha squared %%';
  await page.keyboard.type(typed);
  await page.waitForSelector('.stx-pending', { timeout: 5000 });
  for (let i = 0; i < typed.length; i++) await page.keyboard.press('Backspace');
  expect(await resultCount(page) === 0, 'the trigger was deleted before the result came back');
  await settle(page);
  expect(await doc(page) === ORIGINAL, 'the document is exactly as before, with no stray text');
  expect(await page.locator('.stx-pending, .stx-error').count() === 0, 'no pending mark or error remains');
});

scenario('edit-inside-while-pending', async (expect) => {
  await useSettings({});
  const page = await openEditor();
  await endOfLine(page, 4);
  await page.keyboard.type(' %% beta cubed %%');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft');
  await page.keyboard.type('!');
  await settle(page);
  expect(await line(page, 4) === 'Intro line. %% beta cubed! %%', `an edit inside the trigger drops the result: ${await line(page, 4)}`);
});

scenario('undo', async (expect) => {
  await useSettings({});
  const page = await openEditor();
  await endOfLine(page, 4);
  await page.keyboard.type(' %% x cubed %%');
  await settle(page);
  const converted = await line(page, 4);
  expect(/^Intro line\. \$x\^\{?3\}?\$$/.test(converted), `converted first: ${converted}`);
  await page.keyboard.type(' ok');
  await page.keyboard.press('ControlOrMeta+z');
  expect(await line(page, 4) === converted, `the first undo takes back only what was typed after the math: ${await line(page, 4)}`);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await line(page, 4) === 'Intro line. %% x cubed %%', `one undo restores the raw text: ${await line(page, 4)}`);
  await page.waitForTimeout(1500);
  expect(await page.locator('.stx-pending').count() === 0 && await resultCount(page) === 1, 'undo does not start a new conversion');
});

scenario('bad-claude-path', async (expect) => {
  await useSettings({ claudePath: '/nonexistent/claude' });
  for (const theme of ['light', 'dark']) {
    const page = await openEditor(theme);
    await endOfLine(page, 4);
    await page.keyboard.type(' %% x squared %%');
    await settle(page);
    const error = page.locator('.stx-error');
    expect(await error.isVisible(), `${theme}: the error message shows in the editor`);
    expect(/Could not find the claude CLI/.test(await error.textContent()), `${theme}: it names the problem: ${await error.textContent()}`);
    expect(await line(page, 4) === 'Intro line. %% x squared %%', `${theme}: the text is unchanged`);
    await shot(page, `error-${theme}`);
    if (theme === 'light') {
      const gone = await error.waitFor({ state: 'detached', timeout: 9000 }).then(() => true, () => false);
      expect(gone, 'light: the error message goes away within 9 seconds');
    }
  }
});

scenario('custom-delimiter', async (expect) => {
  await useSettings({});
  const page = await openEditor();
  await useSettings({ delimiter: ';;' });
  await page.waitForTimeout(300);
  await endOfLine(page, 4);
  await page.keyboard.type(' %% y %%');
  await page.waitForTimeout(1000);
  expect(await page.locator('.stx-pending').count() === 0, 'the old delimiter no longer triggers, without a reload');
  await page.keyboard.type(' ;; alpha plus beta ;;');
  await settle(page);
  const text = await line(page, 4);
  expect(/^Intro line\. %% y %% \$\\alpha ?\+ ?\\beta\$$/.test(text), `the new delimiter converts: ${text}`);
});

scenario('options-page', async (expect) => {
  await useSettings({});
  const page = await context.newPage();
  const url = `chrome-extension://${extensionId}/options.html`;
  await page.goto(url);
  expect(await page.isHidden('[data-backend="anthropic"]') && await page.isVisible('[data-backend="claude-code"]'), 'defaults show the Claude Code settings only');
  await page.check('input[name="backend"][value="anthropic"]');
  expect(await page.isVisible('[data-backend="anthropic"]') && await page.isHidden('[data-backend="claude-code"]'), 'choosing the API key shows its settings');
  await page.selectOption('#model', '__other__');
  await page.fill('#model-custom', 'claude-custom-test');
  await page.fill('#api-key', 'sk-ant-options-test');
  await page.check('input[name="backend"][value="claude-code"]');
  await page.fill('#claude-path', '/opt/test/claude');
  await page.fill('#delimiter', '@@');
  await page.waitForTimeout(300);
  await page.reload();
  const restored = {
    backend: await page.inputValue('input[name="backend"]:checked'),
    model: await page.inputValue('#model'),
    custom: await page.inputValue('#model-custom'),
    apiKey: await page.inputValue('#api-key'),
    claudePath: await page.inputValue('#claude-path'),
    delimiter: await page.inputValue('#delimiter'),
  };
  const expected = { backend: 'claude-code', model: '__other__', custom: 'claude-custom-test', apiKey: 'sk-ant-options-test', claudePath: '/opt/test/claude', delimiter: '@@' };
  expect(JSON.stringify(restored) === JSON.stringify(expected), `every field is restored: ${JSON.stringify(restored)}`);
  expect(await page.textContent('#delimiter-hint') === 'Type @@ x squared @@ in an Overleaf project to convert it.', 'the delimiter hint follows the field');
  await page.selectOption('#model', 'claude-sonnet-5-5');
  await page.check('input[name="backend"][value="anthropic"]');
  await page.waitForTimeout(300);
  await page.reload();
  expect(await page.inputValue('#model') === 'claude-sonnet-5-5' && await page.isHidden('#model-custom'), 'a listed model is restored');
  expect(await page.inputValue('input[name="backend"]:checked') === 'anthropic', 'the backend is restored');
  const stored = await page.evaluate(() => chrome.storage.local.get(null));
  expect(stored.model === 'claude-sonnet-5-5' && stored.apiKey === 'sk-ant-options-test' && stored.claudePath === '/opt/test/claude' && stored.delimiter === '@@' && stored.backend === 'anthropic',
    `storage holds the fields: ${JSON.stringify(stored)}`);
  await page.screenshot({ path: join(SHOTS, 'options.png'), fullPage: true });
  await page.check('input[name="backend"][value="claude-code"]');
  await page.selectOption('#model', 'claude-haiku-5-5');
  await page.fill('#claude-path', '');
  await page.fill('#delimiter', '');
  await page.click('#test');
  await page.waitForFunction(() => document.querySelector('#test-result').textContent !== 'Converting...', null, { timeout: 90000 });
  const result = await page.textContent('#test-result');
  expect(/\\int/.test(result) && !(await page.getAttribute('#test-result', 'class')), `Test converts with the settings on the page: ${result}`);
});

scenario('anthropic-bad-key', async (expect) => {
  await useSettings({ backend: 'anthropic', apiKey: 'sk-ant-subtext-fake-key' });
  const page = await openEditor();
  await endOfLine(page, 4);
  await page.keyboard.type(' %% x squared %%');
  await settle(page);
  const error = page.locator('.stx-error');
  const message = await error.textContent();
  expect(await error.isVisible() && /invalid x-api-key/.test(message), `the API error shows in the editor: ${message}`);
  expect(await line(page, 4) === 'Intro line. %% x squared %%', 'the text is unchanged');
  await shot(page, 'anthropic-error-light');
});

const install = () => execFileSync(join(CHROME, 'native-host/install.sh'), ['--user-data-dir', PROFILE], { stdio: 'inherit' });
if (ONLY && !ONLY.includes('native-host-lookup')) install();

let status = 0;
for (const { name, run } of scenarios) {
  if (ONLY && !ONLY.includes(name)) continue;
  const fails = [];
  const expect = (ok, message) => {
    if (!ok) fails.push(message);
  };
  const pagesBefore = new Set(context.pages());
  try {
    await run(expect);
  } catch (error) {
    fails.push(`threw: ${error.message.split('\n')[0]}`);
  }
  for (const page of context.pages()) if (!pagesBefore.has(page)) await page.close();
  console.log(`${fails.length ? 'FAIL' : 'PASS'} ${name}`);
  for (const fail of fails) console.log(`  - ${fail}`);
  if (fails.length) status = 1;
}
if (extensionId !== extensionIdFromKey()) {
  console.log('FAIL extension id does not match the manifest key');
  status = 1;
}
await context.close();
console.log(`screenshots: ${SHOTS}`);
process.exit(status);
