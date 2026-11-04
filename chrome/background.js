import { BACKENDS } from './core/quickmath.mjs';
import { TAG } from './protocol.js';
import { loadSettings } from './settings.js';

const NATIVE_HOST = 'com.aidenking.quickmath';
const NO_HOST = 'The Quick Math native host is not installed. Run chrome/native-host/install.sh from the Quick Math folder.';

const TRANSPORTS = {
  async anthropic(backend, settings, input) {
    if (!settings.apiKey) return { ok: false, error: 'No Anthropic API key is set. Add one in the Quick Math options.' };
    const { url, init } = backend.buildRequest({ model: settings.model, apiKey: settings.apiKey }, input);
    let response;
    try {
      response = await fetch(url, init);
    } catch (e) {
      return { ok: false, error: `Could not reach the Anthropic API: ${e.message}` };
    }
    let json;
    try {
      json = await response.json();
    } catch {
      return { ok: false, error: `The Anthropic API returned HTTP ${response.status} without JSON.` };
    }
    return backend.parseResponse(json);
  },

  async 'claude-code'(backend, settings, input) {
    let result;
    try {
      result = await chrome.runtime.sendNativeMessage(NATIVE_HOST, { input, model: settings.model, claudePath: settings.claudePath });
    } catch (e) {
      return { ok: false, error: /not found/i.test(e.message) ? NO_HOST : `The Quick Math native host failed: ${e.message}` };
    }
    return typeof result?.ok === 'boolean' ? result : { ok: false, error: 'The Quick Math native host sent an unexpected reply.' };
  },
};

const METHODS = {
  async convert({ input }) {
    if (typeof input !== 'string' || !input.trim()) return { ok: false, error: 'There is no math to convert.' };
    const settings = await loadSettings();
    try {
      return await TRANSPORTS[settings.backend](BACKENDS[settings.backend], settings, input);
    } catch (e) {
      console.error(e);
      return { ok: false, error: String(e.message || e) };
    }
  },

  // Pages get the delimiter only, never the API key.
  async settings() {
    const { delimiter } = await loadSettings();
    return { delimiter };
  },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.tag !== TAG || !Object.hasOwn(METHODS, message.method)) return false;
  METHODS[message.method](message.params ?? {}).then(sendResponse);
  return true;
});
