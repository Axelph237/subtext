import { BACKENDS, DEFAULT_BACKEND, DEFAULT_DELIMITER, DEFAULT_MODEL } from './core/subtext.mjs';

const KEYS = ['backend', 'model', 'apiKey', 'claudePath', 'delimiter'];

export async function loadSettings() {
  const stored = await chrome.storage.local.get(KEYS);
  const text = (key) => (typeof stored[key] === 'string' ? stored[key].trim() : '');
  return {
    backend: Object.hasOwn(BACKENDS, text('backend')) ? text('backend') : DEFAULT_BACKEND,
    model: text('model') || DEFAULT_MODEL,
    apiKey: text('apiKey'),
    claudePath: text('claudePath'),
    delimiter: text('delimiter') || DEFAULT_DELIMITER,
  };
}
