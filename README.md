# SubTeXt

*LaTeX with context.*

SubTeXt turns plain-language math into proper LaTeX while you write. Type the math between two delimiters. When you type the closing delimiter, Claude rewrites it:

```
%% integral from 0 to infinity of e to the minus x squared %%
```

That trigger becomes `\int_0^\infty e^{-x^2}\,dx`. Sloppy LaTeX works too. `x^10` becomes `x^{10}`, and `sum i=1 to n` becomes `\sum_{i=1}^{n}`. SubTeXt writes down what you typed. It does not solve or simplify it.

SubTeXt runs in three apps: Zotero notes, the Overleaf editor (through a Brave or Chrome extension), and Obsidian notes. It can use your Claude Code login or an Anthropic API key. The default model is Claude Haiku 5.5, the cheapest. One conversion costs about $0.0002 and takes one to two seconds.

## Contents

- [Features](#features)
  - [What every platform does](#what-every-platform-does)
  - [Features in Zotero](#features-in-zotero)
  - [Features in Overleaf](#features-in-overleaf)
  - [Features in Obsidian](#features-in-obsidian)
- [Installation](#installation)
  - [Install in Zotero](#install-in-zotero)
  - [Install in Overleaf (Brave or Chrome)](#install-in-overleaf-brave-or-chrome)
  - [Install in Obsidian](#install-in-obsidian)
- [Configuration](#configuration)
  - [Settings on every platform](#settings-on-every-platform)
  - [Configure Zotero](#configure-zotero)
  - [Configure the Overleaf extension](#configure-the-overleaf-extension)
  - [Configure Obsidian](#configure-obsidian)
- [Development](#development)

## Features

### What every platform does

- **Plain language or sloppy LaTeX in, clean LaTeX out.** The prompt fixes braces, spells Greek letters as commands, and uses `\frac`, `\binom`, `cases`, and `pmatrix`. It writes only ASCII, so pdflatex accepts the result.
- **Inline or display math.** A trigger inside a line becomes inline math. A trigger alone on its line becomes display math.
- **Keep typing while it converts.** The trigger is marked while Claude works. You can type anywhere, and the result still lands on the trigger.
- **Your edits win.** If you delete or change the trigger text before the result comes back, the result is dropped.
- **One undo step.** Cmd+Z (Ctrl+Z on Windows and Linux) turns the math back into the text you typed. It does not undo the typing around it.
- **Failures leave your text alone.** If a conversion fails, the trigger stays as typed and the app shows the error.
- **Two ways to reach Claude.** Your Claude Code login runs the `claude` CLI. An Anthropic API key calls the API directly.

### Features in Zotero

- Works in Zotero notes. The default delimiter is `%%`.
- The result is a real Zotero math node, rendered with KaTeX. Inline math is saved as `$…$`, and display math as `$$…$$`.
- A small "Converting to LaTeX" pill sits under the trigger while Claude works.
- Errors show in a Zotero notification. Read-only notes are skipped.
- Built against Zotero 10.0.7 and tested live on it. The manifest allows Zotero 7 to 10, but Zotero 7 to 9 are untested.

### Features in Overleaf

- Works in the Overleaf source editor, in Brave or Chrome. The default delimiter is `%%`.
- The result is LaTeX source. Inline math becomes `$…$`. Display math becomes `\[`, the LaTeX, and `\]` on three lines.
- With the default delimiter, a trigger that is not converted is a LaTeX comment, so it never shows in your PDF.
- The trigger is underlined with blue dots while Claude works. Errors show in a note under the text for a few seconds.
- SubTeXt uses Overleaf's extension hook, `UNSTABLE_editor:extensions`. Overleaf calls the hook unsupported and subject to change without warning. If Overleaf changes it, SubTeXt stops converting and the editor works as before. The browser console then shows a message that starts with "SubTeXt is off".
- It runs only on `https://www.overleaf.com/project/...` pages. Self-hosted Overleaf servers are not included.
- Tested in Chrome for Testing 156 against a page that copies Overleaf's hook. Brave 156 loads the extension, but a full conversion in Brave and on overleaf.com itself is not yet tested.

### Features in Obsidian

- Works in Obsidian notes. The default delimiter is `;;`, because `%%` starts an Obsidian comment. `%% comments %%` are never converted.
- The result is Markdown math. Inline math becomes `$…$`. Display math becomes a block between `$$` lines.
- The trigger is highlighted while Claude works. Errors show in an Obsidian notice.
- Needs Obsidian 1.11.4 or later on the desktop. Tested live on Obsidian 1.13.4 on macOS.

## Installation

Each platform needs Node to build. To use your Claude Code login, install Claude Code and sign in once in a terminal with `claude`.

### Install in Zotero

1. Build the plugin with `zotero/build.sh`. This creates `zotero/build/subtext.xpi`.
2. In Zotero, open **Tools > Plugins**.
3. Drag `zotero/build/subtext.xpi` onto the Plugins window. You can also click the gear icon, select **Install Plugin From File...**, and choose the file.

To update, install a newer `.xpi` the same way. To remove the plugin, disable or remove it in **Tools > Plugins**. Removing the plugin also clears its preferences and its saved API key.

### Install in Overleaf (Brave or Chrome)

1. Build the extension with `chrome/build.sh`. This creates the `chrome/build/extension` folder and `chrome/build/subtext-chrome.zip`. The first build runs `npm ci` in `chrome/dev` to get esbuild.
2. Open `brave://extensions` in Brave or `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the `chrome/build/extension` folder. The extension's ID is always `aaconkaemhjabkkimpelnggapgefegen`.
5. To use your Claude Code login, run `chrome/native-host/install.sh`. It installs a small helper program that runs `claude` for the extension, for Chrome and for Brave. You do not need the helper if you use an Anthropic API key.
6. Reload any Overleaf tab that was already open.

`install.sh` copies the helper into each browser's `NativeMessagingHosts` folder, because macOS does not let the browser run programs inside `~/Documents`. It supports macOS only.

To update, run `chrome/build.sh` again, click the reload icon on the extension's card, and reload the Overleaf tab. If `core/` or `chrome/native-host/` changed, run `install.sh` again too. To remove the extension, remove it on the extensions page. Then delete `com.aidenking.subtext.json` and the `com.aidenking.subtext` folder from the browser's `NativeMessagingHosts` folder.

### Install in Obsidian

1. Build the plugin with `obsidian/build.sh`. This creates `obsidian/build/subtext/` with `main.js`, `manifest.json`, and `styles.css`.
2. Copy the three files into `<vault>/.obsidian/plugins/subtext/`. Create the folder if it does not exist.
3. In Obsidian, open **Settings > Community plugins**. If Restricted mode is on, turn it off.
4. Under **Installed plugins**, turn on **SubTeXt**. If it is not in the list, click the reload icon.

To update, copy the new files over the old ones, then turn the plugin off and on again. To remove the plugin, turn it off and delete its folder.

## Configuration

### Settings on every platform

Every platform has the same five settings and a **Test** button. **Test** converts a sample with the current settings and shows the LaTeX or the error.

| Setting | What it does | Default |
| --- | --- | --- |
| Convert with | **Claude Code login** runs the `claude` CLI. **Anthropic API key** calls the Anthropic API directly. | Claude Code login |
| Model | Claude Haiku 5.5, Sonnet 5.5, or Opus 5.5. Select **Other model id** to type any model id. | Claude Haiku 5.5 |
| Anthropic API key | Your key for the Anthropic API. Where it is stored depends on the platform. | none |
| Path to the claude CLI | The full path to `claude`. Leave it empty to find it automatically. | empty |
| Delimiter | The text that opens and closes a trigger. | `%%`, or `;;` in Obsidian |

Apps started from the Dock do not see your shell's `PATH`. So SubTeXt looks for `claude` in `~/.local/bin`, `/opt/homebrew/bin`, and `/usr/local/bin`, then asks your login shell. The path it finds is shown in the empty path field.

### Configure Zotero

Open **Zotero > Settings** (**Edit > Settings** on Windows and Linux) and select **SubTeXt**. The API key is stored in the Zotero password manager, not in `prefs.js`.

### Configure the Overleaf extension

On the extensions page, click **Details** on SubTeXt, then **Extension options**. Each change is saved at once, and a new delimiter applies without reloading Overleaf. The API key is stored in the browser profile's extension storage, which is not encrypted. If **Test** says the helper program is not installed, run `chrome/native-host/install.sh`.

### Configure Obsidian

Open **Settings > SubTeXt**. For the API key, click **Link...** to pick or add a secret in Obsidian's keychain. The plugin saves only the secret's id in its `data.json`. Do not set the delimiter to `%%`, because that is Obsidian's comment syntax.

## Development

The conversion logic lives in `core/`, which has no app code. `core/subtext.mjs` holds the trigger detection, the prompt, the output formats, and each backend's request and response handling. `core/node/claude-cli.mjs` runs the `claude` CLI for the Node hosts. `DESIGN.md` describes the design and the facts about each app it rests on.

### Core

- Run `node --test core/test/` to test the core.
- Run `npm install` in `core/evals`, then `node core/evals/run.mjs` to check `SYSTEM_PROMPT` against 21 realistic inputs. It spends real tokens through your `claude` login, less than one cent for a run. Each output must parse with KaTeX, contain only ASCII, and keep the meaning of the input. Pass a path to use a different `claude`, and set `STX_MODEL` to try another model.
- To add a backend, add an entry to `BACKENDS` in `core/subtext.mjs`. Then add a transport with the same id to each host's `TRANSPORTS` table, in `zotero/src/subtext.js`, `chrome/background.js`, and `obsidian/src/main.js`.

### Zotero

- `zotero/core` is a symlink to `core/`, so the plugin loads `chrome://subtext/content/core/subtext.mjs` both from a checkout and from the `.xpi`.
- The settings pane builds its choices from `BACKENDS`. Give a new backend's settings group `data-backend="<id>"` in `zotero/prefs.xhtml`.
- In Zotero, `Zotero.SubTeXt.convert(text)` runs one conversion with the current settings and resolves to `{ ok, latex }` or `{ ok, error }`. Use it from **Tools > Developer > Run JavaScript**.
- The `update_url` in `zotero/manifest.json` is a placeholder. Zotero requires the field. Replace it with a real update manifest URL before you publish the plugin.

`zotero/dev/live/run.sh` starts a throwaway headless Zotero with its own profile and data directory, so your library is never opened. It links the plugin from this checkout and runs `zotero/dev/live/scenarios/` in order. Each scenario opens a new note and types into it with real key events. The scenarios cover inline math through the real `claude` CLI, display math, undo, a failing CLI path, a custom delimiter, disable and enable, the settings pane, and uninstall. It prints PASS or FAIL for each scenario and keeps screenshots in the work directory it names. Set `XPI=zotero/build/subtext.xpi` to test the built plugin, and `ONLY="01-inline.js 03-undo.js"` to run some scenarios. A small driver plugin in `zotero/dev/live/driver` runs each scenario. It is active only when `STX_CMD_DIR` is set.

### Overleaf extension

- `chrome/core` and `chrome/native-host/core` are symlinks to `core/`. `chrome/build.sh` bundles the content scripts `overleaf.js` and `bridge.js` with the core they import, because content scripts cannot be ES modules. CodeMirror is never bundled. SubTeXt uses the CodeMirror classes that Overleaf passes to its hook.
- Give a new backend's settings section `data-backend="<id>"` in `chrome/options.html`.

`chrome/dev/live/run.mjs` tests the extension in a throwaway browser profile. Run `npm install` and `npx playwright install chromium` in `chrome/dev` once. Then run `node chrome/dev/live/run.mjs`, and pass a work directory to keep the results in a known place. It builds the extension, loads it into Playwright's Chromium, and installs the helper program into that profile only. It serves a page at `https://www.overleaf.com/project/fixture` that fires Overleaf's hook with real CodeMirror code, in light and dark themes, under Overleaf's content security policy. Each scenario types with real key events. The scenarios cover inline and display math through the real `claude` CLI, typing while a conversion runs, deleting or editing the trigger while it runs, undo, a wrong CLI path, a custom delimiter, the options page and its Test button, and the Anthropic API with a fake key. It prints PASS or FAIL for each scenario and keeps screenshots in the work directory. Set `HEADED=1` to watch, and `ONLY="inline undo"` to run some scenarios. A full run costs well under one cent.

`chrome/dev/live/overleaf.mjs` tries the extension on overleaf.com in Brave. Give it a folder of its own, not your Chrome or Brave profile. Google refuses sign-in in a browser that automation controls, so sign in first with `node chrome/dev/live/overleaf.mjs --sign-in <profile-dir>`. That opens a plain Brave window. Sign in to Overleaf, then quit the window with Cmd+Q. The folder keeps the sign-in. Then run `node chrome/dev/live/overleaf.mjs <profile-dir>`. It creates a project named `SubTeXt scratch <time>`, converts an inline and a whole-line trigger in `main.tex`, and prints PASS or FAIL. At the end it moves that project to the trash and deletes it permanently. It finds the project by the ID it recorded when it created it, so it never touches your other projects. Set `BROWSER` to the path of another Chromium browser to test there instead. If Overleaf's dashboard has changed, fix the selectors at the top of the file.

### Obsidian

Run `npm install` in `obsidian`, then `node obsidian/dev/live/run.mjs`. It builds the plugin and starts a separate Obsidian with its own user data directory and a scratch vault, so your own Obsidian settings and vaults are never opened. The window opens behind the app you are using, so your typing does not reach it. The harness links the plugin into the scratch vault, accepts the "trust the author" prompt, and drives Obsidian with Playwright over the Chrome DevTools Protocol, typing with real key events. The scenarios in `obsidian/dev/live/scenarios/` cover inline and display math through the real `claude` CLI, typing and deleting while a conversion is pending, undo, `%%` comments, a custom delimiter, a failing CLI path, the settings tab, the Anthropic backend with a fake key, and disabling the plugin. It prints PASS or FAIL for each scenario and keeps screenshots in the work directory it names. Pass a directory to use it as the work directory. Set `ONLY="01 05"` to run some scenarios, and `PLUGIN_FILES=obsidian/build/subtext` to test the built release folder.

The Obsidian app bundle can be older than the version you run, because Obsidian updates itself by saving a newer app package in its user data directory. The harness downloads Obsidian 1.13.4's package from the Obsidian releases on GitHub, checks its SHA-256 digest, and caches it in `$STX_CACHE`, which defaults to a folder in your temp directory. Set `OBSIDIAN_VERSION` to test another version.
