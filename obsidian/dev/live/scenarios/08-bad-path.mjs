export default async ({ page, check, snap, reset, openNote, typeText, until, editorText, finished, notices, pendingMarks, setTheme }) => {
  await reset(page, { claudePath: '/nonexistent/claude' });
  await openNote(page, 'BadPath.md', '');
  await typeText(page, 'Fails ;; x squared ;;');
  check(await until(async () => await finished(page) === 1, 10000), 'the conversion fails fast');
  check(await until(async () => (await notices(page)).length === 1, 2000), 'one notice shows');
  const [notice] = await notices(page);
  check(/^SubTeXt could not convert: Could not find the claude CLI/.test(notice), 'the notice names the problem', notice);
  check(await editorText(page) === 'Fails ;; x squared ;;', 'the text is unchanged', await editorText(page));
  check(await pendingMarks(page) === 0, 'the pending mark is gone');
  await snap('08-notice-light');
  await setTheme(page, 'obsidian');
  await snap('08-notice-dark');
};
