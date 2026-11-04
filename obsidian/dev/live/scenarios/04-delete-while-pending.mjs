export default async ({ page, check, openNote, typeText, until, wait, pendingMarks, editorText, finished, notices }) => {
  await openNote(page, 'Delete.md', 'Keep\n');
  await typeText(page, ';; beta cubed ;;');
  check(await pendingMarks(page) === 1, 'a pending mark appears');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('Backspace');
  await typeText(page, 'gone');
  check(await pendingMarks(page) === 0, 'deleting the trigger removes its mark');
  check(await finished(page) === 0, 'the trigger was deleted while pending');
  check(await until(async () => await finished(page) === 1, 30000), 'the conversion finishes');
  await wait(300);
  check(await editorText(page) === 'Keep\ngone', 'the result is dropped', await editorText(page));
  check((await notices(page)).length === 0, 'no notice', await notices(page));
};
