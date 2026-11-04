'use strict';

var SubTeXt = (() => {
  const core = ChromeUtils.importESModule('chrome://subtext/content/core/subtext.mjs');
  const { Subprocess } = ChromeUtils.importESModule('resource://gre/modules/Subprocess.sys.mjs');
  const { BACKENDS, DEFAULT_BACKEND, DEFAULT_MODEL, DEFAULT_DELIMITER, findTrigger } = core;
  Components.utils.importGlobalProperties(['fetch']);

  const PREF = 'extensions.subtext.';
  const LOGIN_ORIGIN = 'chrome://subtext';
  const LOGIN_REALM = 'Anthropic API key';
  const CLI_TIMEOUT_MS = 60000;
  const CLAUDE_CANDIDATES = ['~/.local/bin/claude', '/opt/homebrew/bin/claude', '/usr/local/bin/claude'];
  // Non-text inline nodes (citations, images, math) read as one placeholder each,
  // so a trigger can never span them.
  const OBJECT = '\ufffc';
  const PILL_COLORS = {
    light: { text: '#2c5cc5', fill: '#eef3fd', edge: '#c4d4f6' },
    dark: { text: '#a8c2f7', fill: '#1f2c45', edge: '#38507f' },
  };

  function readSettings() {
    const get = (name) => String(Zotero.Prefs.get(PREF + name, true) ?? '').trim();
    const backend = get('backend');
    return {
      backend: Object.hasOwn(BACKENDS, backend) ? backend : DEFAULT_BACKEND,
      model: get('model') || DEFAULT_MODEL,
      claudePath: get('claudePath'),
      delimiter: get('delimiter') || DEFAULT_DELIMITER,
    };
  }

  function getApiKey() {
    return Services.logins.findLogins(LOGIN_ORIGIN, null, LOGIN_REALM)[0]?.password || '';
  }

  async function setApiKey(key) {
    for (const login of Services.logins.findLogins(LOGIN_ORIGIN, null, LOGIN_REALM)) Services.logins.removeLogin(login);
    if (!key) return;
    const login = Components.classes['@mozilla.org/login-manager/loginInfo;1'].createInstance(Components.interfaces.nsILoginInfo);
    login.init(LOGIN_ORIGIN, null, LOGIN_REALM, 'api-key', key, '', '');
    await Services.logins.addLoginAsync(login);
  }

  async function readAll(pipe) {
    let text = '';
    for (let chunk = await pipe.readString(); chunk; chunk = await pipe.readString()) text += chunk;
    return text;
  }

  async function run(command, args, stdin = '') {
    const proc = await Subprocess.call({ command, arguments: args, stderr: 'pipe', environmentAppend: true, workdir: PathUtils.tempDir });
    const timer = setTimeout(() => proc.kill(), CLI_TIMEOUT_MS);
    try {
      proc.stdin.write(stdin);
      await proc.stdin.close();
      const [stdout, stderr] = await Promise.all([readAll(proc.stdout), readAll(proc.stderr)]);
      const { exitCode } = await proc.wait();
      return { stdout, stderr, exitCode };
    } finally {
      clearTimeout(timer);
    }
  }

  // GUI apps do not inherit the shell PATH, so look where installers put claude, then ask a login shell.
  async function detectClaudePath() {
    const home = Services.dirsvc.get('Home', Components.interfaces.nsIFile).path;
    for (const candidate of CLAUDE_CANDIDATES) {
      const path = candidate.replace(/^~/, home);
      if (await IOUtils.exists(path)) return path;
    }
    try {
      const { stdout } = await run(Services.env.get('SHELL') || '/bin/zsh', ['-lc', 'command -v claude']);
      const path = stdout.trim().split('\n').pop();
      if (path?.startsWith('/') && await IOUtils.exists(path)) return path;
    } catch (e) {
      Zotero.debug(`SubTeXt: login shell lookup failed: ${e}`);
    }
    return '';
  }

  const TRANSPORTS = {
    async anthropic(backend, settings, conversion) {
      const apiKey = getApiKey();
      if (!apiKey) return { ok: false, error: 'No Anthropic API key is set. Add one in Settings > SubTeXt.' };
      const { url, init } = backend.buildRequest({ model: settings.model, apiKey }, conversion);
      let response;
      try {
        response = await fetch(url, init);
      } catch (e) {
        return { ok: false, error: `Could not reach the Anthropic API: ${e.message}` };
      }
      let json;
      try {
        json = await response.json();
      } catch {
        return { ok: false, error: `The Anthropic API returned HTTP ${response.status} without JSON.` };
      }
      return backend.parseResponse(json);
    },

    async 'claude-code'(backend, settings, conversion) {
      const command = settings.claudePath || await detectClaudePath();
      if (!command) return { ok: false, error: 'Could not find the claude CLI. Set its path in Settings > SubTeXt.' };
      let output;
      try {
        output = await run(command, backend.buildArgs({ model: settings.model }), backend.stdinFor(conversion));
      } catch (e) {
        return { ok: false, error: `Could not run ${command}: ${e.message || e}` };
      }
      if (!output.stdout.trim()) {
        return { ok: false, error: output.stderr.trim() || `${command} exited with code ${output.exitCode} and printed nothing.` };
      }
      return backend.parseOutput(output.stdout);
    },
  };

  async function convert(conversion, settings = readSettings()) {
    try {
      return await TRANSPORTS[settings.backend](BACKENDS[settings.backend], settings, conversion);
    } catch (e) {
      Zotero.logError(e);
      return { ok: false, error: String(e.message || e) };
    }
  }

  // ProseMirror objects live in the note-editor iframe; chrome code reaches them unwrapped.
  function editorViewFor(target) {
    const view = target.ownerGlobal?.wrappedJSObject?._currentEditorInstance?._editorCore?.view;
    return view && view.dom.contains(target) ? view : null;
  }

  function inlineText(block, blockStart, limit = block.content.size) {
    let text = '';
    const positions = [];
    for (let i = 0, offset = 0; i < block.childCount && offset < limit; i++) {
      const child = block.child(i);
      const chars = child.isText ? child.text.slice(0, limit - offset) : OBJECT;
      for (let j = 0; j < chars.length; j++) positions.push(blockStart + offset + j);
      text += chars;
      offset += child.nodeSize;
    }
    return { text, positions };
  }

  function nearestOccurrence(doc, text, near) {
    let best = null;
    const visit = (node, pos) => {
      if (node.isTextblock) {
        const inline = inlineText(node, pos + 1);
        for (let i = inline.text.indexOf(text); i !== -1; i = inline.text.indexOf(text, i + 1)) {
          const from = inline.positions[i];
          if (!best || Math.abs(from - near) < Math.abs(best.from - near)) {
            best = { from, to: from + text.length, block: node, blockPos: pos, whole: inline.text.trim() === text };
          }
        }
        return;
      }
      for (let i = 0, offset = 0; i < node.childCount; i++) {
        const child = node.child(i);
        visit(child, pos + 1 + offset);
        offset += child.nodeSize;
      }
    };
    for (let i = 0, offset = 0; i < doc.childCount; i++) {
      const child = doc.child(i);
      visit(child, offset);
      offset += child.nodeSize;
    }
    return best;
  }

  function replaceWithMath(view, match, latex) {
    const { state } = view;
    const { schema } = state;
    const tr = state.tr;
    const $block = state.doc.resolve(match.blockPos);
    const display = schema.nodes.math_display;
    if (match.whole && match.block.type.name === 'paragraph'
      && $block.parent.canReplaceWith($block.index(), $block.index() + 1, display)) {
      const end = match.blockPos + match.block.nodeSize;
      const cursorInside = state.selection.from >= match.blockPos && state.selection.to <= end;
      tr.replaceWith(match.blockPos, end, display.create(null, schema.text(latex)));
      if (cursorInside) {
        const after = tr.mapping.map(end);
        tr.insert(after, schema.nodes.paragraph.create());
        tr.setSelection(state.selection.constructor.near(tr.doc.resolve(after + 1)));
      }
    } else {
      tr.replaceWith(match.from, match.to, schema.nodes.math_inline.create(null, schema.text(latex)));
    }
    view.dispatch(tr);
  }

  function showPill(view, pos) {
    const doc = view.dom.ownerDocument;
    const coords = view.coordsAtPos(pos);
    const palette = doc.defaultView.matchMedia('(prefers-color-scheme: dark)').matches ? PILL_COLORS.dark : PILL_COLORS.light;
    const pill = doc.createElement('div');
    pill.className = 'subtext-pill';
    pill.textContent = 'Converting to LaTeX';
    pill.style.cssText = [
      'position: fixed', `left: ${Math.round(coords.left)}px`, `top: ${Math.round(coords.bottom + 3)}px`,
      'z-index: 1000', 'pointer-events: none', 'padding: 1px 8px', 'border-radius: 999px',
      'font: 500 11px/16px system-ui, sans-serif', `color: ${palette.text}`, `background: ${palette.fill}`,
      `border: 1px solid ${palette.edge}`, 'box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12)',
    ].join('; ');
    doc.body.append(pill);
    pill.animate(Components.utils.cloneInto([{ opacity: 1 }, { opacity: 0.5 }], doc.defaultView),
      Components.utils.cloneInto({ duration: 700, iterations: Infinity, direction: 'alternate' }, doc.defaultView));
    return pill;
  }

  function showError(message) {
    const progress = new Zotero.ProgressWindow({ closeOnClick: true });
    progress.changeHeadline('SubTeXt could not convert');
    progress.addDescription(message);
    progress.show();
    progress.startCloseTimer(8000);
  }

  // Each record is one in-flight conversion: { win, view, text, from, pill }.
  // A record that is no longer in the set was released by detach; its result is dropped.
  const pending = new Set();
  const listeners = new Map();

  function isLive(view) {
    return !Components.utils.isDeadWrapper(view) && !view.isDestroyed;
  }

  async function onInput(win, event) {
    const view = editorViewFor(event.target);
    if (!view || !view.editable) return;
    // This capture listener runs before ProseMirror reads the DOM change into its state.
    await new Promise((resolve) => win.setTimeout(resolve, 0));
    if (!isLive(view)) return;
    const { $cursor } = view.state.selection;
    if (!$cursor) return;
    const settings = readSettings();
    const before = inlineText($cursor.parent, $cursor.start(), $cursor.parentOffset);
    const trigger = findTrigger(before.text, settings.delimiter);
    if (!trigger || trigger.input.includes(OBJECT)) return;
    const text = before.text.slice(trigger.start, trigger.end);
    const from = before.positions[trigger.start];
    for (const other of pending) if (other.view === view && other.from === from && other.text === text) return;

    const record = { win, view, text, from, pill: showPill(view, from) };
    pending.add(record);
    const result = await convert({ input: trigger.input, context: '' }, settings);
    if (!pending.has(record)) return;
    release(record);
    if (!result.ok) {
      showError(result.error);
      return;
    }
    if (!isLive(view)) return;
    const match = nearestOccurrence(view.state.doc, text, from);
    if (match) replaceWithMath(view, match, result.latex);
  }

  function release(record) {
    pending.delete(record);
    if (!Components.utils.isDeadWrapper(record.pill)) record.pill.remove();
  }

  function attach(win) {
    if (listeners.has(win)) return;
    const listener = (event) => onInput(win, event);
    win.addEventListener('input', listener, true);
    listeners.set(win, listener);
  }

  function detach(win) {
    const listener = listeners.get(win);
    if (!listener) return;
    win.removeEventListener('input', listener, true);
    listeners.delete(win);
    for (const record of pending) if (record.win === win) release(record);
  }

  function startup() {
    Zotero.SubTeXt = { convert, detectClaudePath, getApiKey, setApiKey, core };
  }

  function shutdown() {
    for (const win of [...listeners.keys()]) detach(win);
    for (const record of pending) release(record);
    delete Zotero.SubTeXt;
  }

  return { startup, shutdown, attach, detach };
})();
