export default async ({ page, work, check, reset, openNote, typeText, until, finished, editorText, stubClaude }) => {
  const stub = await stubClaude(work);
  await reset(page, { claudePath: stub.path });
  await openNote(page, 'Context.md', 'Let $\\mathbf{v}$ be a vector.\n');
  await typeText(page, 'Then ;; v dot w ;;');
  check(await until(async () => await finished(page) === 1, 10000), 'the conversion finishes');
  const stdin = await stub.stdin();
  check(stdin === '<context>\nLet $\\mathbf{v}$ be a vector.\nThen\n</context>\n\n<math>\nv dot w\n</math>', 'the CLI receives the note before the trigger as context', stdin);
  check(await editorText(page) === 'Let $\\mathbf{v}$ be a vector.\nThen $x$', 'the stub result lands', await editorText(page));

  await page.evaluate(() => app.plugins.plugins['subtext'].updateSettings({ contextChars: 12 }));
  await typeText(page, ' and ;; y ;;');
  check(await until(async () => await finished(page) === 2, 10000), 'the second conversion finishes');
  const cut = await stub.stdin();
  check(cut === '<context>\n$x$ and\n</context>\n\n<math>\ny\n</math>', 'a 12-character window drops the word it cuts', cut);
};
