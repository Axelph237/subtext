export default async ({ page, vault, check, snap, openNote, typeText, until, editorText, diskText }) => {
  await openNote(page, 'Display.md', 'Intro\n');
  await typeText(page, '  ;; sum from i equals 1 to n of i squared ;;');
  check(await until(async () => !(await editorText(page)).includes(';;'), 30000), 'the trigger is replaced', await editorText(page));
  const text = await editorText(page);
  check(/^Intro\n\$\$\n[^$\n]*\\sum[^$\n]*\n\$\$$/.test(text), 'a whole-line trigger becomes a $$ block on its own lines', text);
  const disk = await diskText(vault, 'Display.md', (t) => t === text);
  check(disk === text, 'the file on disk has the $$ block', disk);
  await page.keyboard.press('Enter');
  await typeText(page, 'After the block');
  await snap('02-display');
};
