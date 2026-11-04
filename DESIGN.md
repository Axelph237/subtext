# SubTeXt: design

Type `%% plain-language or sloppy math %%` and the text turns into rendered LaTeX math. Zotero is the first host app. Later hosts reuse `core/`.

## Layout

```
core/                 platform-agnostic, pure, no I/O, ES module
  subtext.mjs
  test/               node --test
  evals/              live prompt eval (spends real tokens, run by hand)
zotero/               Zotero 7+ bootstrapped plugin
  manifest.json bootstrap.js prefs.js prefs.xhtml src/
  core -> ../core     symlink, so the proxy-installed dev plugin and the xpi both contain core
  build.sh
  dev/live/           headless Zotero harness, adapted from ../split-view/dev/live
```

## Core data shape (`core/subtext.mjs`)

Pure functions. Each host owns its own I/O.

```js
// A trigger found at the end of the text before the cursor.
Trigger = { start: number, end: number, input: string }   // offsets into the given text; input is trimmed, non-empty

findTrigger(textBeforeCursor, delimiter = '%%') -> Trigger | null
SYSTEM_PROMPT: string
cleanLatex(raw: string) -> string          // strips code fences, $…$, $$…$$, \(…\), \[…\], whitespace

// A conversion request: the trigger's math and the document text before it ('' when context is off).
Conversion = { input: string, context: string }
DEFAULT_CONTEXT_CHARS = 2000
MAX_CONTEXT_CHARS = 20000
contextWindow(textBefore: string, chars: number) -> string   // last `chars` characters, trimmed; '' when chars <= 0; a word the cut splits is dropped
parseContextChars(value) -> number         // the one validator every host uses: integer clamped to [0, MAX_CONTEXT_CHARS], DEFAULT_CONTEXT_CHARS when missing or not a number
userMessage({ input, context }) -> string  // context '': exactly input. Otherwise <context>\n…\n</context>\n\n<math>\n…\n</math>

// Backends are a registry keyed by id. Each entry is data plus pure request/response transforms.
// The host performs the transport (fetch, subprocess) and passes the raw result back.
BACKENDS = {
  anthropic:     { label, buildRequest(cfg, conversion) -> { url, init }, parseResponse(json) -> Result },
  'claude-code': { label, buildArgs(cfg) -> string[], stdinFor(conversion) -> string, parseOutput(stdout) -> Result },
}
Result = { ok: true, latex: string } | { ok: false, error: string }
CANNOT_CONVERT_TOKEN = 'SUBTEXT_CANNOT_CONVERT'   // the model's whole answer when it cannot produce LaTeX
CANNOT_CONVERT: string                            // the one error message for any answer that contains the token
RESULT_MARKER = 'SUBTEXT_RESULT'                  // an operation's answer is work, marker, equation; only the equation is kept
MODELS = [{ id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (cheapest)' }, sonnet-5-5, opus-5-5]
DEFAULT_MODEL = 'claude-haiku-5-5'
```

Context lets the model match the document's notation: bold vectors, `\mathbb` sets, names defined earlier, what an ambiguous phrase refers to. Both backends send `userMessage(conversion)` as the one user message. An empty context sends the bare input.

The system prompt sorts the note into one of three kinds:

1. Math. Convert it and never solve, simplify, evaluate, expand, or reorder it. Context only picks the notation.
2. An operation on an equation in the context, such as `x to both sides`, `reduce sides by x`, `drop x on right`, or `simp left cross terms`. The model finds the equation, usually the most recent one, and writes the step into it. Nothing cancels and no arithmetic is done unless the note asks to simplify (`simplify`, `simp`, `combine like terms`, `and reduce`, and the like). A simplify can be scoped to a side, a kind of term, or both, and everything outside its scope is copied as it was. A step that names a side changes that side only, even when the equation is then false. `drop`, `remove`, and `delete` erase a term rather than subtract it. Nothing is solved for a variable unless asked.
3. Anything else, including an operation with no equation in the context: the model answers `CANNOT_CONVERT_TOKEN` alone. `latexResult` maps any answer that contains the token, bare, wrapped, or inside prose, to `{ ok: false, error: CANNOT_CONVERT }`. It maps an answer that has, outside commands and `\text{}`, a run of five or more words joined only by spaces and punctuation, at least two of them four letters or longer, to the same error. Operators and parentheses end a run, so valid math such as `ab - ac - ad - ae - af` passes. Asked for the token, Haiku still answered 3 of 20 runs of the two error cases in prose ("This message is outside what I do here..."), and that prose would otherwise land in the document as math. The check flags every prose answer seen in the eval and none of the 103 distinct LaTeX outputs. The hosts already show `{ ok: false }` errors and leave the text, so they need no change.

