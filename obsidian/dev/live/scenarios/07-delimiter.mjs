export default async ({ page, check, reset, openNote, typeText, until, wait, editorText, finished }) => {
  await reset(page, { delimiter: '@@' });
  await openNote(page, 'Delimiter.md', '');
  await typeText(page, 'Old ;; y cubed ;;');
  await wait(1500);
  check(await finished(page) === 0, 'the default delimiter no longer triggers');
  await typeText(page, ' new @@ x squared @@');
  check(await until(async () => await finished(page) === 1, 30000), 'the custom delimiter triggers');
  const text = await editorText(page);
  check(/^Old ;; y cubed ;; new \$x\^\{?2\}?\$$/.test(text), 'only the @@ trigger converts', text);
};
