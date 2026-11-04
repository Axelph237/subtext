const T = win.Zotero_Tabs;
const Ci = Components.interfaces, Cc = Components.classes;
const fails = [];
const check = (cond, msg, detail) => { if (!cond) fails.push(detail === undefined ? msg : msg + ' :: ' + JSON.stringify(detail)); };
const wait = (ms) => Zotero.Promise.delay(ms);
async function until(fn, ms = 5000) { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(100); } return false; }
const PREF = 'extensions.quickmath.';
const setPref = (name, value) => Zotero.Prefs.set(PREF + name, value, true);
const resetPrefs = () => { for (const n of ['backend', 'model', 'claudePath', 'delimiter']) Zotero.Prefs.clear(PREF + n, true); };

const editorInstance = (itemID) => Zotero.Notes._editorInstances.find((e) => e.itemID === itemID && e.viewMode === 'tab');
const iframeWindow = (itemID) => editorInstance(itemID)._iframeWindow;
const viewOf = (itemID) => iframeWindow(itemID).wrappedJSObject._currentEditorInstance._editorCore.view;

async function openNote(html = '<p></p>') {
  const item = new Zotero.Item('note');
  item.libraryID = Zotero.Libraries.userLibraryID;
  item.setNote(`<div data-schema-version="9">${html}</div>`);
  await item.saveTx();
  await Zotero.Notes.open(item.id, undefined, { openInWindow: false });
  check(await until(() => { try { return !!viewOf(item.id); } catch { return false; } }, 10000), 'note editor view is ready');
  await wait(500);
  const view = viewOf(item.id);
  iframeWindow(item.id).focus();
  view.focus();
  const sel = view.state.selection.constructor.atEnd(view.state.doc);
  view.dispatch(view.state.tr.setSelection(sel));
  return { item, view, iwin: iframeWindow(item.id) };
}

// Real key events through nsITextInputProcessor, so ProseMirror sees keydown, beforeinput, and input.
function tipFor(iwin) {
  const tip = Cc['@mozilla.org/text-input-processor;1'].createInstance(Ci.nsITextInputProcessor);
  if (!tip.beginInputTransactionForTests(iwin)) throw new Error('TIP transaction refused');
  return tip;
}
async function typeText(iwin, text) {
  const tip = tipFor(iwin);
  for (const ch of text) {
    const ev = new iwin.KeyboardEvent('', { key: ch });
    tip.keydown(ev);
    tip.keyup(ev);
    await wait(10);
  }
}
async function pressAccel(iwin, key) {
  const tip = tipFor(iwin);
  const isMac = Services.appinfo.OS === 'Darwin';
  const mod = new iwin.KeyboardEvent('', isMac ? { key: 'Meta', code: 'MetaLeft' } : { key: 'Control', code: 'ControlLeft' });
  const ev = new iwin.KeyboardEvent('', { key, code: 'Key' + key.toUpperCase(), keyCode: key.toUpperCase().charCodeAt(0) });
  tip.keydown(mod);
  tip.keydown(ev);
  tip.keyup(ev);
  tip.keyup(mod);
  await wait(200);
}

const docJSON = (view) => JSON.parse(JSON.stringify(view.state.doc.toJSON()));
function nodesOfType(view, type) {
  const found = [];
  const visit = (node) => {
    if (node.type.name === type) found.push(node.textContent);
    for (let i = 0; i < node.childCount; i++) visit(node.child(i));
  };
  visit(view.state.doc);
  return found;
}
const pills = (iwin) => iwin.document.querySelectorAll('.quickmath-pill').length;
const docText = (view) => view.state.doc.textContent;
async function savedHTML(item, pattern, ms = 8000) {
  await until(() => pattern.test(Zotero.Items.get(item.id).getNote()), ms);
  return Zotero.Items.get(item.id).getNote();
}
function progressWindowTexts() {
  const texts = [];
  for (const w of Services.wm.getEnumerator(null)) {
    if (String(w.location).includes('progressWindow')) texts.push(w.document.documentElement.textContent.replace(/\s+/g, ' ').trim());
  }
  return texts;
}
