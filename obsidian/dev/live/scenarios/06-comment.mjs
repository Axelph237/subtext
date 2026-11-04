export default async ({ page, check, openNote, typeText, wait, pendingMarks, editorText, finished }) => {
  const existing = 'Text %% an existing comment %% more\n';
  await openNote(page, 'Comment.md', existing);
  await typeText(page, 'New %% typed comment with x squared %%');
  await wait(3000);
  check(await pendingMarks(page) === 0, 'no pending mark on a comment');
  check(await finished(page) === 0, 'no conversion ran');
  const text = await editorText(page);
  check(text === `${existing}New %% typed comment with x squared %%`, 'both comments stay untouched', text);
};
