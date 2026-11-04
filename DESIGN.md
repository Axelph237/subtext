# Quick Math: design

Type `%% plain-language or sloppy math %%` and the text turns into rendered LaTeX math. Zotero is the first host app. Later hosts reuse `core/`.

## Layout

```
core/                 platform-agnostic, pure, no I/O, ES module
  quickmath.mjs
  test/               node --test
  evals/              live prompt eval (spends real tokens, run by hand)
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

- Anthropic Messages API, raw HTTP (no SDK, because a bootstrapped plugin has no bundler). `POST https://api.anthropic.com/v1/messages`, headers `x-api-key`, `anthropic-version: 2026-10-21`, `content-type: application/json`. Body has `model`, `max_tokens: 1024`, `system`, one user message, `output_config: { effort: 'low' }`, and no `thinking` field. Every model in the menu then runs adaptive thinking at low effort. Sending `thinking: { type: 'disabled' }` would work on Haiku 5.5 but returns a 400 on Sonnet 5.5 and Opus 5.5. No `temperature`, since `2026-10-21` rejects it. Check `stop_reason === 'refusal'` before reading content. Haiku 5.5 has no server-side fallback.
- Claude Code: `claude -p --model <model> --effort low --tools "" --strict-mcp-config --setting-sources "" --no-session-persistence --output-format json --system-prompt <SYSTEM_PROMPT>`, input on stdin. Output JSON has `result`, `is_error`, and `stop_reason`. On an error such as an unknown model the CLI exits 1 and still prints the JSON with `is_error: true`. `--effort low` matches the API backend: measured 1.2s and 49 thinking tokens per call on Haiku 5.5, against 2.2s and 207 thinking tokens at the default effort. Do not pass `--bare`: it skips keychain reads, which breaks subscription login.

## Zotero facts (from the Zotero 10.0.7 bundle, `resource://zotero/note-editor/editor.js`)

- The note editor is an iframe. Its window has `_currentEditorInstance`, whose `_editorCore.view` is the ProseMirror `EditorView`. Chrome code reaches it through `wrappedJSObject`.
- The schema has `math_inline` (inline, atom, `content: "text*"`) and `math_display` (block). They serialize to `$…$` and `$$…$$` and render with KaTeX.
- The note-editor iframe has the `resource://zotero` principal, not the system principal, so chrome code sees it through Xrays. Walk nodes with `childCount` and `child(i)` rather than passing chrome callbacks into content.
- Preference pane scripts run in a sandbox whose prototype is the window. The pane's `onload` attribute resolves names on the window, so the pane object is set on `window`.

## Zotero behavior

1. A capture-phase `input` listener on each main window sees typing inside note-editor iframes (confirmed live on 10.0.7). The listener runs before ProseMirror reads the DOM change into its state, so it waits one task before reading the selection.
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

## Hosts that insert text

Overleaf and Obsidian edit source text, so the converted math is inserted as text in the host's own syntax. Core owns the syntax table:

```js
FORMATS = {
  latex:    { inline: (l) => `$${l}$`, display: (l) => `\\[\n${l}\n\\]` },   // Overleaf
  markdown: { inline: (l) => `$${l}$`, display: (l) => `$$\n${l}\n$$` },    // Obsidian
}
```

A trigger that is the whole line (ignoring surrounding whitespace) uses `display`; otherwise `inline`.

Two Node hosts (the Obsidian plugin and the Chrome native messaging host) run the claude CLI, so core gains one Node-only module, `core/node/claude-cli.mjs`:

```js
detectClaudePath() -> Promise<string>             // ~/.local/bin, /opt/homebrew/bin, /usr/local/bin, then `$SHELL -lc 'command -v claude'`
runClaude(input, { model, claudePath }) -> Promise<Result>   // spawn with BACKENDS['claude-code'].buildArgs, stdin, 60s timeout, parseOutput
```

`core/quickmath.mjs` stays pure. The Anthropic request always sends `anthropic-dangerous-direct-browser-access: true`, because the API rejects requests that carry a browser `Origin` header without it. A Chrome extension service worker sends `Origin: chrome-extension://…`.

The CM6 editors in both hosts share one behavior. A StateField holds the pending conversions as ranges and maps them through every transaction, so the replacement lands on the right text even if the user kept typing. A decoration marks each pending range. When a conversion finishes, the host replaces the mapped range in one transaction. If the range was deleted in the meantime, the result is dropped.

## Chrome extension (`chrome/`), Overleaf only

Manifest V3. Works in Chrome and Brave. Extension ID `aaconkaemhjabkkimpelnggapgefegen`, pinned by the manifest `key`.

