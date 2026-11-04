import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [join(here, 'src/main.js')],
  outfile: join(here, 'main.js'),
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'es2022',
  // Obsidian supplies these at runtime; a second CodeMirror copy would break its instanceof checks.
  external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*'],
  logLevel: 'info',
});
