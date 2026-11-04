# SubTeXt

*LaTeX with context.*

Type math in plain words between two delimiters. When you type the closing delimiter, SubTeXt replaces it with LaTeX.

```
%% integral from 0 to infinity of e to the minus x squared %%
```

That becomes `\int_0^\infty e^{-x^2}\,dx`.

SubTeXt works in Zotero, Overleaf (in Brave or Chrome), and Obsidian. It calls Claude through your Claude Code login or an Anthropic API key. The default model is Claude Haiku 5.5, at about $0.0002 per conversion, or $0.0003 with the default 2,000 characters of context.

## Contents

- [Features](#features)
  - [Zotero](#features-in-zotero)
  - [Overleaf](#features-in-overleaf)
  - [Obsidian](#features-in-obsidian)
- [Installation](#installation)
  - [Zotero](#install-in-zotero)
  - [Overleaf](#install-in-overleaf)
  - [Obsidian](#install-in-obsidian)
- [Configuration](#configuration)
  - [Zotero](#configure-zotero)
  - [Overleaf](#configure-overleaf)
  - [Obsidian](#configure-obsidian)
- [Development](#development)

## Features

- Plain words and sloppy LaTeX both work. `x^10` becomes `x^{10}`, and `sum i=1 to n` becomes `\sum_{i=1}^{n}`.
- SubTeXt writes down what you typed. It does not solve or simplify the math.
- SubTeXt also sends the model the text just before the trigger, so the LaTeX matches your notation, such as bold vectors or symbols you defined earlier. Set how many characters to send, or 0 to send only the math.
- A trigger inside a line becomes inline math. A trigger on its own line becomes display math.
- You can keep typing while a conversion runs. If you edit the trigger first, SubTeXt drops the result.
- Cmd+Z (Ctrl+Z on Windows and Linux) undoes the conversion.
- If a conversion fails, your text stays as typed and SubTeXt shows the error.

### Features in Zotero

- The default delimiter is `%%`.
- The result is a Zotero math node. Zotero saves it as `$...$` inline or `$$...$$` for display math.
- SubTeXt is tested on Zotero 10.0.7.

### Features in Overleaf

- The default delimiter is `%%`. An unconverted trigger is then a LaTeX comment and never reaches your PDF.
- The result is `$...$` inline or `\[ ... \]` for display math.
- SubTeXt uses Overleaf's unofficial `UNSTABLE_editor:extensions` hook, so an Overleaf update can break it.
- It runs on overleaf.com only, not on self-hosted servers.

### Features in Obsidian

- The default delimiter is `;;`, because `%%` starts an Obsidian comment.
- The result is `$...$` inline or a `$$` block for display math.
- The plugin needs Obsidian 1.11.4 or later on the desktop.

## Installation

You need Node to build each plugin. To use your Claude Code login, sign in once with `claude` in a terminal.

### Install in Zotero

```sh
zotero/build.sh
```

In Zotero, open **Tools > Plugins** and drag `zotero/build/subtext.xpi` onto the window.

### Install in Overleaf

```sh
chrome/build.sh
chrome/native-host/install.sh   # only for the Claude Code login
```

1. Open `brave://extensions` or `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select `chrome/build/extension`.
4. Reload any open Overleaf tab.

After an update, run both scripts again and click the reload icon on the extension's card.

### Install in Obsidian

```sh
obsidian/build.sh
mkdir -p <vault>/.obsidian/plugins/subtext
cp obsidian/build/subtext/* <vault>/.obsidian/plugins/subtext/
```

In Obsidian, open **Settings > Community plugins** and turn on **SubTeXt**.

## Configuration

Every platform has the same settings and a **Test** button that runs one conversion.

| Setting | Default |
| --- | --- |
| Convert with: Claude Code login or Anthropic API key | Claude Code login |
| Model: Haiku 5.5, Sonnet 5.5, Opus 5.5, or any model id | Claude Haiku 5.5 |
| Anthropic API key | none |
| Path to the `claude` CLI | found automatically |
| Delimiter | `%%`, or `;;` in Obsidian |
| Context: characters of text before the trigger to send, 0 for none | 2000 |

### Configure Zotero

Open **Settings > SubTeXt**. Zotero keeps the API key in its password manager.

### Configure Overleaf

On the extension's card, click **Details**, then **Extension options**. The browser keeps the API key unencrypted in your profile.

### Configure Obsidian

Open **Settings > SubTeXt**. Obsidian keeps the API key in its keychain.

## Development

Run `npm install` in `core/evals`, `chrome/dev`, and `obsidian` first. The extension tests also need `npx playwright install chromium` in `chrome/dev`.

```sh
node --test core/test/           # unit tests
node core/evals/run.mjs          # prompt check, spends real tokens
zotero/dev/live/run.sh           # Zotero tests
node chrome/dev/live/run.mjs     # extension tests on a copy of Overleaf's editor
node obsidian/dev/live/run.mjs   # Obsidian tests
```

The live tests use their own profiles. They never open your library, browser profile, or vaults.

To test on overleaf.com, sign in once in a separate Brave profile, then run the test. It creates one scratch project and deletes it at the end.

```sh
node chrome/dev/live/overleaf.mjs --sign-in <profile-dir>
node chrome/dev/live/overleaf.mjs <profile-dir>
```

`DESIGN.md` explains how each part works.
