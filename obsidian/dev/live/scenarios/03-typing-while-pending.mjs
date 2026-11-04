export default async ({ page, check, openNote, typeText, until, pendingMarks, editorText, finished }) => {
  await openNote(page, 'Typing.md', 'First line\n');
  await typeText(page, 'Value ;; alpha squared ;;');
  await typeText(page, ' end');
  await page.keyboard.press('Meta+ArrowUp');
  await typeText(page, 'Top. ');
  const during = await editorText(page);
  check(await finished(page) === 0, 'the edits happened while the conversion was pending', during);
  check(await pendingMarks(page) === 1, 'the pending mark survives edits before and after it');
  check(await until(async () => await finished(page) === 1, 30000), 'the conversion finishes');
  const text = await editorText(page);
  check(/^Top\. First line\nValue \$[^$\n]*\\alpha[^$\n]*\$ end$/.test(text), 'the math lands exactly on the trigger', text);
};
