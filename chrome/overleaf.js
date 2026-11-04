// Runs in the page's MAIN world, where Overleaf's editor hook fires. build.sh bundles this file with core.
import { DEFAULT_DELIMITER, FORMATS, findTrigger } from './core/subtext.mjs';
import { TAG } from './protocol.js';

const REQUIRED_EXPORTS = ['Decoration', 'EditorView', 'StateEffect', 'StateField', 'ViewPlugin', 'isolateHistory'];
const ANSWER_TIMEOUT_MS = 90000;
const ERROR_MS = 6000;
const HOOK_GRACE_MS = 15000;

let delimiter = DEFAULT_DELIMITER;
const callbacks = new Map();

function send(method, params, callback) {
  const id = crypto.randomUUID();
  callbacks.set(id, callback);
  window.postMessage({ tag: TAG, id, method, params }, location.origin);
  return id;
}

window.addEventListener('message', (event) => {
  const { data } = event;
  if (event.source !== window || data?.tag !== TAG || !('result' in data)) return;
  callbacks.get(data.id)?.(data.result);
});

function convert(input) {
  return new Promise((resolve) => {
    const done = (result) => {
      callbacks.delete(id);
      clearTimeout(timer);
      resolve(result);
    };
    const id = send('convert', { input }, done);
    const timer = setTimeout(() => done({ ok: false, error: 'No answer from the extension. Reload the page and try again.' }), ANSWER_TIMEOUT_MS);
  });
}

function triggerAtCursor(state) {
  const { main } = state.selection;
  if (!main.empty) return null;
  const line = state.doc.lineAt(main.head);
  const trigger = findTrigger(line.text.slice(0, main.head - line.from), delimiter);
  return trigger && { from: line.from + trigger.start, to: line.from + trigger.end, input: trigger.input };
}

// An edit inside a pending trigger drops it, because the result would overwrite that edit.
// Edits that only touch its ends leave it in place.
function mapEntry(entry, changes) {
  let edited = false;
  changes.iterChangedRanges((fromA, toA) => {
    if (fromA < entry.to && toA > entry.from) edited = true;
  });
  return edited ? null : { ...entry, from: changes.mapPos(entry.from, 1), to: changes.mapPos(entry.to, -1) };
}

function isDark(view) {
  const [r, g, b] = getComputedStyle(view.contentDOM).color.match(/\d+(\.\d+)?/g).map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 128;
}

function showError(view, pos, message) {
  const note = document.createElement('div');
  note.className = 'stx-error';
  note.setAttribute('role', 'alert');
  note.textContent = `SubTeXt: ${message}`;
  view.scrollDOM.append(note);
  view.requestMeasure({
    read: () => ({ at: view.coordsAtPos(pos), box: view.scrollDOM.getBoundingClientRect(), dark: isDark(view) }),
    write: ({ at, box, dark }) => {
      const { scrollLeft, scrollTop } = view.scrollDOM;
      note.style.left = `${(at ? at.left - box.left : 8) + scrollLeft}px`;
      note.style.top = `${(at ? at.bottom - box.top + 4 : 8) + scrollTop}px`;
      note.classList.toggle('stx-dark', dark);
    },
  });
  setTimeout(() => note.remove(), ERROR_MS);
}

