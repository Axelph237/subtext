export default async ({ page, vault, check, snap, openNote, typeText, until, pendingMarks, editorText, diskText, setTheme }) => {
  await openNote(page, 'Inline.md', 'Some text\n');
  await typeText(page, 'Ratio ;; alpha plus beta over gamma ;;');
  check(await until(async () => await pendingMarks(page) === 1, 2000), 'a pending mark covers the trigger');
  await snap('01-pending-light');
  await setTheme(page, 'obsidian');
  await snap('01-pending-dark');
  await setTheme(page, 'moonstone');
  check(await until(async () => !(await editorText(page)).includes(';;'), 30000), 'the trigger is replaced', await editorText(page));
  const text = await editorText(page);
  check(/^Some text\nRatio \$[^$\n]*\\alpha[^$\n]*\\beta[^$\n]*\\gamma[^$\n]*\$$/.test(text), 'the line holds inline math', text);
  check(/\\frac/.test(text), 'the LaTeX has a fraction', text);
  check(await pendingMarks(page) === 0, 'the pending mark is gone');
  const disk = await diskText(vault, 'Inline.md', (t) => t === text);
  check(disk === text, 'the file on disk has the $...$ math', disk);
  await snap('01-inline');
};
