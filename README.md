# Quick Math

Quick Math turns plain-language math into rendered LaTeX. In a Zotero note, type the math between two `%%` delimiters:

```
%% integral from 0 to infinity of e to the minus x squared %%
```

When you type the closing `%%`, the text is sent to Claude. A moment later it becomes a math node that shows ∫₀^∞ e^(-x²) dx, stored as `\int_0^\infty e^{-x^2}\,dx`. Sloppy LaTeX works too. `x^10` becomes `x^{10}`, and `sum i=1 to n` becomes `\sum_{i=1}^{n}`. Quick Math writes down what you typed. It does not solve or simplify it.

Quick Math can use your Claude Code login or an Anthropic API key. The default model is Claude Haiku 5.5, the cheapest. One conversion costs about $0.0002 and takes one to two seconds.

Zotero is the first host app. The conversion logic lives in `core/`, which has no Zotero code, so other apps can reuse it later.

Quick Math was built against Zotero 10.0.7 and tested live on it. The manifest allows Zotero 7 to 10, but Zotero 7 to 9 are untested.

## Install

1. Build the plugin with `zotero/build.sh`. This creates `zotero/build/quick-math.xpi`.
2. In Zotero, open **Tools > Plugins**.
3. Drag `zotero/build/quick-math.xpi` onto the Plugins window. You can also click the gear icon, select **Install Plugin From File...**, and choose the file.

To update, install a newer `.xpi` the same way. To remove the plugin, disable or remove it in **Tools > Plugins**. Listeners and pending conversions are removed at once. Removing the plugin also clears its preferences and its saved API key.

## Configure

Open **Zotero > Settings** (**Edit > Settings** on Windows and Linux) and select **Quick Math**.

| Setting | What it does | Default |
| --- | --- | --- |
| Convert with | **Claude Code login** runs the `claude` CLI. **Anthropic API key** calls the Anthropic API directly. | Claude Code login |
| Model | Claude Haiku 5.5, Sonnet 5.5, or Opus 5.5. Select **Other model id** to type any model id. | Claude Haiku 5.5 |
| Anthropic API key | Your key for the Anthropic API. It is stored in the Zotero password manager, not in `prefs.js`. | none |
| Path to the claude CLI | The full path to `claude`. Leave it empty to find it automatically. | empty |
| Delimiter | The text that opens and closes a trigger. | `%%` |

To use your Claude Code login, install Claude Code and sign in once in a terminal with `claude`. Zotero does not see your shell's `PATH`, so Quick Math looks for `claude` in `~/.local/bin`, `/opt/homebrew/bin`, and `/usr/local/bin`, then asks your login shell. The path it finds is shown in the empty path field.

Click **Test** to convert the sample text with the current settings. The pane shows the LaTeX or the error.

## Use

- Type `%%`, the math, and `%%` anywhere in a note. A small "Converting to LaTeX" pill appears under the text while Claude works.
- You can keep typing. When the result comes back, Quick Math replaces the trigger text where it is now.
- If the trigger is the whole paragraph, it becomes display math, centered on its own line. The cursor moves to a new line below it.
- Press Cmd+Z (Ctrl+Z on Windows and Linux) to turn the math back into the text you typed.
- If the conversion fails, the text stays as you typed it, and a Zotero notification shows the error.
- Read-only notes are skipped.

## Chrome extension (Overleaf)

The Quick Math extension works in the Overleaf source editor, in Brave or Chrome. In a project, type:

```
%% sum i=1 to n of i squared %%
```

When you type the closing `%%`, the text becomes `$\sum_{i=1}^{n} i^{2}$`.

### Install

