// Tries the built extension on the real overleaf.com in a dedicated profile. It creates one scratch
// project, converts an inline and a whole-line trigger in main.tex, then trashes and permanently
// deletes that project by its recorded ID. It never touches any other project.
// Usage: node chrome/dev/live/overleaf.mjs <profile-dir>
// Use a profile dir of its own, not a Chrome or Brave profile. Sign in there once; it is kept.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Overleaf's UI changes without notice. Fix these first if a step times out.
const SELECTORS = {
  newProjectButton: 'button:has-text("New project")',
  blankProjectItem: '[role="menuitem"]:has-text("Blank project"), a:has-text("Blank project"), button:has-text("Blank project")',
  projectNameInput: '#project-name',
  createButton: '.modal-footer button:has-text("Create"), [role="dialog"] button:has-text("Create")',
  editor: '.cm-editor',
  pendingMark: '.qm-pending',
  errorMessage: '.qm-error',
};
const DASHBOARD_URL = 'https://www.overleaf.com/project';
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;
const CONVERSION_TIMEOUT_MS = 90000;
const INLINE_TRIGGER = 'Inline: %% x squared plus one %%';
const DISPLAY_TRIGGER = '%% sum i=1 to n of i %%';

const profileArg = process.argv[2];
if (!profileArg) {
  console.error('usage: node chrome/dev/live/overleaf.mjs <profile-dir>');
  process.exit(2);
}
const PROFILE = resolve(profileArg);
const CHROME = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const EXTENSION = join(CHROME, 'build/extension');

mkdirSync(PROFILE, { recursive: true });
execFileSync(join(CHROME, 'build.sh'), { stdio: 'inherit' });
execFileSync(join(CHROME, 'native-host/install.sh'), ['--user-data-dir', PROFILE], { stdio: 'inherit' });

const context = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chromium',
  headless: false,
  viewport: null,
  args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
});
await context.addInitScript(() => {
  window.addEventListener('UNSTABLE_editor:extensions', (event) => {
    const { CodeMirror } = event.detail;
    window.qmHook = { keys: Object.keys(CodeMirror ?? {}).sort(), EditorView: CodeMirror?.EditorView };
  });
});

const page = context.pages()[0] ?? await context.newPage();
page.on('console', (message) => {
  if (message.text().startsWith('Quick Math')) console.log(`[page] ${message.text()}`);
});

let status = 0;
const check = (ok, message) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${message}`);
  if (!ok) status = 1;
};

await page.goto(DASHBOARD_URL);
if (new URL(page.url()).pathname !== '/project') {
  console.log('\n>>> Sign in to Overleaf in the browser window. Waiting up to 5 minutes for the project dashboard.\n');
}
await page.waitForURL((url) => url.pathname === '/project', { timeout: SIGN_IN_TIMEOUT_MS });
await page.locator(SELECTORS.newProjectButton).first().waitFor({ timeout: SIGN_IN_TIMEOUT_MS });
console.log('signed in; dashboard is open');

const projectName = `Quick Math scratch ${new Date().toISOString().replace(/[:.]/g, '-')}`;
await page.locator(SELECTORS.newProjectButton).first().click();
await page.locator(SELECTORS.blankProjectItem).first().click();
await page.locator(SELECTORS.projectNameInput).first().fill(projectName);
await page.locator(SELECTORS.createButton).first().click();
await page.waitForURL(/\/project\/[0-9a-f]{24}(?:[/?#]|$)/, { timeout: 60000 });
const projectId = page.url().match(/\/project\/([0-9a-f]{24})/)[1];
console.log(`created "${projectName}" with project ID ${projectId}`);

function editorText() {
  return page.evaluate((selector) => window.qmHook.EditorView.findFromDOM(document.querySelector(selector)).state.doc.toString(), SELECTORS.editor);
}

async function waitForConversion(trigger) {
  try {
    await page.waitForFunction(({ editor, errorMessage, trigger }) => {
      const view = window.qmHook.EditorView.findFromDOM(document.querySelector(editor));
      return !view.state.doc.toString().includes(trigger) || document.querySelector(errorMessage);
    }, { ...SELECTORS, trigger }, { timeout: CONVERSION_TIMEOUT_MS });
  } catch {}
  const error = page.locator(SELECTORS.errorMessage);
  if (await error.count()) console.log(`  editor message: ${await error.first().textContent()}`);
}

try {
  check(page.url().includes(projectId) && (await page.title()).includes(projectName), 'the open project is the one just created');
  await page.locator(SELECTORS.editor).first().waitFor({ timeout: 60000 });
  await page.waitForFunction(() => window.qmHook?.EditorView, null, { timeout: 30000 });
  const keys = await page.evaluate(() => window.qmHook.keys);
  console.log(`Overleaf CodeMirror exports: ${keys.join(', ')}`);
  const missing = ['Decoration', 'EditorView', 'StateEffect', 'StateField', 'ViewPlugin', 'isolateHistory'].filter((name) => !keys.includes(name));
  check(missing.length === 0, `the hook exports everything Quick Math uses${missing.length ? `; missing ${missing.join(', ')}` : ''}`);

  // Put the cursor at the start of the \end{document} line, then open a blank line above it.
  await page.evaluate((selector) => {
    const view = window.qmHook.EditorView.findFromDOM(document.querySelector(selector));
    const text = view.state.doc.toString();
    const at = text.lastIndexOf('\\end{document}');
    view.focus();
    view.dispatch({ selection: { anchor: at === -1 ? text.length : at } });
  }, SELECTORS.editor);
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');

  await page.keyboard.type(INLINE_TRIGGER);
  const sawPending = await page.locator(SELECTORS.pendingMark).first().waitFor({ timeout: 5000 }).then(() => true, () => false);
  check(sawPending, 'the pending mark shows on the inline trigger');
  await waitForConversion(INLINE_TRIGGER);
  const inline = (await editorText()).split('\n').find((line) => line.startsWith('Inline: '));
  check(/^Inline: \$[^$]+\$$/.test(inline ?? ''), `the inline trigger became $...$: ${inline}`);

  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(DISPLAY_TRIGGER);
  await waitForConversion(DISPLAY_TRIGGER);
  const text = await editorText();
  const display = text.match(/^\\\[\n(.+)\n\\\]$/m);
  check(Boolean(display), `the whole-line trigger became \\[...\\]: ${display ? display[1] : JSON.stringify(text.slice(-200))}`);
} finally {
  // Only the recorded project ID is ever sent. These are the endpoints the dashboard's Trash and Delete forever actions call.
  const deletion = await page.evaluate(async (id) => {
    const token = document.querySelector('meta[name="ol-csrfToken"]')?.content;
    const headers = { 'X-Csrf-Token': token, Accept: 'application/json' };
    const trash = await fetch(`/project/${id}/trash`, { method: 'POST', headers });
    const remove = await fetch(`/Project/${id}`, { method: 'DELETE', headers });
    const after = await fetch(`/project/${id}`, { redirect: 'manual' });
    return { trash: trash.status, remove: remove.status, after: after.status };
  }, projectId);
  check(deletion.trash < 300 && deletion.remove < 300, `trashed and deleted project ${projectId} (HTTP ${deletion.trash}, ${deletion.remove}; it now answers ${deletion.after})`);
  await context.close();
}
process.exit(status);
