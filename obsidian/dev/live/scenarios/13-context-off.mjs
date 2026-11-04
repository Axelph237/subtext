export default async ({ page, work, check, reset, openNote, typeText, until, finished, stubClaude }) => {
  const stub = await stubClaude(work);
  await reset(page, { claudePath: stub.path, contextChars: 0 });
  await openNote(page, 'ContextOff.md', 'Let $\\mathbf{v}$ be a vector.\n');
  await typeText(page, 'Then ;; v dot w ;;');
  check(await until(async () => await finished(page) === 1, 10000), 'the conversion finishes');
  const stdin = await stub.stdin();
  check(stdin === 'v dot w', 'contextChars 0 sends the bare input', stdin);
};
