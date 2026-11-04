// Starts a throwaway Obsidian with its own user data dir and scratch vault, and connects Playwright over CDP.
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { constants, copyFile, mkdir, rename, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { chromium } from 'playwright-core';

const OBSIDIAN_APP = process.env.OBSIDIAN_APP || '/Applications/Obsidian.app';
const VERSION = process.env.OBSIDIAN_VERSION || '1.13.4';
export const PLUGIN_DIR = join(dirname(fileURLToPath(import.meta.url)), '../..');

// The app bundle can ship an older obsidian.asar; installs run newer versions from an asar the updater
// saved in the user data dir. Fetch the same release, check GitHub's digest, and place it there.
async function appPackage(cacheDir) {
  const asar = join(cacheDir, `obsidian-${VERSION}.asar`);
  if (existsSync(asar)) return asar;
  await mkdir(cacheDir, { recursive: true });
  const release = await (await fetch(`https://api.github.com/repos/obsidianmd/obsidian-releases/releases/tags/v${VERSION}`)).json();
  const asset = release.assets?.find((a) => a.name === `obsidian-${VERSION}.asar.gz`);
  if (!asset?.digest) throw new Error(`no asar asset with a digest for Obsidian ${VERSION}`);
  const gz = await fetch(asset.browser_download_url);
  const bytes = Buffer.from(await gz.arrayBuffer());
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (digest !== asset.digest) throw new Error(`digest mismatch for ${asset.name}: ${digest} != ${asset.digest}`);
  await writeFile(`${asar}.gz`, bytes);
  await pipeline(createReadStream(`${asar}.gz`), createGunzip(), createWriteStream(`${asar}.tmp`));
  await rename(`${asar}.tmp`, asar);
  return asar;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    }).on('error', reject);
  });
}

async function writeVault(vault, pluginFiles) {
  const plugin = join(vault, '.obsidian/plugins/quick-math');
  await mkdir(plugin, { recursive: true });
  // Link each file rather than the directory, so the plugin's data.json lands in the scratch vault.
  for (const name of ['main.js', 'manifest.json', 'styles.css']) await symlink(join(pluginFiles, name), join(plugin, name));
  await writeFile(join(vault, '.obsidian/community-plugins.json'), JSON.stringify(['quick-math']));
  // Obsidian 1.13 opens Settings in its own window by default. A hidden popout stops painting, which stalls
  // screenshots and CDP attach, and it takes over activeWindow, where notices appear. Keep Settings a modal.
  await writeFile(join(vault, '.obsidian/app.json'), JSON.stringify({ settingsPopoutWindow: false }));
}

export async function launch({ work, pluginFiles = PLUGIN_DIR, cacheDir = process.env.QM_CACHE || join(tmpdir(), 'quick-math-obsidian-cache') }) {
  const userData = join(work, 'user-data');
  const vault = join(work, 'vault');
  await mkdir(userData, { recursive: true });
  await writeVault(vault, pluginFiles);
  await copyFile(await appPackage(cacheDir), join(userData, `obsidian-${VERSION}.asar`), constants.COPYFILE_FICLONE);
  const vaultId = randomBytes(8).toString('hex');
  await writeFile(join(userData, 'obsidian.json'), JSON.stringify({
    vaults: { [vaultId]: { path: vault, ts: Date.now(), open: true } },
    updateDisabled: true,
  }));

  const port = await freePort();
  // open -g keeps the window behind the app you are using, so your keystrokes never land in it.
  // A background window must keep painting and running timers for screenshots and typing to work.
  execFileSync('open', ['-g', '-n', '-a', OBSIDIAN_APP, '--args',
    `--user-data-dir=${userData}`, `--remote-debugging-port=${port}`,
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling']);
  // Every process of this instance carries its own --user-data-dir; nothing else on the machine does.
  const kill = () => {
    try { execFileSync('pkill', ['-f', '--', `--user-data-dir=${userData}`]); } catch {}
  };

  let browser;
  for (let i = 0; i < 100 && !browser; i++) {
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  if (!browser) { kill(); throw new Error('Obsidian did not open its debugging port'); }
  let page;
  for (let i = 0; i < 100 && !page; i++) {
    page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith('app://'));
    if (!page) await new Promise((r) => setTimeout(r, 200));
  }
  if (!page) { kill(); throw new Error('no Obsidian window'); }
  // The window never gets OS focus, so tell the page it has it, as a frontmost window would.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.waitForFunction(() => window.app?.workspace?.layoutReady, null, { timeout: 30000 });

  const close = async () => {
    await browser.close().catch(() => {});
    kill();
  };
  return { browser, page, vault, userData, vaultId, port, close };
}

// A vault with community plugins asks once whether to trust its author. Accepting turns restricted mode
// off for this vault (localStorage enable-plugin-<appId>), loads the plugins in community-plugins.json,
// and opens Settings on the community plugins tab.
export async function trustVault(page) {
  const modal = page.locator('.modal.mod-trust-folder');
  await modal.waitFor({ timeout: 15000 });
  await modal.locator('button:not(.mod-cancel)').click();
  await page.waitForFunction(() => window.app.plugins.plugins['quick-math'], null, { timeout: 15000 });
  await page.locator('.modal.mod-settings').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('.modal.mod-settings').waitFor({ state: 'detached' });
}