1. Build the extension with `chrome/build.sh`. This creates the `chrome/build/extension` folder and `chrome/build/quick-math-chrome.zip`. The build needs Node. The first build runs `npm ci` in `chrome/dev` to get esbuild.
2. Open `brave://extensions` in Brave or `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the `chrome/build/extension` folder.
5. To use your Claude Code login, run `chrome/native-host/install.sh` in a terminal. It installs a small helper program that runs `claude` for the extension, for Chrome and for Brave. You do not need it if you use an Anthropic API key.

To update, run `chrome/build.sh` again, click the reload icon on the extension's card, and reload the Overleaf tab. Run `install.sh` again too, because it copies the helper into each browser's folder.

### Configure

On the extensions page, click **Details** on Quick Math, then **Extension options**. Each change is saved at once.

| Setting | What it does | Default |
| --- | --- | --- |
| Convert with | **Claude Code login** runs the `claude` CLI through the helper program. **Anthropic API key** calls the Anthropic API directly. | Claude Code login |
| Model | Claude Haiku 5.5, Sonnet 5.5, or Opus 5.5. Select **Other model id** to type any model id. | Claude Haiku 5.5 |
| Anthropic API key | Your key for the Anthropic API. It is stored in the browser profile's extension storage, which is not encrypted. | none |
| Path to the claude CLI | The full path to `claude`. Leave it empty to find it automatically. | empty |
| Delimiter | The text that opens and closes a trigger. | `%%` |

Click **Test** to convert the sample text with the current settings. The page shows the LaTeX or the error. If the helper program is not installed, the error says so.

### Use

- Open a project and type `%%`, the math, and `%%` in the source editor. The text is underlined with blue dots while Claude works.
- You can keep typing, on the same line or anywhere else. When the result comes back, Quick Math replaces the trigger text where it is now.
- If the trigger is alone on its line, it becomes display math: `\[`, the LaTeX, and `\]` on three lines.
- Press Cmd+Z (Ctrl+Z on Windows and Linux) to turn the math back into the text you typed.
- If you delete or change the trigger text before the result comes back, the result is dropped.
- If the conversion fails, the text stays as you typed it, and a note under it shows the error for a few seconds.

With the default delimiter, a trigger that is not converted is a LaTeX comment, so it does not show in your PDF.

### Limits

- Quick Math uses an Overleaf extension hook (`UNSTABLE_editor:extensions`) that Overleaf calls unsupported and subject to change without warning. If Overleaf changes it, Quick Math stops converting, and the editor works as before. The browser console then shows a message that starts with "Quick Math is off".
- It runs only on `https://www.overleaf.com/project/...` pages. Self-hosted Overleaf servers are not included.
- `install.sh` supports macOS only.
- The extension was tested in Playwright's Chromium (Chrome for Testing 156) against a page that copies Overleaf's hook. It has not yet been tested on overleaf.com itself or in Brave.

### Development and live tests

- `chrome/core` and `chrome/native-host/core` are symlinks to `core/`. `chrome/build.sh` bundles the two content scripts, `overleaf.js` and `bridge.js`, with the core they import, because content scripts cannot be ES modules. CodeMirror is never bundled. Quick Math uses the CodeMirror classes that Overleaf passes to the hook.
- To add a backend, add an entry to `BACKENDS` in `core/quickmath.mjs` and a transport with the same id to `TRANSPORTS` in `chrome/background.js`. Give its settings section `data-backend="<id>"` in `chrome/options.html`.

`chrome/dev/live/run.mjs` tests the extension in a throwaway browser profile. Run `npm install` and `npx playwright install chromium` in `chrome/dev` once. Then run `node chrome/dev/live/run.mjs`, and pass a work directory if you want to keep the results in a known place. It builds the extension, loads it into Playwright's Chromium, and installs the helper program into that profile only. It serves a page at `https://www.overleaf.com/project/fixture` that fires Overleaf's hook with real CodeMirror code, in light and dark themes, under Overleaf's content security policy. Each scenario types with real key events. The scenarios cover inline and display math through the real `claude` CLI, typing while a conversion runs, deleting or editing the trigger while it runs, undo, a wrong CLI path, a custom delimiter, the options page and its Test button, and the Anthropic API with a fake key. It prints PASS or FAIL for each scenario and keeps screenshots in the work directory. Set `HEADED=1` to watch, and `ONLY="inline undo"` to run some scenarios. A full run costs well under one cent.

`chrome/dev/live/overleaf.mjs` tries the extension on overleaf.com in Brave. Give it a folder of its own, not your Chrome or Brave profile. Google refuses sign-in in a browser that automation controls, so sign in first with `node chrome/dev/live/overleaf.mjs --sign-in <profile-dir>`. That opens a plain Brave window. Sign in to Overleaf, then quit the window with Cmd+Q. The sign-in is kept in the folder. Then run `node chrome/dev/live/overleaf.mjs <profile-dir>`. It creates a project named `Quick Math scratch <time>`, converts an inline and a whole-line trigger in `main.tex`, and prints PASS or FAIL. At the end it moves that project to the trash and deletes it permanently. It finds the project by the ID it recorded when it created it, so it never touches your other projects. Set `BROWSER` to the path of another Chromium browser to test there instead. If Overleaf's dashboard has changed, fix the selectors at the top of the file.

## Obsidian plugin

Quick Math also works in Obsidian notes. In Obsidian the delimiter is `;;`, because `%%` starts an Obsidian comment:

```
;; alpha plus beta over gamma ;;
```

When you type the closing `;;`, the text becomes `$\frac{\alpha + \beta}{\gamma}$` in the note, and Obsidian renders it as math. The plugin needs Obsidian 1.11.4 or later on the desktop. It was tested live on Obsidian 1.13.4 on macOS.

### Install

1. Build the plugin with `obsidian/build.sh`. This creates `obsidian/build/quick-math/` with `main.js`, `manifest.json`, and `styles.css`.
2. Copy the three files into `<vault>/.obsidian/plugins/quick-math/`. Create the folder if it does not exist.
3. In Obsidian, open **Settings > Community plugins**. If Restricted mode is on, turn it off.
4. Under **Installed plugins**, turn on **Quick Math**. Click the reload icon if it is not in the list.

To update, copy the new files over the old ones and turn the plugin off and on again. To remove the plugin, turn it off and delete its folder. Pending conversions stop at once when you turn it off.

### Configure

Open **Settings > Quick Math**.