function subtext(CodeMirror) {
  const missing = REQUIRED_EXPORTS.filter((name) => !CodeMirror?.[name]);
  if (missing.length) {
    console.warn(`SubTeXt is off: Overleaf's editor hook does not export ${missing.join(', ')}.`);
    return [];
  }
  const { Decoration, EditorView, StateEffect, StateField, ViewPlugin, isolateHistory } = CodeMirror;

  const addPending = StateEffect.define({ map: (entry, changes) => mapEntry(entry, changes) ?? undefined });
  const removePending = StateEffect.define();
  const pendingMark = Decoration.mark({ class: 'stx-pending', attributes: { title: 'SubTeXt is converting this to LaTeX' } });

  // Each entry is one conversion in flight: { id, from, to }, mapped through every change.
  const pending = StateField.define({
    create: () => [],
    update(entries, tr) {
      let next = tr.docChanged ? entries.map((entry) => mapEntry(entry, tr.changes)).filter(Boolean) : entries;
      for (const effect of tr.effects) {
        if (effect.is(addPending)) next = [...next, effect.value];
        if (effect.is(removePending)) next = next.filter((entry) => entry.id !== effect.value);
      }
      return next;
    },
    provide: (field) => EditorView.decorations.from(field, (entries) => Decoration.set(entries.map(({ from, to }) => pendingMark.range(from, to)), true)),
  });

  function replacement(state, { id, from, to }, latex) {
    const line = state.doc.lineAt(from);
    const alone = !line.text.slice(0, from - line.from).trim() && !line.text.slice(to - line.from).trim();
    return {
      changes: { from, to, insert: FORMATS.latex[alone ? 'display' : 'inline'](latex) },
      effects: removePending.of(id),
      annotations: isolateHistory.of('full'),
      userEvent: 'input.subtext',
    };
  }

  let nextId = 1;
  const detector = ViewPlugin.define((view) => {
    let live = true;

    async function start(doc, { from, to, input }) {
      if (!live || view.state.doc !== doc) return;
      if (view.state.field(pending).some((entry) => entry.from < to && entry.to > from)) return;
      const id = nextId++;
      view.dispatch({ effects: addPending.of({ id, from, to }) });
      const result = await convert(input);
      const entry = live && (view.state.field(pending, false) ?? []).find((e) => e.id === id);
      if (!entry) return;
      if (result?.ok) {
        view.dispatch(replacement(view.state, entry, result.latex));
      } else {
        view.dispatch({ effects: removePending.of(id) });
        showError(view, entry.from, result?.error || 'The conversion failed.');
      }
    }

    return {
      update(update) {
        if (!update.docChanged || !update.transactions.some((tr) => tr.isUserEvent('input.type'))) return;
        const trigger = triggerAtCursor(update.state);
        // A view cannot dispatch while it is applying an update.
        if (trigger) queueMicrotask(() => start(update.state.doc, trigger));
      },
      destroy() {
        live = false;
      },
    };
  });

  const theme = EditorView.baseTheme({
    '.stx-pending': {
      backgroundColor: 'rgba(56, 132, 255, 0.2)',
      borderBottom: '2px dotted rgb(56, 132, 255)',
      animation: 'stx-pulse 0.9s ease-in-out infinite alternate',
    },
    '@keyframes stx-pulse': {
      from: { backgroundColor: 'rgba(56, 132, 255, 0.12)' },
      to: { backgroundColor: 'rgba(56, 132, 255, 0.34)' },
    },
    '.stx-error': {
      position: 'absolute',
      zIndex: 10,
      maxWidth: 'min(44em, 80%)',
      padding: '3px 9px',
      borderRadius: '4px',
      font: '500 12px/18px system-ui, sans-serif',
      whiteSpace: 'pre-wrap',
      pointerEvents: 'none',
      color: '#8a1c13',
      backgroundColor: '#fdecea',
      border: '1px solid #f0b4ad',
      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)',
    },
    '.stx-error.stx-dark': {
      color: '#ffd2cc',
      backgroundColor: '#4a2220',
      border: '1px solid #7d3a35',
      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.5)',
    },
  });

  return [pending, detector, theme];
}

let extension = null;

window.addEventListener('UNSTABLE_editor:extensions', (event) => {
  const { CodeMirror, extensions } = event.detail;
  if (!extension) {
    console.debug('SubTeXt: CodeMirror exports from Overleaf:', Object.keys(CodeMirror ?? {}).sort().join(', '));
    // Built once, so Overleaf's later re-dispatches reconfigure with the same field and keep pending conversions.
    extension = subtext(CodeMirror);
    send('settings', {}, (result) => {
      if (typeof result?.delimiter === 'string') delimiter = result.delimiter;
    });
  }
  extensions.push(extension);
});

window.addEventListener('load', () => {
  setTimeout(() => {
    if (!extension) console.info('SubTeXt is off: Overleaf never fired its editor hook, UNSTABLE_editor:extensions.');
  }, HOOK_GRACE_MS);
}, { once: true });