An operation's answer is a scratchpad, `kind: <add, subtract, multiply, divide, power, erase, or none>; step: <equation with the step written in>; simplify: <no, or the note's simplify word and what it covers>`, then `RESULT_MARKER`, then the final equation. `latexResult` keeps only what follows the last marker. Haiku 5.5 at low effort tends to write its work before its result (`2x + 3 - 3 = 11 - 3 \Rightarrow 2x = 8`). Asked for the result alone, it passed 125 of 160 operation and error runs (10 per case): both simplify cases passed 0 of 10, and `remove the b on the right` passed 0 of 10, written as `y = mx + b - b`. With the marker it passed 153 to 157 of 160 across prompt revisions, still reading drop and remove as subtraction in some runs. Naming the `kind` first, with drop, remove, and delete as `erase`, fixed those (20 of 20 each). Quoting the simplify word took `subtract 3 from both sides and simplify` from 8 of 10 to 20 of 20. The final prompt passed 160 of 160 operation and error runs (10 per case) and 60 of 60 error-case runs (20 per case). The prompt's examples use other letters than the eval cases.

A host that slices the text before the trigger takes `chars + 1` characters. With exactly `chars`, `contextWindow` cannot see the character before its cut, so it cannot tell whether the cut split a word.

`core/evals/run.mjs` runs the claude CLI from a temp dir, as the hosts do. Run from the checkout, the CLI sees the repo, and Haiku wrote `\mathrm{P}(A \mid B)` for `P of A given B` in 2 of 10 runs. A case may have `context`, and `expectError` passes only on the `CANNOT_CONVERT` error. `STX_REPEAT=10` runs each case ten times and prints a pass rate, and `STX_ONLY=<regex>` picks cases by input.

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
3. Show a small pending pill anchored at the trigger (`view.coordsAtPos`). Build the context from the note text before the trigger: walk the doc with `childCount` and `child(i)`, one line per block, `math_inline` as `$latex$` and `math_display` as `$$latex$$` (earlier converted math shows the note's notation best), other non-text inline nodes skipped. Pass it through `contextWindow` and call the configured backend.
4. On success, find the exact trigger text in the current doc, nearest to where it was (the user may have kept typing), and replace it with a `math_inline` node. If the trigger was the whole paragraph, replace the paragraph with `math_display`. One transaction, so Cmd+Z restores the raw text.
5. On failure, remove the pill, leave the text, and show a Zotero progress window with the error.
6. Read-only editors are skipped.

## Configuration (Zotero settings pane)

| Setting | Pref | Default |
| --- | --- | --- |
| Backend | `extensions.subtext.backend` | `claude-code` |
| Model | `extensions.subtext.model` | `claude-haiku-5-5` |
| API key | Firefox login manager, origin `chrome://subtext` | none |
| Claude CLI path | `extensions.subtext.claudePath` | empty, meaning autodetect |
| Delimiter | `extensions.subtext.delimiter` | `%%` |
| Context characters | `extensions.subtext.contextChars` (int) | `2000` |

The API key lives in the login manager rather than `prefs.js`, so it is not written in plain text to the profile. The pane script sets `contextChars` with `parseContextChars` on each input instead of binding it with `preference=`, so the int pref only ever receives a parsed number.

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
runClaude(conversion, { model, claudePath }) -> Promise<Result>   // spawn with BACKENDS['claude-code'].buildArgs, stdin, 60s timeout, parseOutput
```

`core/subtext.mjs` stays pure. The Anthropic request always sends `anthropic-dangerous-direct-browser-access: true`, because the API rejects requests that carry a browser `Origin` header without it. A Chrome extension service worker sends `Origin: chrome-extension://…`.

