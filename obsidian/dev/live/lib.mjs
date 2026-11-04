import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const DEFAULTS = { backend: 'claude-code', model: 'claude-haiku-5-5', claudePath: '', delimiter: ';;', contextChars: 2000, apiKeySecret: '' };

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function until(fn, timeout = 30000, step = 100) {
  for (const end = Date.now() + timeout; Date.now() < end; await wait(step)) {
    if (await fn()) return true;
  }
  return Boolean(await fn());
}

export async function reset(page, patch = {}) {
  await page.evaluate(async (settings) => {
    const plugin = app.plugins.plugins['subtext'];
    await plugin.updateSettings(settings);
    for (const notice of document.querySelectorAll('.notice')) notice.click();
    app.changeTheme('moonstone');
    window.stxFinished = 0;
    if (!plugin.convert.instrumented) {
      const convert = plugin.convert;
      plugin.convert = async (conversion) => {
        const result = await convert.call(plugin, conversion);
        window.stxFinished++;
        return result;
      };
      plugin.convert.instrumented = true;
    }
  }, { ...DEFAULTS, ...patch });
}

export async function openNote(page, name, content) {
  await page.evaluate(async ({ name, content }) => {
    const file = await app.vault.create(name, content);
    await app.workspace.getLeaf(false).openFile(file);
    const { editor } = app.workspace.activeEditor;
    editor.focus();
    const last = editor.lastLine();
    editor.setCursor(last, editor.getLine(last).length);
  }, { name, content });
}

export const typeText = (page, text) => page.keyboard.type(text, { delay: 15 });
export const editorText = (page) => page.evaluate(() => app.workspace.activeEditor.editor.getValue());
export const pendingMarks = (page) => page.evaluate(() => document.querySelectorAll('.subtext-pending').length);
export const finished = (page) => page.evaluate(() => window.stxFinished);
export const notices = (page) => page.evaluate(() => [...document.querySelectorAll('.notice')].map((n) => n.innerText));
export const setTheme = (page, theme) => page.evaluate((t) => app.changeTheme(t), theme);

// Stands in for the claude CLI and records the message it receives. It names node by absolute path,
// because Obsidian may not have the shell PATH.
export async function stubClaude(work) {
  const path = join(work, 'stub-claude');
  const stdinPath = join(work, 'stub-stdin.txt');
  await rm(stdinPath, { force: true });
  await writeFile(path, `#!${process.execPath}
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(stdinPath)}, fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify({ type: 'result', is_error: false, stop_reason: 'end_turn', result: 'x' }));
`, { mode: 0o755 });
  return { path, stdin: () => readFile(stdinPath, 'utf8') };
}

// Obsidian writes the note a couple of seconds after the last edit.
export async function diskText(vault, name, expect) {
  let text = '';
  await until(async () => expect(text = await readFile(join(vault, name), 'utf8')), 10000, 250);
  return text;
}

export async function snap(page, work, name) {
  await wait(150);
  const cdp = await page.context().newCDPSession(page);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await cdp.detach();
  const path = join(work, `${name}.png`);
  await writeFile(path, Buffer.from(data, 'base64'));
  return path;
}
