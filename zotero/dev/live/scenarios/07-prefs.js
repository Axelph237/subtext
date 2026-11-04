resetPrefs();
Zotero.Utilities.Internal.openPreferences('quickmath-prefpane');
let prefWin = null;
check(await until(() => (prefWin = Services.wm.getMostRecentWindow('zotero:pref')) && prefWin.document.getElementById('quickmath-test'), 15000), 'Quick Math pane loads in Settings');
const $ = (id) => prefWin.document.getElementById(id);
prefWin.resizeTo(900, 820);
const detected = await Zotero.QuickMath.detectClaudePath();
check(await until(() => $('quickmath-claude-path').placeholder === detected, 5000), 'CLI path placeholder is the detected path', [$('quickmath-claude-path').placeholder, detected]);
const radios = [...$('quickmath-backend').querySelectorAll('radio')].map((r) => [r.value, r.label]);
check(JSON.stringify(radios) === JSON.stringify(Object.entries(Zotero.QuickMath.core.BACKENDS).map(([id, b]) => [id, b.label])), 'one radio per registered backend', radios);
check($('quickmath-backend').value === 'claude-code', 'Claude Code is selected by default', $('quickmath-backend').value);
const items = [...$('quickmath-model').menupopup.children].map((m) => m.value);
check(items.length === 4 && items[0] === 'claude-haiku-5-5', 'model list has the three models and Other', items);
check($('quickmath-model').value === 'claude-haiku-5-5', 'Haiku is selected by default');
const shown = (backend) => !prefWin.document.querySelector(`[data-backend="${backend}"]`).hidden;
check(shown('claude-code') && !shown('anthropic'), 'only Claude Code settings show for the Claude Code backend');

$('quickmath-test').doCommand();
check(await until(() => /\\int/.test($('quickmath-test-result').textContent), 30000), 'Test button shows converted LaTeX', $('quickmath-test-result').textContent);
const result = $('quickmath-test-result').textContent;
const testShot = await snap('07-prefs-test', prefWin);

$('quickmath-backend').selectedItem = $('quickmath-backend').querySelector('radio[value="anthropic"]');
$('quickmath-backend').dispatchEvent(new prefWin.Event('command'));
check(Zotero.Prefs.get(PREF + 'backend', true) === 'anthropic', 'choosing API key saves the backend pref');
check(shown('anthropic') && !shown('claude-code'), 'API key settings show for the API key backend');
$('quickmath-api-key').value = '';
$('quickmath-test').doCommand();
check(await until(() => /Error: No Anthropic API key/.test($('quickmath-test-result').textContent), 5000), 'Test with no key shows the error', $('quickmath-test-result').textContent);
const errorShot = await snap('07-prefs-error', prefWin);

$('quickmath-api-key').value = 'sk-ant-not-a-real-key';
$('quickmath-api-key').dispatchEvent(new prefWin.Event('change'));
await wait(300);
check(Zotero.QuickMath.getApiKey() === 'sk-ant-not-a-real-key', 'API key is stored in the login manager');
check(!Services.prefs.getBranch('extensions.quickmath.').getChildList('').some((name) => String(Zotero.Prefs.get(PREF + name, true)).includes('sk-ant')), 'API key is not written to prefs');
$('quickmath-test').doCommand();
check(await until(() => /^Error: /.test($('quickmath-test-result').textContent) && !/No Anthropic API key/.test($('quickmath-test-result').textContent), 20000), 'Test with a bad key shows the API error', $('quickmath-test-result').textContent);
const apiError = $('quickmath-test-result').textContent;

$('quickmath-model').value = '__other__';
$('quickmath-model').dispatchEvent(new prefWin.Event('command'));
check(!$('quickmath-model-custom').hidden, 'Other reveals the model id field');
$('quickmath-model-custom').value = 'claude-sonnet-5-5';
$('quickmath-model-custom').dispatchEvent(new prefWin.Event('input'));
check(Zotero.Prefs.get(PREF + 'model', true) === 'claude-sonnet-5-5', 'free-text model id is saved');

await Zotero.QuickMath.setApiKey('');
prefWin.close();
resetPrefs();
return { fails, result, apiError, testShot, errorShot };
