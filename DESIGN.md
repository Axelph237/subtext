# Quick Math: design

Type `%% plain-language or sloppy math %%` and the text turns into rendered LaTeX math. Zotero is the first host app. Later hosts reuse `core/`.

## Layout

```
core/                 platform-agnostic, pure, no I/O, ES module
  quickmath.mjs
  test/               node --test
  eval/               live prompt eval (spends real tokens, run by hand)
zotero/               Zotero 7+ bootstrapped plugin
  manifest.json bootstrap.js prefs.js prefs.xhtml src/
  core -> ../core     symlink, so the proxy-installed dev plugin and the xpi both contain core
  build.sh
  dev/live/           headless Zotero harness, adapted from ../split-view/dev/live
```

## Core data shape (`core/quickmath.mjs`)

Pure functions. Each host owns its own I/O.

```js
// A trigger found at the end of the text before the cursor.
Trigger = { start: number, end: number, input: string }   // offsets into the given text; input is trimmed, non-empty

findTrigger(textBeforeCursor, delimiter = '%%') -> Trigger | null
SYSTEM_PROMPT: string
cleanLatex(raw: string) -> string          // strips code fences, $…$, $$…$$, \(…\), \[…\], whitespace

// Backends are a registry keyed by id. Each entry is data plus pure request/response transforms.
// The host performs the transport (fetch, subprocess) and passes the raw result back.
BACKENDS = {
  anthropic:     { label, buildRequest(cfg, input) -> { url, init }, parseResponse(json) -> Result },
  'claude-code': { label, buildArgs(cfg) -> string[], stdinFor(input) -> string, parseOutput(stdout) -> Result },
}
Result = { ok: true, latex: string } | { ok: false, error: string }
MODELS = [{ id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (cheapest)' }, sonnet-5-5, opus-5-5]
DEFAULT_MODEL = 'claude-haiku-5-5'
```

Facts behind the backends:

- Anthropic Messages API, raw HTTP (no SDK, because a bootstrapped plugin has no bundler). `POST https://api.anthropic.com/v1/messages`, headers `x-api-key`, `anthropic-version: 2026-10-21`, `content-type: application/json`. Body has `model`, `max_tokens: 1024`, `system`, one user message, `output_config: { effort: 'low' }`, `thinking: { type: 'disabled' }` (Haiku 5.5 accepts disabled at effort high or below). No `temperature`, since `2026-10-21` rejects it. Check `stop_reason === 'refusal'` before reading content. Haiku 5.5 has no server-side fallback.
- Claude Code: `claude -p --model <model> --effort low --tools "" --strict-mcp-config --setting-sources "" --no-session-persistence --output-format json --system-prompt <SYSTEM_PROMPT>`, input on stdin. Output JSON has `result`, `is_error`, and `stop_reason`. On an error such as an unknown model the CLI exits 1 and still prints the JSON with `is_error: true`. `--effort low` matches the API backend: measured 1.2s and 49 thinking tokens per call on Haiku 5.5, against 2.2s and 207 thinking tokens at the default effort. Do not pass `--bare`: it skips keychain reads, which breaks subscription login.

## Zotero facts (from the Zotero 10.0.7 bundle, `resource://zotero/note-editor/editor.js`)

- The note editor is an iframe. Its window has `_currentEditorInstance`, whose `_editorCore.view` is the ProseMirror `EditorView`. Chrome code reaches it through `wrappedJSObject`.
- The schema has `math_inline` (inline, atom, `content: "text*"`) and `math_display` (block). They serialize to `$…$` and `$$…$$` and render with KaTeX.

## Zotero behavior

1. A capture-phase `input` listener on each main window sees typing inside note-editor iframes. If events do not propagate there, attach per iframe instead. The live harness decides.
2. On input, read the text of the cursor's textblock up to the cursor and call `findTrigger`. No trigger, nothing happens.
3. Show a small pending pill anchored at the trigger (`view.coordsAtPos`). Call the configured backend.
4. On success, find the exact trigger text in the current doc, nearest to where it was (the user may have kept typing), and replace it with a `math_inline` node. If the trigger was the whole paragraph, replace the paragraph with `math_display`. One transaction, so Cmd+Z restores the raw text.
5. On failure, remove the pill, leave the text, and show a Zotero progress window with the error.
6. Read-only editors are skipped.

## Configuration (Zotero settings pane)

| Setting | Pref | Default |
| --- | --- | --- |
| Backend | `extensions.quickmath.backend` | `claude-code` |
| Model | `extensions.quickmath.model` | `claude-haiku-5-5` |
| API key | Firefox login manager, origin `chrome://quickmath` | none |
| Claude CLI path | `extensions.quickmath.claudePath` | empty, meaning autodetect |
| Delimiter | `extensions.quickmath.delimiter` | `%%` |

The API key lives in the login manager rather than `prefs.js`, so it is not written in plain text to the profile.
