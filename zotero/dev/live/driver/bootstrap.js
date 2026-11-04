var timer;
const CMD_DIR = Services.env.get("STX_CMD_DIR");
function startup() {
  if (!CMD_DIR) return;
  timer = Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer);
  let busy = false;
  timer.initWithCallback({ notify: async () => {
    if (busy) return;
    busy = true;
    try {
      let children = await IOUtils.getChildren(CMD_DIR);
      for (let path of children.filter(p => p.endsWith(".js")).sort()) {
        let code = await IOUtils.readUTF8(path);
        await IOUtils.remove(path);
        let out;
        try {
          let win = Zotero.getMainWindow();
          let fn = new win.Function("Zotero", "win", "snap", `return (async () => { ${code} })()`);
          let value = await fn(Zotero, win, (name, target) => snap(target || win, name));
          out = { ok: true, value };
        } catch (e) {
          out = { ok: false, error: String(e), stack: e && e.stack };
        }
        let json;
        try { json = JSON.stringify(out, null, 2); } catch (e) { json = JSON.stringify({ ok: false, error: "unserializable: " + e }); }
        await IOUtils.writeUTF8(path.replace(/\.js$/, ".out"), json);
      }
    } catch (e) { Zotero.logError(e); }
    busy = false;
  } }, 200, Components.interfaces.nsITimer.TYPE_REPEATING_SLACK);
}
async function snap(win, name) {
  let w = win.innerWidth, h = win.innerHeight;
  let canvas = win.document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
  canvas.width = w; canvas.height = h;
  let ctx = canvas.getContext("2d");
  ctx.drawWindow(win, 0, 0, w, h, "white", ctx.DRAWWINDOW_DRAW_VIEW | ctx.DRAWWINDOW_DRAW_CARET);
  let blob = await new Promise(r => canvas.toBlob(r, "image/png"));
  let buf = new Uint8Array(await blob.arrayBuffer());
  let path = CMD_DIR + "/../" + name + ".png";
  await IOUtils.write(path, buf);
  return path;
}
function shutdown() { timer && timer.cancel(); }
function install() {}
function uninstall() {}
