// Native messaging frames each message as a 4-byte little-endian length followed by UTF-8 JSON.
import { runClaude } from './core/node/claude-cli.mjs';

async function handle(message) {
  const { input, model, claudePath } = message ?? {};
  if (typeof input !== 'string' || !input.trim() || typeof model !== 'string' || !model) {
    return { ok: false, error: 'The SubTeXt native host received a malformed request.' };
  }
  return runClaude(input, { model, claudePath: typeof claudePath === 'string' ? claudePath : '' });
}

function send(result) {
  const body = Buffer.from(JSON.stringify(result), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length);
  process.stdout.write(Buffer.concat([header, body]));
}

let buffered = Buffer.alloc(0);
let queue = Promise.resolve();

process.stdin.on('data', (chunk) => {
  buffered = Buffer.concat([buffered, chunk]);
  while (buffered.length >= 4 && buffered.length >= 4 + buffered.readUInt32LE(0)) {
    const length = buffered.readUInt32LE(0);
    const text = buffered.subarray(4, 4 + length).toString('utf8');
    buffered = buffered.subarray(4 + length);
    let message = null;
    try {
      message = JSON.parse(text);
    } catch {}
    queue = queue.then(() => handle(message)).then(send);
  }
});
