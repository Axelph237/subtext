export default async ({ page, check, reset, openNote, typeText, until, editorText, finished, notices }) => {
  await page.evaluate(() => app.secretStorage.setSecret('subtext-fake-key', 'sk-ant-fake-key'));
  await reset(page, { backend: 'anthropic', apiKeySecret: 'subtext-fake-key' });
  await openNote(page, 'Anthropic.md', '');
  await typeText(page, 'Key ;; x squared ;;');
  check(await until(async () => await finished(page) === 1, 20000), 'the API request finishes');
  check(await until(async () => (await notices(page)).length === 1, 2000), 'one notice shows');
  const [notice] = await notices(page);
  check(/invalid x-api-key/.test(notice), 'the notice carries the API error', notice);
  check(await editorText(page) === 'Key ;; x squared ;;', 'the text is unchanged', await editorText(page));
};