- `overleaf.js` runs in the page's MAIN world at `document_start` on `https://www.overleaf.com/project/*`. It listens for Overleaf's `UNSTABLE_editor:extensions` event and pushes a CM6 extension built only from `event.detail.CodeMirror` (the host's own classes; bundling a second CodeMirror breaks `instanceof`). Overleaf calls the hook unsupported and subject to change, so the plugin fails quietly and logs once if the hook never fires, or warns naming any export it needs and lacks.
- Overleaf's `CodeMirror` export (`services/web/frontend/js/features/source-editor/extensions/bundle.ts`) has `ChangeSet`, `Decoration`, `EditorSelection`, `EditorView`, `Prec`, `StateEffect`, `StateField`, `ViewPlugin`, `WidgetType`, `hoverTooltip`, `keymap`, `syntaxTree`, `undo`, `redo`, `invertedEffects`, and `isolateHistory`. It has no `EditorState`, `Transaction`, or `showTooltip`. Overleaf fires the hook again on `editor:extension-loaded` and reconfigures its compartment, so the extension is built once and pushed each time, which keeps the same StateField and its pending conversions.
- Content scripts cannot be ES modules, so `build.sh` bundles `overleaf.js` and `bridge.js` with the core they import (esbuild, IIFE). CodeMirror is never bundled. The browser loads `chrome/build/extension`, not `chrome/`.
- A trigger starts only on a transaction with user event `input.type`, so paste, undo, and remote edits never start one. The pending entry is added in a separate transaction on the next microtask, because a view cannot dispatch during an update. The replacement carries `isolateHistory.of('full')`, so Cmd+Z restores the raw text even when the user types right after the math lands.
- An edit strictly inside a pending range drops it, like a deletion, because the result would overwrite the edit. Edits that touch only its ends map around it.
- On failure, a note with the error appears under the trigger for 6 seconds. It is a positioned element in `view.scrollDOM`, not a widget, so the text does not move. It picks its light or dark colors from the luminance of the editor's text color, since Overleaf's themes may not set `EditorView.darkTheme`.
- MAIN-world scripts cannot use `chrome.runtime`, so `bridge.js` (isolated world) relays requests between the page and the service worker with `window.postMessage`, checking `event.source === window` and a message tag. Every message is `{ tag, id, method, params }` with a `{ tag, id, result }` reply. `background.js` dispatches `method` through a `METHODS` table (`convert`, `settings`) and `convert` through `TRANSPORTS` keyed by backend id. The bridge answers a `settings` request again on every `chrome.storage` change, so a new delimiter applies without a reload.
- `settings.js` `loadSettings()` is the one place settings are read from `chrome.storage.local` and validated. The page only ever receives the delimiter, never the API key.
- `background.js` is a module service worker that imports core. `anthropic` uses `fetch` with `host_permissions` for `https://api.anthropic.com/*`. `claude-code` uses `chrome.runtime.sendNativeMessage('com.aidenking.quickmath', …)`.
- `native-host/` is a Node native messaging host that calls `runClaude`. `install.sh` writes the host manifest for Chrome (`~/Library/Application Support/Google/Chrome/NativeMessagingHosts`), Brave (`~/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts`), or `<dir>/NativeMessagingHosts` for `--user-data-dir <dir>`. Chromium started with `--user-data-dir` looks for user-level hosts there (confirmed live with Playwright's Chrome for Testing 156: the extension reports the host missing until that file exists). The manifest's `allowed_origins` names the ID derived from the manifest `key`.
- `install.sh` copies `host.mjs` and the core files it imports into `NativeMessagingHosts/com.aidenking.quickmath/` with a wrapper that names `node` by absolute path, because browsers launch hosts without the shell PATH. The host does not run from the checkout: launched from a checkout under `~/Documents`, the wrapper failed with `Operation not permitted`, which points to macOS privacy protection applied to the browser. Rerun `install.sh` after updating the host. Started with only `HOME` set, the claude CLI reports `Not logged in`; with `USER`, `LOGNAME`, `TMPDIR`, and `SHELL` also set, as macOS sets them for apps, it finds the login.
- `options.html` sets the backend, model, API key (`chrome.storage.local`), Claude CLI path, and delimiter (default `%%`). Each field saves on change.
- Output uses `FORMATS.latex`.

## Obsidian plugin (`obsidian/`)

- Plain JS bundled with esbuild into `main.js` (core is ESM, Obsidian loads CommonJS). `obsidian`, `@codemirror/*`, and Node builtins are external.
- The CM6 extension is registered with `registerEditorExtension`. The same StateField design as Overleaf applies.
- `claude-code` uses `runClaude` (desktop only). `anthropic` uses Obsidian's `requestUrl`, which bypasses CORS. The API key lives in `app.secretStorage` (Obsidian 1.11.4+, so `minAppVersion: "1.11.4"`). `data.json` holds only the secret id.
- Default delimiter `;;`, because `%%` is Obsidian comment syntax. Output uses `FORMATS.markdown`.
