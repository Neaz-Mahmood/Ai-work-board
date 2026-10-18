# Task 18: Quiet drags: one refetch after a drop

## Context
The AI Work Board (repo root `/Users/neazmahmood/Desktop/projects/practice/ai-work-board`; web app in `apps/web`) now drags cards with Pragmatic drag-and-drop (`monitorForElements` in `apps/web/src/components/board/Board.tsx`). Two remaining causes of jank:
1. Live updates (`apps/web/src/api/useLiveUpdates.ts`, Server-Sent Events) invalidate and refetch the Board while a drag is in progress, re-rendering under the pointer.
2. After a drop, `useMoveTicket` (`apps/web/src/api/tickets.ts`) invalidates the Board in `onSettled`. The server then emits `ticket.moved` over SSE, which invalidates it again, so the Board is fetched twice and cards jump.

This task keeps the Board quiet during a drag and refetches it once after a drop.

## Do
- `apps/web/src/components/board/dragActivity.ts` (new): a module-level drag flag:
  - `markBoardDragStarted()`, `markBoardDragEnded()`, `isBoardDragActive()`;
  - `onBoardDragEnd(listener): unsubscribe`, whose listeners run when the last active drag ends.
- `apps/web/src/components/board/Board.tsx`: the monitor's `onDragStart` calls `markBoardDragStarted()` and its `onDrop` calls `markBoardDragEnded()`. Mirror viva-os's `preventUnhandled.start()`/`stop()`.
- `apps/web/src/api/useLiveUpdates.ts`:
  - While `isBoardDragActive()`, don't invalidate. Record which query groups would have been invalidated (board, ticket keys, projects, features).
  - On `onBoardDragEnd`, flush them as one round of invalidations.
  - Behaviour outside drags is unchanged, including reconnect handling.
- `apps/web/src/api/tickets.ts` `useMoveTicket`:
  - On **success**, don't invalidate the Board query. The optimistic state already matches the server, and the server's `ticket.moved` SSE event triggers the single refetch.
  - Still invalidate the moved Ticket's detail and the features query.
  - On **error**, keep the rollback and toast, and invalidate the Board.
  - `useLiveUpdates` already invalidates projects on `ticket.*` events.
- E2E, in `e2e/dnd.spec.ts`:
  - Count requests whose URL matches `/api/projects/<KEY>/board` (`page.on("request")`) from the drop until 1.5s after it. Exactly 1.
  - Start a native drag on a card (`page.mouse` / `dispatchEvent` dragstart over a card, without dropping), create a Ticket through the API meanwhile, and check that no Board request happens during the drag. After the drop, the new Ticket appears.
  - Keep "6. Live update" in `e2e/board.spec.ts` passing.

## Follow these existing patterns
- `/Users/neazmahmood/Desktop/projects/web/viva-os/viva-os-ui/apps/project-management/src/features/board/board-drag-activity.ts`: the drag-activity flag.
- `.../features/board/use-board-dnd.ts`: `markBoardDragStarted`/`markBoardDragEnded` and `preventUnhandled` in the monitor.
- `apps/web/src/api/useLiveUpdates.ts`: the existing event-to-invalidation mapping; reuse it for the buffered flush.

## Do not
- Touch files outside: `apps/web/src/components/board/`, `apps/web/src/api/useLiveUpdates.ts`, `apps/web/src/api/tickets.ts`, `e2e/`
- Change the server or the event types
- Add dependencies, reformat unrelated code, or commit

## Done when
- A drop causes exactly one Board fetch, and live updates arriving mid-drag show up right after the drop.
- `pnpm typecheck` passes
- `pnpm test` passes
- `pnpm test:e2e` passes
