import { BACKENDS, DEFAULT_DELIMITER, DEFAULT_MODEL, MODELS } from './core/quickmath.mjs';
import { TAG } from './protocol.js';
import { loadSettings } from './settings.js';

const OTHER = '__other__';
const $ = (id) => document.getElementById(id);

let saving = Promise.resolve();
function save(key, value) {
  saving = chrome.storage.local.set({ [key]: value.trim() });
}

function showBackendSettings(backend) {
  for (const section of document.querySelectorAll('[data-backend]')) section.hidden = section.dataset.backend !== backend;
}

function initBackend(current) {
  const fieldset = $('backend');
  for (const [id, { label }] of Object.entries(BACKENDS)) {
    const option = document.createElement('label');
    const radio = Object.assign(document.createElement('input'), { type: 'radio', name: 'backend', value: id, checked: id === current });
    option.append(radio, label);
    fieldset.append(option);
  }
  fieldset.addEventListener('change', (event) => {
    save('backend', event.target.value);
    showBackendSettings(event.target.value);
  });
  showBackendSettings(current);
}

function initModel(current) {
  const select = $('model');
  const custom = $('model-custom');
  for (const { id, label } of [...MODELS, { id: OTHER, label: 'Other model id' }]) select.append(new Option(label, id));
  const known = MODELS.some((model) => model.id === current);
  select.value = known ? current : OTHER;
  custom.value = known ? '' : current;
  custom.hidden = known;
  select.addEventListener('change', () => {
    const other = select.value === OTHER;
    custom.hidden = !other;
    if (!other) save('model', select.value);
    else if (custom.value.trim()) save('model', custom.value);
  });
  custom.addEventListener('input', () => save('model', custom.value || DEFAULT_MODEL));
}

function initText(id, key, value) {
  const input = $(id);
  input.value = value;
  input.addEventListener('input', () => save(key, input.value));
}

function initDelimiter(current) {
  const input = $('delimiter');
  const hint = () => {
    const delimiter = input.value.trim() || DEFAULT_DELIMITER;
    $('delimiter-hint').textContent = `Type ${delimiter} x squared ${delimiter} in an Overleaf project to convert it.`;
  };
  input.placeholder = DEFAULT_DELIMITER;
  initText('delimiter', 'delimiter', current);
  input.addEventListener('input', hint);
  hint();
}

async function test() {
  const button = $('test');
  const output = $('test-result');
  button.disabled = true;
  output.className = '';
  output.textContent = 'Converting...';
  await saving;
  const result = await chrome.runtime.sendMessage({ tag: TAG, id: crypto.randomUUID(), method: 'convert', params: { input: $('test-input').value } });
  output.textContent = result.ok ? result.latex : `Error: ${result.error}`;
  output.className = result.ok ? '' : 'error';
  button.disabled = false;
}

const settings = await loadSettings();
initBackend(settings.backend);
initModel(settings.model);
initText('api-key', 'apiKey', settings.apiKey);
initText('claude-path', 'claudePath', settings.claudePath);
initDelimiter(settings.delimiter);
$('test').addEventListener('click', test);
