export default async ({ page, check, snap, openNote, typeText, until, wait, pendingMarks, editorText, finished, notices }) => {
  await openNote(page, 'Disable.md', '');
  await typeText(page, 'Off ;; e to the i pi ;;');
  check(await pendingMarks(page) === 1, 'a pending mark appears');
  await page.evaluate(() => app.plugins.disablePluginAndSave('quick-math'));
  check(await pendingMarks(page) === 0, 'disabling removes the pending mark at once');
  check(await finished(page) === 0, 'the plugin was disabled while the conversion was pending');
  check(await until(async () => await finished(page) === 1, 30000), 'the orphaned conversion finishes');
  await wait(300);
  check(await editorText(page) === 'Off ;; e to the i pi ;;', 'its result is dropped', await editorText(page));
  await typeText(page, ' and ;; x squared ;;');
  await wait(3000);
  check(await pendingMarks(page) === 0, 'a new trigger gets no mark');
  check(await editorText(page) === 'Off ;; e to the i pi ;; and ;; x squared ;;', 'a new trigger does not convert', await editorText(page));
  check((await notices(page)).length === 0, 'no notice', await notices(page));
  await snap('11-disabled');
  await page.evaluate(() => app.plugins.enablePluginAndSave('quick-math'));
  check(await until(() => page.evaluate(() => Boolean(app.plugins.plugins['quick-math']?._loaded)), 5000), 'the plugin enables again');
};
