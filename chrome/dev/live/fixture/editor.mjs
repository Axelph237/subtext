// A stand-in for Overleaf's source editor. It hands extensions the same CodeMirror exports as
// services/web/frontend/js/features/source-editor/extensions/bundle.ts, and fires the hook
// before building the editor, as third-party-extensions.ts does.
import { ChangeSet, Compartment, EditorSelection, EditorState, Prec, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, drawSelection, hoverTooltip, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, invertedEffects, isolateHistory, redo, undo } from '@codemirror/commands';
import { HighlightStyle, StreamLanguage, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { tags } from '@lezer/highlight';

const CodeMirror = {
  ChangeSet, Decoration, EditorSelection, EditorView, Prec, StateEffect, StateField, ViewPlugin, WidgetType,
  hoverTooltip, keymap, syntaxTree, undo, redo, invertedEffects, isolateHistory,
};

const thirdPartyExtensionsConf = new Compartment();

function collectExtensions() {
  const extensions = [];
  window.dispatchEvent(new CustomEvent('UNSTABLE_editor:extensions', { detail: { CodeMirror, extensions } }));
  return extensions;
}

const extensionLoaded = ViewPlugin.define((view) => {
  const listener = () => view.dispatch({ effects: thirdPartyExtensionsConf.reconfigure(collectExtensions()) });
  window.addEventListener('editor:extension-loaded', listener);
  return { destroy: () => window.removeEventListener('editor:extension-loaded', listener) };
});

const latex = StreamLanguage.define({
  token(stream) {
    if (stream.match(/%.*/)) return 'comment';
    if (stream.match(/\\[a-zA-Z]+/)) return 'keyword';
    if (stream.match(/[{}[\]]/)) return 'bracket';
    stream.next();
    return null;
  },
});

// Rough copies of Overleaf's default light (textmate) and dark (overleaf_dark) editor themes.
const THEMES = {
  light: {
    dark: false,
    colors: { background: '#ffffff', text: '#000000', gutter: '#f0f0f0', gutterText: '#9a9a9a', cursor: '#000000', selection: '#b5d5ff' },
    highlight: [{ tag: tags.comment, color: '#4b8a52', fontStyle: 'italic' }, { tag: tags.keyword, color: '#0000ff' }],
  },
  dark: {
    dark: true,
    colors: { background: '#1b222c', text: '#e5e9ee', gutter: '#1b222c', gutterText: '#6b7785', cursor: '#e5e9ee', selection: '#3a4a60' },
    highlight: [{ tag: tags.comment, color: '#7f8c98', fontStyle: 'italic' }, { tag: tags.keyword, color: '#8fc3ff' }],
  },
};

const theme = THEMES[new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light'];
document.body.style.background = theme.colors.background;

const editorTheme = EditorView.theme({
  '&': { height: '100%', color: theme.colors.text, backgroundColor: theme.colors.background, fontSize: '14px' },
  '.cm-content': { fontFamily: 'Menlo, Monaco, monospace', caretColor: theme.colors.cursor },
  '.cm-gutters': { backgroundColor: theme.colors.gutter, color: theme.colors.gutterText, border: 'none' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: theme.colors.selection },
  '.cm-cursor': { borderLeftColor: theme.colors.cursor },
}, { dark: theme.dark });

const doc = ['\\documentclass{article}', '\\begin{document}', '', 'Intro line.', '', '\\end{document}'].join('\n');

window.fixtureView = new EditorView({
  parent: document.getElementById('editor'),
  state: EditorState.create({
    doc,
    extensions: [
      lineNumbers(),
      history(),
      drawSelection(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      latex,
      syntaxHighlighting(HighlightStyle.define(theme.highlight)),
      editorTheme,
      EditorView.lineWrapping,
      thirdPartyExtensionsConf.of(collectExtensions()),
      extensionLoaded,
    ],
  }),
});
