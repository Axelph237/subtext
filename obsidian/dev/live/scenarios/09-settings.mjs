import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { detectClaudePath } from '../../../../core/node/claude-cli.mjs';

const KEY_ID = 'subtext-settings-key';
const KEY = 'sk-ant-settings-roundtrip';

export default async ({ page, vault, check, snap, until, wait, setTheme }) => {
  const dataPath = join(vault, '.obsidian/plugins/subtext/data.json');
  // Obsidian may be mid-write when the file is read; an unparsable read counts as not saved yet.
  const data = async () => { try { return JSON.parse(await readFile(dataPath, 'utf8')); } catch { return {}; } };
  const saved = (field, value) => until(async () => (await data())[field] === value, 3000);
  const tab = page.locator('.modal.mod-settings .vertical-tab-content');
  const row = (name) => tab.locator('.setting-item').filter({ has: page.locator('.setting-item-name').getByText(name, { exact: true }) });
  const open = async () => {
    await page.evaluate(() => { app.setting.open(); app.setting.openTabById('subtext'); });
    await row('Convert with').waitFor();
  };
  const result = () => tab.locator('.subtext-test-result').innerText();

  await open();
  const detected = await detectClaudePath();
  const path = row('Path to the claude CLI').locator('input');
  check(await until(async () => await path.getAttribute('placeholder') === detected, 5000), 'the claude path field shows the detected path', await path.getAttribute('placeholder'));
  await path.fill(detected);
  check(await saved('claudePath', detected), 'the claude path is saved', await data());

  const delimiter = row('Delimiter').locator('input');
  check(await delimiter.inputValue() === ';;', 'the delimiter field shows ;;', await delimiter.inputValue());
  await delimiter.fill('!!');
  check(await saved('delimiter', '!!'), 'a custom delimiter is saved', await data());
  await delimiter.fill('');
  check(await saved('delimiter', ';;'), 'an empty delimiter saves the default', await data());

  await row('Test').locator('button').click();
  check(await until(async () => /\\int/.test(await result()), 30000), 'Test converts through the claude CLI', await result());
  await snap('09-test-result');

  const model = row('Model').locator('select:not(.is-measuring)');
  await model.selectOption('claude-sonnet-5-5');
  check(await saved('model', 'claude-sonnet-5-5'), 'a listed model is saved', await data());
  await model.selectOption('__other__');
  await row('Model id').locator('input').fill('claude-custom-model');
  check(await saved('model', 'claude-custom-model'), 'an other model id is saved', await data());
  await model.selectOption('claude-haiku-5-5');
  check(await saved('model', 'claude-haiku-5-5'), 'switching back to a listed model saves it', await data());
  check(await row('Model id').count() === 0, 'the model id field hides for a listed model');

  await row('Convert with').locator('select:not(.is-measuring)').selectOption('anthropic');
  check(await saved('backend', 'anthropic'), 'the backend is saved', await data());
  check(await row('Path to the claude CLI').count() === 0, 'the claude path hides for the API backend');
  await row('Anthropic API key').getByRole('button').click();
  const select = page.locator('.modal.mod-secret');
  if (await select.isVisible()) await select.getByRole('button', { name: 'Add secret...' }).click();
  const add = page.locator('.modal').filter({ has: page.locator('.modal-title').getByText('Add secret', { exact: true }) });
  await add.locator('input[placeholder="secret-name"]').fill(KEY_ID);
  await add.locator('input').nth(1).fill(KEY);
  await add.getByRole('button', { name: 'Save' }).click();
  if (await select.isVisible()) await select.getByRole('button', { name: 'Save' }).click();
  check(await saved('apiKeySecret', KEY_ID), 'data.json stores the secret id', await data());
  check(!(await readFile(dataPath, 'utf8')).includes(KEY), 'data.json does not contain the key');
  check(await page.evaluate((id) => app.secretStorage.getSecret(id), KEY_ID) === KEY, 'the key round-trips through secretStorage');
  await snap('09-settings-light');
  await setTheme(page, 'obsidian');
  await snap('09-settings-dark');
  await setTheme(page, 'moonstone');

  await row('Test').locator('button').click();
  check(await until(async () => /^Error: .*invalid x-api-key/.test(await result()), 20000), 'Test shows the API error for a fake key', await result());

  await page.keyboard.press('Escape');
  await page.evaluate(async () => { await app.plugins.disablePlugin('subtext'); await app.plugins.enablePlugin('subtext'); });
  const reloaded = await page.evaluate(() => app.plugins.plugins['subtext'].settings);
  check(JSON.stringify(reloaded) === JSON.stringify({ backend: 'anthropic', model: 'claude-haiku-5-5', claudePath: detected, delimiter: ';;', apiKeySecret: KEY_ID }),
    'a reloaded plugin reads every saved field', reloaded);
  await open();
  check(await row('Convert with').locator('select:not(.is-measuring)').inputValue() === 'anthropic', 'the reopened tab shows the saved backend');
  check(await row('Anthropic API key').innerText().then((t) => !t.includes('Link...')), 'the reopened tab shows the linked secret');
  await page.keyboard.press('Escape');
  await wait(300);
};
