import { PluginSettingTab, SecretComponent, Setting } from 'obsidian';
import { BACKENDS, DEFAULT_BACKEND, DEFAULT_MODEL, MODELS } from '../../core/subtext.mjs';
import { detectClaudePath } from '../../core/node/claude-cli.mjs';

// %% opens and closes an Obsidian comment, so the core default would never reach the plugin.
export const DEFAULT_DELIMITER = ';;';

const OTHER_MODEL = '__other__';
const SAMPLE = 'integral from 0 to infinity of e to the minus x squared';

export function parseSettings(data) {
  const text = (value) => (typeof value === 'string' ? value.trim() : '');
  return {
    backend: Object.hasOwn(BACKENDS, data?.backend) ? data.backend : DEFAULT_BACKEND,
    model: text(data?.model) || DEFAULT_MODEL,
    claudePath: text(data?.claudePath),
    delimiter: text(data?.delimiter) || DEFAULT_DELIMITER,
    apiKeySecret: text(data?.apiKeySecret),
  };
}

const BACKEND_SETTINGS = {
  'claude-code'(tab, containerEl) {
    new Setting(containerEl)
      .setName('Path to the claude CLI')
      .setDesc('Leave empty to find it automatically. SubTeXt uses your Claude Code login.')
      .addText((text) => {
        text.setValue(tab.plugin.settings.claudePath).onChange((value) => tab.plugin.updateSettings({ claudePath: value }));
        // Obsidian components have a then() method, so a callback must not return one into a promise chain.
        detectClaudePath().then((path) => { text.setPlaceholder(path || 'claude not found; enter its full path'); });
      });
  },

  anthropic(tab, containerEl) {
    new Setting(containerEl)
      .setName('Anthropic API key')
      .setDesc('Stored in Obsidian\'s secret storage, not in the plugin\'s data.json.')
      .addComponent((el) => new SecretComponent(tab.app, el)
        .setValue(tab.plugin.settings.apiKeySecret)
        .onChange((id) => tab.plugin.updateSettings({ apiKeySecret: id })));
  },
};

export class SubTeXtSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.otherModel = false;
  }

  display() {
    const { containerEl, plugin } = this;
    const { settings } = plugin;
    containerEl.empty();
    this.otherModel ||= !MODELS.some((m) => m.id === settings.model);

    new Setting(containerEl)
      .setName('Convert with')
      .addDropdown((dropdown) => {
        for (const [id, backend] of Object.entries(BACKENDS)) dropdown.addOption(id, backend.label);
        dropdown.setValue(settings.backend).onChange(async (value) => {
          await plugin.updateSettings({ backend: value });
          this.display();
        });
      });

    new Setting(containerEl)
      .setName('Model')
      .addDropdown((dropdown) => {
        for (const { id, label } of MODELS) dropdown.addOption(id, label);
        dropdown.addOption(OTHER_MODEL, 'Other model id');
        dropdown.setValue(this.otherModel ? OTHER_MODEL : settings.model).onChange(async (value) => {
          this.otherModel = value === OTHER_MODEL;
          if (!this.otherModel) await plugin.updateSettings({ model: value });
          this.display();
        });
      });
    if (this.otherModel) {
      new Setting(containerEl)
        .setName('Model id')
        .addText((text) => text.setPlaceholder(DEFAULT_MODEL).setValue(settings.model)
          .onChange((value) => plugin.updateSettings({ model: value })));
    }

    BACKEND_SETTINGS[settings.backend](this, containerEl);

    new Setting(containerEl)
      .setName('Delimiter')
      .setDesc('The text that opens and closes a trigger. Avoid %%, which starts an Obsidian comment.')
      .addText((text) => text.setPlaceholder(DEFAULT_DELIMITER).setValue(settings.delimiter)
        .onChange((value) => plugin.updateSettings({ delimiter: value })));

    let sample = SAMPLE;
    const test = new Setting(containerEl)
      .setName('Test')
      .setDesc('Convert this text with the settings above.')
      .addText((text) => text.setValue(sample).onChange((value) => { sample = value; }))
      .addButton((button) => button.setButtonText('Test').onClick(async () => {
        button.setDisabled(true);
        result.setText('Converting...');
        result.toggleClass('mod-warning', false);
        const outcome = await plugin.convert({ input: sample, context: '' });
        result.setText(outcome.ok ? outcome.latex : `Error: ${outcome.error}`);
        result.toggleClass('mod-warning', !outcome.ok);
        button.setDisabled(false);
      }));
    const result = test.infoEl.createDiv({ cls: 'subtext-test-result' });
  }
}
