'use strict';

const SCRIPTS = ['src/quickmath.js'];
const PREFS = ['backend', 'model', 'claudePath', 'delimiter'];

var chromeHandle = null;

function install() {}

function uninstall(data, reason) {
  if (reason !== ADDON_UNINSTALL) return;
  for (const name of PREFS) Zotero.Prefs.clear(`extensions.quickmath.${name}`, true);
  for (const login of Services.logins.findLogins('chrome://quickmath', null, 'Anthropic API key')) {
    Services.logins.removeLogin(login);
  }
}

function startup({ id, rootURI }) {
  const aomStartup = Components.classes['@mozilla.org/addons/addon-manager-startup;1']
    .getService(Components.interfaces.amIAddonManagerStartup);
  chromeHandle = aomStartup.registerChrome(
    Services.io.newURI(`${rootURI}manifest.json`),
    [['content', 'quickmath', rootURI]],
  );
  for (const script of SCRIPTS) {
    Services.scriptloader.loadSubScriptWithOptions(rootURI + script, { target: globalThis, ignoreCache: true });
  }
  QuickMath.startup();
  Zotero.PreferencePanes.register({
    pluginID: id,
    src: rootURI + 'prefs.xhtml',
    scripts: [rootURI + 'src/prefs-pane.js'],
    id: 'quickmath-prefpane',
    label: 'Quick Math',
  });
  for (const window of Zotero.getMainWindows()) QuickMath.attach(window);
}

function onMainWindowLoad({ window }) {
  QuickMath.attach(window);
}

function onMainWindowUnload({ window }) {
  QuickMath.detach(window);
}

function shutdown() {
  QuickMath.shutdown();
  chromeHandle?.destruct();
  chromeHandle = null;
}
