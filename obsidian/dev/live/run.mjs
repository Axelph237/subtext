// Usage: node obsidian/dev/live/run.mjs [work dir]. ONLY="01 04" picks scenarios; PLUGIN_FILES=<dir> tests a release folder.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PLUGIN_DIR, launch, trustVault } from './obsidian.mjs';
import * as lib from './lib.mjs';

const work = resolve(process.argv[2] || await mkdtemp(join(tmpdir(), 'subtext-obsidian-')));
execFileSync(process.execPath, [join(PLUGIN_DIR, 'esbuild.mjs')], { stdio: 'ignore' });

const scenarioDir = join(PLUGIN_DIR, 'dev/live/scenarios');
const only = process.env.ONLY?.split(/\s+/).filter(Boolean);
const scenarios = (await readdir(scenarioDir)).filter((f) => /^\d+-.*\.mjs$/.test(f)).sort()
  .filter((f) => !only || only.some((name) => f.startsWith(name)));

const obsidian = await launch({ work, pluginFiles: process.env.PLUGIN_FILES ? resolve(process.env.PLUGIN_FILES) : undefined });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => obsidian.close().finally(() => process.exit(130)));
let status = 0;
try {
  await trustVault(obsidian.page);
  for (const file of scenarios) {
    const fails = [];
    const check = (ok, message, detail) => { if (!ok) fails.push(detail === undefined ? message : `${message}: ${JSON.stringify(detail)}`); };
    const { default: scenario } = await import(join(scenarioDir, file));
    try {
      await lib.reset(obsidian.page);
      await scenario({ ...obsidian, ...lib, work, check, snap: (name) => lib.snap(obsidian.page, work, name) });
    } catch (e) {
      fails.push(e.stack || String(e));
    }
    console.log(`${fails.length ? 'FAIL' : 'PASS'} ${file}`);
    for (const fail of fails) console.log(`  - ${fail}`);
    if (fails.length) status = 1;
  }
} finally {
  await obsidian.close();
}
console.log(`screenshots and vault: ${work}`);
process.exit(status);