The CM6 editors in both hosts share one behavior. A StateField holds the pending conversions as ranges and maps them through every transaction, so the replacement lands on the right text even if the user kept typing. A decoration marks each pending range. When a conversion finishes, the host replaces the mapped range in one transaction. If the range was deleted or edited inside in the meantime, the result is dropped, because writing it would overwrite the user's edit. The replacement carries `isolateHistory.of('full')`, so Cmd+Z undoes only the conversion and never the typing around it.

## Chrome extension (`chrome/`), Overleaf only

Manifest V3. Works in Chrome and Brave. Extension ID `aaconkaemhjabkkimpelnggapgefegen`, pinned by the manifest `key`.

- `overleaf.js` runs in the page's MAIN world at `document_start` on `https://www.overleaf.com/project/*`. It listens for Overleaf's `UNSTABLE_editor:extensions` event and pushes a CM6 extension built only from `event.detail.CodeMirror` (the host's own classes; bundling a second CodeMirror breaks `instanceof`). Overleaf calls the hook unsupported and subject to change, so the plugin fails quietly and logs once if the hook never fires, or warns naming any export it needs and lacks.
- Overleaf's `CodeMirror` export (`services/web/frontend/js/features/source-editor/extensions/bundle.ts`) has `ChangeSet`, `Decoration`, `EditorSelection`, `EditorView`, `Prec`, `StateEffect`, `StateField`, `ViewPlugin`, `WidgetType`, `hoverTooltip`, `keymap`, `syntaxTree`, `undo`, `redo`, `invertedEffects`, and `isolateHistory`. It has no `EditorState`, `Transaction`, or `showTooltip`. Overleaf fires the hook again on `editor:extension-loaded` and reconfigures its compartment, so the extension is built once and pushed each time, which keeps the same StateField and its pending conversions.
- Content scripts cannot be ES modules, so `build.sh` bundles `overleaf.js` and `bridge.js` with the core they import (esbuild, IIFE). CodeMirror is never bundled. The browser loads `chrome/build/extension`, not `chrome/`.
- When a trigger starts, `overleaf.js` slices `contextChars + 1` characters before it with `state.sliceDoc`, passes them through `contextWindow`, and sends `{ input, context }` as the `convert` params.
- A trigger starts only on a transaction with user event `input.type`, so paste, undo, and remote edits never start one. The pending entry is added in a separate transaction on the next microtask, because a view cannot dispatch during an update. The replacement carries `isolateHistory.of('full')`, so Cmd+Z restores the raw text even when the user types right after the math lands.
- An edit strictly inside a pending range drops it, like a deletion, because the result would overwrite the edit. Edits that touch only its ends map around it.
- On failure, a note with the error appears under the trigger for 6 seconds. It is a positioned element in `view.scrollDOM`, not a widget, so the text does not move. It picks its light or dark colors from the luminance of the editor's text color, since Overleaf's themes may not set `EditorView.darkTheme`.
- MAIN-world scripts cannot use `chrome.runtime`, so `bridge.js` (isolated world) relays requests between the page and the service worker with `window.postMessage`, checking `event.source === window` and a message tag. Every message is `{ tag, id, method, params }` with a `{ tag, id, result }` reply. `background.js` dispatches `method` through a `METHODS` table (`convert`, `settings`) and `convert` through `TRANSPORTS` keyed by backend id. The bridge answers a `settings` request again on every `chrome.storage` change, so a new delimiter or context size applies without a reload. `convert` refuses a context that is not a string and keeps at most its last `MAX_CONTEXT_CHARS` characters.
- `settings.js` `loadSettings()` is the one place settings are read from `chrome.storage.local` and validated. The `settings` method returns `{ delimiter, contextChars }`. The page never receives the API key.
- `background.js` is a module service worker that imports core. `anthropic` uses `fetch` with `host_permissions` for `https://api.anthropic.com/*`. `claude-code` uses `chrome.runtime.sendNativeMessage('com.aidenking.subtext', …)`.
- `native-host/` is a Node native messaging host that calls `runClaude`. Its message is `{ input, context, model, claudePath }`, checked the same way as `convert`. `install.sh` writes the host manifest for Chrome (`~/Library/Application Support/Google/Chrome/NativeMessagingHosts`), Brave (`~/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts`), or `<dir>/NativeMessagingHosts` for `--user-data-dir <dir>`. Chromium started with `--user-data-dir` looks for user-level hosts there (confirmed live with Playwright's Chrome for Testing 156: the extension reports the host missing until that file exists). The manifest's `allowed_origins` names the ID derived from the manifest `key`.
- `install.sh` copies `host.mjs` and the core files it imports into `NativeMessagingHosts/com.aidenking.subtext/` with a wrapper that names `node` by absolute path, because browsers launch hosts without the shell PATH. The host does not run from the checkout: launched from a checkout under `~/Documents`, the wrapper failed with `Operation not permitted`, which points to macOS privacy protection applied to the browser. Rerun `install.sh` after updating the host. Started with only `HOME` set, the claude CLI reports `Not logged in`; with `USER`, `LOGNAME`, `TMPDIR`, and `SHELL` also set, as macOS sets them for apps, it finds the login.
- `options.html` sets the backend, model, API key (`chrome.storage.local`), Claude CLI path, delimiter (default `%%`), and context characters (default 2000). Each field saves on change. Its **Test** button sends `{ input, context: '' }`.
- Output uses `FORMATS.latex`.

## Obsidian plugin (`obsidian/`)

- Plain JS bundled with esbuild into `main.js` (core is ESM, Obsidian loads CommonJS). `obsidian`, `electron`, `@codemirror/*`, `@lezer/*`, and Node builtins are external.
- The CM6 extension is registered with `registerEditorExtension`. The same StateField design as Overleaf applies. Each pending entry is a mark decoration whose spec holds its id and the trigger text. A result is also dropped when the text in the mapped range no longer equals the trigger text, because the user edited inside it. The replacing transaction carries `isolateHistory.of('full')`, so one Cmd+Z undoes the conversion and nothing typed around it.
- The editor extension takes `delimiter()` and `contextChars()` options and slices `contextChars + 1` characters before the trigger with `state.sliceDoc`. The settings tab has a number field for the size. **Test** sends `{ input, context: '' }`.
- `claude-code` uses `runClaude` (desktop only). `anthropic` uses Obsidian's `requestUrl` with `throw: false`, which bypasses CORS. The API key lives in `app.secretStorage` (Obsidian 1.11.4+, so `minAppVersion: "1.11.4"`). `data.json` holds only the secret id.
- Default delimiter `;;`, because `%%` is Obsidian comment syntax. Output uses `FORMATS.markdown`.

Obsidian facts (observed live on 1.13.4, macOS):

- `/Applications/Obsidian.app` can ship an older `obsidian.asar` than the version that runs (1.10.6 here). The updater saves newer versions as `obsidian-<version>.asar` in the user data dir, and the loader runs the newest one there. `--user-data-dir` is honored, and the single-instance lock is per user data dir.
- Restricted mode is per vault, in the vault's localStorage key `enable-plugin-<appId>`. A vault with plugins and no key shows a "Do you trust the author of this vault?" modal. Its accept button sets the key, loads the plugins listed in `community-plugins.json`, and opens Settings.
- Settings opens in its own window by default (vault config `settingsPopoutWindow`). A `Notice` appears in `activeWindow`, which is that window while it has focus.
- Obsidian UI components define `then()`. A promise callback that returns one (`p.then((x) => text.setPlaceholder(x))`) makes the promise adopt it forever and hangs the renderer.
- `SecretComponent` shows **Link...**. It opens **Add secret** (id and value) when the keychain is empty and **Select secret** otherwise. `onChange` receives the secret id. Secrets are encrypted with Electron `safeStorage` and kept in the vault's localStorage.
