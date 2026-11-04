'use strict';

// Pane scripts run in a sandbox, but the pane's onload attribute resolves names on the window.
window.SubTeXtPane = {
  PREF: 'extensions.subtext.',
  OTHER: '__other__',

  init() {
    const { core } = Zotero.SubTeXt;
    this.$ = (id) => document.getElementById(id);
    this.initBackend(core);
    this.initModel(core);
    this.initApiKey();
    this.initClaudePath();
    this.initDelimiter(core);
    this.$('subtext-test').addEventListener('command', () => this.test());
  },

  initBackend({ BACKENDS, DEFAULT_BACKEND }) {
    const group = this.$('subtext-backend');
    for (const [id, backend] of Object.entries(BACKENDS)) {
      const radio = document.createXULElement('radio');
      radio.setAttribute('value', id);
      radio.setAttribute('label', backend.label);
      group.append(radio);
    }
    const current = Zotero.Prefs.get(this.PREF + 'backend', true);
    group.value = Object.hasOwn(BACKENDS, current) ? current : DEFAULT_BACKEND;
    group.addEventListener('command', () => {
      Zotero.Prefs.set(this.PREF + 'backend', group.value, true);
      this.showBackendSettings(group.value);
    });
    this.showBackendSettings(group.value);
  },

  showBackendSettings(backend) {
    for (const box of document.querySelectorAll('#subtext-pane [data-backend]')) box.hidden = box.dataset.backend !== backend;
  },

  initModel({ MODELS, DEFAULT_MODEL }) {
    const list = this.$('subtext-model');
    const custom = this.$('subtext-model-custom');
    for (const { id, label } of [...MODELS, { id: this.OTHER, label: 'Other model id' }]) {
      list.appendItem(label, id);
    }
    const current = Zotero.Prefs.get(this.PREF + 'model', true) || DEFAULT_MODEL;
    const known = MODELS.some((m) => m.id === current);
    list.value = known ? current : this.OTHER;
    custom.value = known ? '' : current;
    custom.hidden = known;
    list.addEventListener('command', () => {
      const other = list.value === this.OTHER;
      custom.hidden = !other;
      if (!other) Zotero.Prefs.set(this.PREF + 'model', list.value, true);
      else if (custom.value.trim()) Zotero.Prefs.set(this.PREF + 'model', custom.value.trim(), true);
    });
    custom.addEventListener('input', () => {
      Zotero.Prefs.set(this.PREF + 'model', custom.value.trim() || DEFAULT_MODEL, true);
    });
  },

  initApiKey() {
    const input = this.$('subtext-api-key');
    input.value = Zotero.SubTeXt.getApiKey();
    input.addEventListener('change', () => Zotero.SubTeXt.setApiKey(input.value.trim()));
  },

  async initClaudePath() {
    const detected = await Zotero.SubTeXt.detectClaudePath();
    this.$('subtext-claude-path').placeholder = detected || 'claude not found; enter its full path';
  },

  initDelimiter({ DEFAULT_DELIMITER }) {
    const input = this.$('subtext-delimiter');
    const hint = () => {
      const d = input.value.trim() || DEFAULT_DELIMITER;
      this.$('subtext-delimiter-hint').textContent = `Type ${d} x squared ${d} in a note to convert it.`;
    };
    input.placeholder = DEFAULT_DELIMITER;
    input.addEventListener('input', hint);
    input.addEventListener('syncfrompreference', hint);
    hint();
  },

  async test() {
    const button = this.$('subtext-test');
    const output = this.$('subtext-test-result');
    await Zotero.SubTeXt.setApiKey(this.$('subtext-api-key').value.trim());
    button.disabled = true;
    output.textContent = 'Converting...';
    const result = await Zotero.SubTeXt.convert({ input: this.$('subtext-test-input').value, context: '' });
    output.textContent = result.ok ? result.latex : `Error: ${result.error}`;
    output.style.color = result.ok ? '' : 'var(--accent-red, #d70022)';
    button.disabled = false;
  },
};
