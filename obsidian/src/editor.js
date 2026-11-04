import { isolateHistory } from '@codemirror/commands';
import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { FORMATS, findTrigger } from '../../core/quickmath.mjs';

// Each pending conversion is one mark decoration whose spec carries { id, text }.
// Mapping the set through every change keeps each range on its trigger text while the user types.
const addPending = StateEffect.define();
const removePending = StateEffect.define();

const pendingField = StateField.define({
  create: () => Decoration.none,
  update(marks, tr) {
    marks = marks.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(addPending)) {
        const { id, from, to, text } = effect.value;
        const mark = Decoration.mark({ class: 'quick-math-pending', attributes: { title: 'Converting to LaTeX' }, id, text });
        marks = marks.update({ add: [mark.range(from, to)] });
      } else if (effect.is(removePending)) {
        marks = marks.update({ filter: (from, to, mark) => mark.spec.id !== effect.value });
      }
    }
    return marks;
  },
  provide: (field) => EditorView.decorations.from(field),
});

// Empty once the plugin is disabled (its field is gone) or the editor was given another file's state.
function* pendingEntries(state) {
  for (let cursor = state.field(pendingField, false)?.iter(); cursor?.value; cursor.next()) {
    yield { id: cursor.value.spec.id, from: cursor.from, to: cursor.to, text: cursor.value.spec.text };
  }
}

function findPending(state, id) {
  return pendingEntries(state).find((entry) => entry.id === id);
}

function replacement(state, entry, latex) {
  const line = state.doc.lineAt(entry.from);
  if (entry.to <= line.to && line.text.trim() === entry.text) {
    return { from: line.from, to: line.to, insert: FORMATS.markdown.display(latex) };
  }
  return { from: entry.from, to: entry.to, insert: FORMATS.markdown.inline(latex) };
}

let nextId = 1;

async function convertTrigger(view, { delimiter, convert, notify }) {
  const { state } = view;
  if (state.selection.ranges.length > 1 || !state.selection.main.empty) return;
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  const trigger = findTrigger(line.text.slice(0, head - line.from), delimiter());
  if (!trigger) return;
  const from = line.from + trigger.start;
  const to = line.from + trigger.end;
  if (pendingEntries(state).some((entry) => entry.from === from && entry.to === to)) return;
  const id = nextId++;
  view.dispatch({ effects: addPending.of({ id, from, to, text: state.sliceDoc(from, to) }) });

  const result = await convert(trigger.input);
  if (!view.dom.isConnected) return;
  const entry = findPending(view.state, id);
  if (!entry) return;
  if (!result.ok) {
    view.dispatch({ effects: removePending.of(id) });
    notify(result.error);
    return;
  }
  // An edit inside the trigger makes the result stale; the edited text stays as typed.
  if (view.state.sliceDoc(entry.from, entry.to) !== entry.text) {
    view.dispatch({ effects: removePending.of(id) });
    return;
  }
  view.dispatch({
    changes: replacement(view.state, entry, result.latex),
    effects: removePending.of(id),
    annotations: isolateHistory.of('full'),
  });
}

export function quickMathExtension(options) {
  return [
    pendingField,
    EditorView.updateListener.of((update) => {
      if (!update.transactions.some((tr) => tr.isUserEvent('input'))) return;
      // A dispatch from inside an update listener would start a nested update.
      queueMicrotask(() => convertTrigger(update.view, options));
    }),
  ];
}
