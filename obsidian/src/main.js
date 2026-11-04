import { Notice, Plugin, requestUrl } from 'obsidian';
import { BACKENDS } from '../../core/subtext.mjs';
import { runClaude } from '../../core/node/claude-cli.mjs';
import { subtextExtension } from './editor.js';
import { SubTeXtSettingTab, parseSettings } from './settings.js';

const TRANSPORTS = {
  'claude-code'(backend, settings, input) {
    return runClaude(input, { model: settings.model, claudePath: settings.claudePath });
  },

  async anthropic(backend, settings, input, app) {
    const apiKey = settings.apiKeySecret && app.secretStorage.getSecret(settings.apiKeySecret);
    if (!apiKey) return { ok: false, error: 'No Anthropic API key is set. Choose one in Settings > SubTeXt.' };
    const { url, init } = backend.buildRequest({ model: settings.model, apiKey }, input);
    let response;
    try {
      response = await requestUrl({ url, method: init.method, headers: init.headers, body: init.body, throw: false });
    } catch (e) {
      return { ok: false, error: `Could not reach the Anthropic API: ${e.message || e}` };
    }
    let json;
    try {
      json = response.json;
    } catch {
      return { ok: false, error: `The Anthropic API returned HTTP ${response.status} without JSON.` };
    }
    return backend.parseResponse(json);
  },
};

export default class SubTeXtPlugin extends Plugin {
  async onload() {
    this.settings = parseSettings(await this.loadData());
    this.addSettingTab(new SubTeXtSettingTab(this.app, this));
    this.registerEditorExtension(subtextExtension({
      delimiter: () => this.settings.delimiter,
      convert: (input) => this.convert(input),
      notify: (error) => new Notice(`SubTeXt could not convert: ${error}`, 8000),
    }));
  }

  async updateSettings(patch) {
    this.settings = parseSettings({ ...this.settings, ...patch });
    await this.saveData(this.settings);
  }

  async convert(input) {
    const { settings } = this;
    try {
      return await TRANSPORTS[settings.backend](BACKENDS[settings.backend], settings, input, this.app);
    } catch (e) {
      console.error('SubTeXt:', e);
      return { ok: false, error: String(e.message || e) };
    }
  }
}
