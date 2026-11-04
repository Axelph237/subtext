import { execFile, spawn } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKENDS } from '../quickmath.mjs';

const TIMEOUT_MS = 60000;
const MISSING = 'Could not find the claude CLI. Set its path in the Quick Math settings.';

async function isExecutable(path) {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function loginShellLookup() {
  return new Promise((resolve) => {
    execFile(process.env.SHELL || '/bin/zsh', ['-lc', 'command -v claude'], { timeout: 10000 }, (error, stdout) => {
      resolve(error ? '' : stdout.trim().split('\n').pop());
    });
  });
}

// GUI apps do not inherit the shell PATH, so look where installers put claude, then ask a login shell.
export async function detectClaudePath() {
  for (const path of [join(homedir(), '.local/bin/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude']) {
    if (await isExecutable(path)) return path;
  }
  const path = await loginShellLookup();
  return path?.startsWith('/') && await isExecutable(path) ? path : '';
}

export async function runClaude(input, { model, claudePath, timeoutMs = TIMEOUT_MS }) {
  const command = claudePath || await detectClaudePath();
  if (!command) return { ok: false, error: MISSING };
  const backend = BACKENDS['claude-code'];
  return new Promise((resolve) => {
    const child = spawn(command, backend.buildArgs({ model }), { cwd: tmpdir() });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, error: `The claude CLI did not answer within ${timeoutMs / 1000} seconds.` });
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve(error.code === 'ENOENT' ? { ok: false, error: MISSING } : { ok: false, error: `Could not run ${command}: ${error.message}` });
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      if (!stdout.trim()) {
        resolve({ ok: false, error: stderr.trim() || `${command} exited with code ${exitCode} and printed nothing.` });
        return;
      }
      resolve(backend.parseOutput(stdout));
    });
    // A CLI that exits before reading stdin raises EPIPE here; its exit code and stderr already explain the failure.
    child.stdin.on('error', () => {});
    child.stdin.end(backend.stdinFor(input));
  });
}
