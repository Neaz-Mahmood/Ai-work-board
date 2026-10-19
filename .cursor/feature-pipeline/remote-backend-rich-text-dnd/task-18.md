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

## Clarifications (checked against the code)
- **Never read any path outside this repository** (doing so aborts your run). The viva-os reference is inlined here instead:
  ```ts
  // viva-os board-drag-activity.ts (complete)
  let activeDrags = 0;
  export const markBoardDragStarted = () => { activeDrags += 1; };
  export const markBoardDragEnded = () => { activeDrags = Math.max(0, activeDrags - 1); };
  export const isBoardDragActive = () => activeDrags > 0;

  // viva-os use-board-dnd.ts monitor (excerpt)
  import { preventUnhandled } from '@atlaskit/pragmatic-drag-and-drop/prevent-unhandled';
  monitorForElements({
    canMonitor: ...,
    onDragStart: () => { markBoardDragStarted(); preventUnhandled.start(); },
    onDrop: ({ source, location }) => { markBoardDragEnded(); preventUnhandled.stop(); /* ...then handle the drop */ },
  });
  ```
  `@atlaskit/pragmatic-drag-and-drop/prevent-unhandled` exists in the installed core (3.1.0).
- **`dragActivity.ts`:** extend the reference with `onBoardDragEnd(listener: () => void): () => void` (a `Set` of listeners). `markBoardDragEnded` calls every listener when the count goes from >0 to 0. Wrap each listener call in try/catch with `console.error`, like `EventBus.emit`.
- **Board monitor:**
  - `markBoardDragEnded()` + `preventUnhandled.stop()` must be the **first statements** in `onDrop`, before any early return. `onDrop` also fires for cancelled drags and drops outside any target, so this keeps the flag from getting stuck.
  - The effect's cleanup, on unmount mid-drag, must end the drag if this monitor started one. Track it with a local `let dragging = false` inside the effect.
- **`useLiveUpdates` buffering:**
  - Factor the existing per-event invalidations into a function `invalidateFor(type, ticketKey)`. While `isBoardDragActive()`, add the pending keys to a local `Set` of serialised query keys (`JSON.stringify(key)`) instead of invalidating.
  - Subscribe to `onBoardDragEnd` inside the same effect (unsubscribe in cleanup). The listener invalidates each pending key once, then clears the set.
  - The reconnect branch (`es.onopen` after the first open) stays unbuffered.
- **`useMoveTicket`:** replace `onSettled` with:
  - `onSuccess`: invalidate `qk.ticket(ticketKey)` and `qk.features(projectKey)`, not the board. Projects are refreshed by the SSE `ticket.*` handler.
  - `onError`: the existing rollback + toast, plus invalidate `qk.board(projectKey)`.
  - Don't change `onMutate` or `applyMoveToBoard`.
- **E2E (`e2e/dnd.spec.ts`):**
  - *One fetch per drop:* attach `page.on("request")` filtered on `/api/projects/${key}/board` just before `dragCard(...)`. After the drop, wait for the card to be in its new place, then `await expect.poll(() => count, { timeout: 1500 }).toBe(1)`. Then wait out the window with `await page.waitForTimeout(1500)` and assert the count is still `1`. This window is the one place a fixed wait is allowed, because it checks for the absence of extra requests.
  - *Mid-drag live update:*
    1. Press on a card with `page.mouse` (`move` to the card centre, `down`, then `move` by about 20px in a few steps so Chromium starts a native drag).
    2. While it's held, count board requests and create a Ticket through the `request` fixture (`createTicket`). Assert that no board request happens within 1s (`waitForTimeout(1000)` is allowed here for the same reason).
    3. Then `move` to another Column and `up`.
    4. Assert the new Ticket's card becomes visible.

    If Chromium won't start a native drag through `page.mouse`, report it instead of skipping the test.
- Keep `e2e/board.spec.ts` "6. Live update" passing. Don't add locks or mutexes.