| Setting | What it does | Default |
| --- | --- | --- |
| Convert with | **Claude Code login** runs the `claude` CLI. **Anthropic API key** calls the Anthropic API directly. | Claude Code login |
| Model | Claude Haiku 5.5, Sonnet 5.5, or Opus 5.5. Select **Other model id** to type any model id. | Claude Haiku 5.5 |
| Anthropic API key | Click **Link...** to pick or add a secret in Obsidian's keychain. The plugin saves only the secret's id in its `data.json`. | none |
| Path to the claude CLI | The full path to `claude`. Leave it empty to find it automatically. The path it finds is shown in the empty field. | empty |
| Delimiter | The text that opens and closes a trigger. Do not use `%%`. | `;;` |

Click **Test** to convert the sample text with the current settings. The result or the error shows under the button.

### Use

- Type `;;`, the math, and `;;` anywhere in a note. The trigger text is highlighted while Claude works.
- You can keep typing, in the same line or anywhere else. When the result comes back, Quick Math replaces the trigger where it is now.
- If you delete or change the trigger text before the result comes back, the result is dropped.
- If the trigger is alone on its line, it becomes a display math block between `$$` lines.
- Press Cmd+Z (Ctrl+Z on Windows and Linux) to turn the math back into the text you typed.
- If the conversion fails, the text stays as you typed it, and an Obsidian notice shows the error.
- `%% comments %%` are never converted.

## Development

- Run `node --test core/test/` to test the core: trigger detection, LaTeX cleanup, and each backend's request and response handling.
- Run `npm install` in `core/evals`, then `node core/evals/run.mjs` to check `SYSTEM_PROMPT` against 17 realistic inputs. It spends real tokens through your `claude` login, about $0.005 for a run. Each output must parse with KaTeX and keep the meaning of the input. Pass a path to use a different `claude`, and set `QM_MODEL` to try another model.
- Run `zotero/build.sh` to build `zotero/build/quick-math.xpi`.
- `zotero/core` is a symlink to `core/`, so the plugin loads `chrome://quickmath/content/core/quickmath.mjs` both from a checkout and from the `.xpi`.
- To add a backend, add an entry to `BACKENDS` in `core/quickmath.mjs` and a transport with the same id to `TRANSPORTS` in `zotero/src/quickmath.js`. The settings pane builds its choices from `BACKENDS`. Give the backend's settings group `data-backend="<id>"` in `zotero/prefs.xhtml`.
- In Zotero, `Zotero.QuickMath.convert(text)` runs one conversion with the current settings and resolves to `{ ok, latex }` or `{ ok, error }`. Use it from the Run JavaScript window (**Tools > Developer > Run JavaScript**).

The `update_url` in `zotero/manifest.json` is a placeholder. Zotero requires the field. Replace it with a real update manifest URL before you publish the plugin.

### Live tests

`zotero/dev/live/run.sh` starts a throwaway headless Zotero with its own profile and data directory. Your own library is never opened. It links the plugin from this checkout and runs `zotero/dev/live/scenarios/` in order. Each scenario opens a new note and types into it with real key events. The scenarios cover inline math through the real `claude` CLI, display math, undo, a failing CLI path, a custom delimiter, disable and enable, and the settings pane. It prints PASS or FAIL for each scenario and keeps screenshots in the work directory it names. Set `XPI=zotero/build/quick-math.xpi` to test the built plugin instead of the checkout. Set `ONLY="01-inline.js 03-undo.js"` to run some scenarios. A small driver plugin in `zotero/dev/live/driver` runs each scenario. It is only active when `QM_CMD_DIR` is set.

The scenarios need a signed-in `claude` CLI. A full run costs well under one cent.

### Obsidian live tests

Run `npm install` in `obsidian`, then `node obsidian/dev/live/run.mjs`. It builds the plugin and starts a separate Obsidian with its own user data directory and a scratch vault, so your own Obsidian settings and vaults are never opened. The window opens behind the app you are using, so your typing does not reach it. The harness links the plugin into the scratch vault, accepts the "trust the author" prompt, and drives Obsidian with Playwright over the Chrome DevTools Protocol, typing with real key events. The scenarios in `obsidian/dev/live/scenarios/` cover inline and display math through the real `claude` CLI, typing and deleting while a conversion is pending, undo, `%%` comments, a custom delimiter, a failing CLI path, the settings tab, the Anthropic backend with a fake key, and disabling the plugin. It prints PASS or FAIL for each scenario and keeps screenshots in the work directory it names. Pass a directory to use it as the work directory. Set `ONLY="01 05"` to run some scenarios, and `PLUGIN_FILES=obsidian/build/quick-math` to test the built release folder.

The Obsidian app bundle can be older than the version you run, because Obsidian updates itself by saving a newer app package in its user data directory. The harness downloads Obsidian 1.13.4's package from the Obsidian releases on GitHub, checks its SHA-256 digest, and caches it in `$QM_CACHE` (default: a folder in your temp directory). Set `OBSIDIAN_VERSION` to test another version.

The design is in `DESIGN.md`.
