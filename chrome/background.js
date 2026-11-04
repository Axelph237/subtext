import { BACKENDS, MAX_CONTEXT_CHARS } from './core/subtext.mjs';
import { TAG } from './protocol.js';
import { loadSettings } from './settings.js';

const NATIVE_HOST = 'com.aidenking.subtext';
const NO_HOST = 'The SubTeXt native host is not installed. Run chrome/native-host/install.sh from the SubTeXt folder.';

const TRANSPORTS = {
  async anthropic(backend, settings, conversion) {
    if (!settings.apiKey) return { ok: false, error: 'No Anthropic API key is set. Add one in the SubTeXt options.' };
    const { url, init } = backend.buildRequest({ model: settings.model, apiKey: settings.apiKey }, conversion);
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

  async 'claude-code'(backend, settings, { input, context }) {
    let result;
    try {
      result = await chrome.runtime.sendNativeMessage(NATIVE_HOST, { input, context, model: settings.model, claudePath: settings.claudePath });
    } catch (e) {
      return { ok: false, error: /not found/i.test(e.message) ? NO_HOST : `The SubTeXt native host failed: ${e.message}` };
    }
    return typeof result?.ok === 'boolean' ? result : { ok: false, error: 'The SubTeXt native host sent an unexpected reply.' };
  },
};

const METHODS = {
  async convert({ input, context }) {
    if (typeof input !== 'string' || !input.trim()) return { ok: false, error: 'There is no math to convert.' };
    if (typeof context !== 'string') return { ok: false, error: 'The page sent context that is not text.' };
    const settings = await loadSettings();
    try {
      return await TRANSPORTS[settings.backend](BACKENDS[settings.backend], settings, { input, context: context.slice(-MAX_CONTEXT_CHARS) });
    } catch (e) {
      console.error(e);
      return { ok: false, error: String(e.message || e) };
    }
  },

  // Pages get the trigger settings only, never the API key.
  async settings() {
    const { delimiter, contextChars } = await loadSettings();
    return { delimiter, contextChars };
  },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.tag !== TAG || !Object.hasOwn(METHODS, message.method)) return false;
  METHODS[message.method](message.params ?? {}).then(sendResponse);
  return true;
});
