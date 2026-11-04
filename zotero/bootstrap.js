'use strict';

const SCRIPTS = ['src/subtext.js'];
const PREFS = ['backend', 'model', 'claudePath', 'delimiter'];

var chromeHandle = null;

function install() {}

function uninstall(data, reason) {
  if (reason !== ADDON_UNINSTALL) return;
  for (const name of PREFS) Zotero.Prefs.clear(`extensions.subtext.${name}`, true);
  for (const login of Services.logins.findLogins('chrome://subtext', null, 'Anthropic API key')) {
    Services.logins.removeLogin(login);
  }
}

function startup({ id, rootURI }) {
  const aomStartup = Components.classes['@mozilla.org/addons/addon-manager-startup;1']
    .getService(Components.interfaces.amIAddonManagerStartup);
  chromeHandle = aomStartup.registerChrome(
    Services.io.newURI(`${rootURI}manifest.json`),
    [['content', 'subtext', rootURI]],
  );
  for (const script of SCRIPTS) {
    Services.scriptloader.loadSubScriptWithOptions(rootURI + script, { target: globalThis, ignoreCache: true });
  }
  SubTeXt.startup();
  Zotero.PreferencePanes.register({
    pluginID: id,
    src: rootURI + 'prefs.xhtml',
    scripts: [rootURI + 'src/prefs-pane.js'],
    id: 'subtext-prefpane',
    label: 'SubTeXt',
  });
  for (const window of Zotero.getMainWindows()) SubTeXt.attach(window);
}

function onMainWindowLoad({ window }) {
  SubTeXt.attach(window);
}

function onMainWindowUnload({ window }) {
  SubTeXt.detach(window);
}

function shutdown() {
  SubTeXt.shutdown();
  chromeHandle?.destruct();
  chromeHandle = null;
}
