export default async ({ page, check, openNote, typeText, until, editorText, finished }) => {
  await openNote(page, 'Undo.md', '');
  await typeText(page, 'Area ;; pi r squared ;;');
  check(await until(async () => await finished(page) === 1, 30000), 'the conversion finishes');
  const converted = await editorText(page);
  check(/^Area \$[^$;]+\$$/.test(converted), 'the trigger became inline math', converted);
  await page.keyboard.press('Meta+z');
  check(await editorText(page) === 'Area ;; pi r squared ;;', 'one Cmd+Z restores the raw text', await editorText(page));
  await page.keyboard.press('Meta+Shift+z');
  check(await editorText(page) === converted, 'Cmd+Shift+Z redoes the conversion', await editorText(page));
};
