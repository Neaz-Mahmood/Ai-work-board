# Task 14 fix 1: task-list input rule, double Escape, CSS scope

## Context
Task 14 (see `task-14.md` in this folder) added `apps/web/src/components/editor/MarkdownEditor.tsx`. Typecheck, unit tests and most e2e pass. Claude already fixed a missing `}` in `TicketModal.css` that broke the board drag tests. Don't touch `e2e/helpers.ts`; the drag tests pass without any sleep. Three problems remain.

## 1. Typing `- [ ] todo` doesn't create a task item (e2e `editor.spec.ts` test 2 fails)
Stored markdown is `- \[ \] todo` (the brackets are literal text). Cause: in `CustomTaskItem`'s input rule (`MarkdownEditor.tsx`, the `listItemDepth > 0` branch), two `tr.setNodeMarkup` calls convert `bulletList`→`taskList` and `listItem`→`taskItem` one at a time. The intermediate document is invalid (a `taskList` containing a `listItem`), so ProseMirror throws and the rule is dropped.

Replace the whole custom `handler` body with Tiptap commands via the handler's `chain` argument (Tiptap `InputRule` handlers receive `{ state, range, match, chain }`):
```ts
handler: ({ state, range, match, chain }) => {
  const checked = match[match.length - 1] === "x";
  const $from = state.doc.resolve(range.from);
  let inListItem = false;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === "listItem") { inListItem = true; break; }
  }
  const c = chain().deleteRange(range);
  if (inListItem) c.liftListItem("listItem");
  c.toggleList("taskList", "taskItem").updateAttributes("taskItem", { checked }).run();
},
```
Remove the now-unused `findWrapping` / `canJoin` imports. Keep the existing `find` regex. Check the result with the e2e (`- [ ] todo` must be stored as `- [ ] todo`). If `liftListItem` + `toggleList` still leaves the text in a bullet item, debug with that e2e. Don't weaken the assertion.

## 2. Escape fires `onCancel` twice
Escape is handled both in `editorProps.handleKeyDown` and in the container's `onKeyDownCapture`. Keep only the container `onKeyDownCapture` handler (it also covers toolbar focus). Remove the `Escape` branch from `handleKeyDown`, and keep the Cmd/Ctrl+Enter branch there.

## 3. Global task-list selectors in `MarkdownEditor.css`
Rules starting with `ul[data-type="taskList"]` / `li[data-type="taskItem"]` are global. Prefix each with `.markdown-editor-content ` so they apply only inside the editor.

## Do not
- Touch files other than `apps/web/src/components/editor/MarkdownEditor.tsx` and `apps/web/src/components/editor/MarkdownEditor.css`
- Change the e2e tests, `e2e/helpers.ts`, dependencies, or commit
- Add locks, mutexes or `waitForTimeout` sleeps

## Done when
- `pnpm typecheck` passes
- `pnpm test:e2e` passes (all local + hosted tests, including `editor.spec.ts` test 2)
