# Task 19: Keyboard moves and announcements

## Context
The AI Work Board (repo root `/Users/neazmahmood/Desktop/projects/practice/ai-work-board`; web app in `apps/web`) moved Board drag and drop to Pragmatic drag-and-drop. Unlike the old dnd-kit setup, Pragmatic has no keyboard dragging, so keyboard users lost the ability to reorder cards. This task restores keyboard moves as card actions:
- Alt+↑ / Alt+↓ on a focused card;
- a "Move to Column" menu on each card;
- a screen-reader announcement after every move, by pointer or keyboard.

Moves go through the existing `useMoveTicket` (`apps/web/src/api/tickets.ts`), so Activity records them as Actor `you`. Positions come from the pure `getDropDestination` in `apps/web/src/components/board/boardDnd.ts`.

## Do
- `apps/web/src/components/board/announcer.ts` (new): a module-level `announce(message)` plus a `useAnnouncement()` hook via `useSyncExternalStore`.
- `apps/web/src/components/board/Board.tsx`:
  - Render one visually hidden `<div role="status" aria-live="polite" data-testid="board-announcer">` showing the current announcement.
  - After every successful pointer or keyboard move, call `announce("<KEY> moved to <Column name>, position <n> of <total>.")`, with n and total among the visible cards of the target Column after the move.
  - Provide stable keyboard-move callbacks to cards (e.g. through a small React context, as viva-os's `BoardCardActionsProvider` does), so `TicketCard` stays memoized.
- `apps/web/src/components/board/TicketCard.tsx`:
  - On a focused card, Alt+ArrowUp / Alt+ArrowDown move it one place up or down among the visible cards of its Column. Build a card `DropTarget` on the neighbour with the edge `top` (up) or `bottom` (down) and use `getDropDestination`. At the top or bottom it does nothing.
  - `preventDefault` on these keys. Keep focus on the moved card after the Board re-renders (focus by `data-ticket-key`).
  - Add a small "⋯" button (`aria-label="Card actions for <KEY>"`, visible on hover and focus, `data-testid="card-actions"`) that opens a menu listing the other Columns as "Move to <Column name>". Choosing one moves the card to the bottom of that Column. Esc closes the menu. Clicking the button must not open the Ticket modal or start a drag.
- `apps/web/src/components/board/board.css`: styles for the actions button and menu, matching the existing Jira-like look.
- E2E, `e2e/keyboard.spec.ts` (new):
  - Focus the second card in a Column, press Alt+ArrowUp. It becomes first (checked via `GET /api/projects/:key/board`), and the announcer text contains "moved to" and "position 1".
  - Alt+ArrowDown moves it back.
  - "Move to In Progress" from the card menu moves it to the bottom of In Progress, and `GET /api/tickets/:key` Activity shows a `moved` entry by `you`.
  - A pointer drop also updates the announcer.

## Follow these existing patterns
- `apps/web/src/components/board/boardDnd.ts`: `getDropDestination` for all position maths.

## Do not
- Touch files outside: `apps/web/src/components/board/`, `e2e/`
- Change the server, `useMoveTicket`'s optimistic or refetch behaviour, or the drag-and-drop wiring beyond calling `announce`
- Add dependencies, reformat unrelated code, or commit

## Done when
- Cards can be reordered and moved between Columns from the keyboard, and every move is announced.
- `pnpm typecheck` passes
- `pnpm test` passes
- `pnpm test:e2e` passes

## Clarifications (checked against the code)
- **Never read any path outside this repository** (doing so aborts your run). The viva-os references are inlined here:
  ```ts
  // viva-os board-announcer.ts (store part)
  let message = '';
  const listeners = new Set<() => void>();
  const announce = (next: string) => { message = next; listeners.forEach((l) => l()); };
  const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
  export const useBoardAnnouncement = () => useSyncExternalStore(subscribe, () => message, () => '');
  // message format: `${title} moved to ${column.name}, position ${index + 1} of ${total}.`  (we use the ticket KEY, per the Do list)

  // viva-os board-card-actions.ts (shape)
  const BoardCardActionsContext = createContext<BoardCardActions | null>(null);
  export const BoardCardActionsProvider = BoardCardActionsContext.Provider;
  export const useBoardCardActions = () => { const a = useContext(BoardCardActionsContext); if (!a) throw new Error('…inside BoardCardActionsProvider'); return a; };
  ```
- **Card actions context:** `apps/web/src/components/board/cardActions.ts` (new) exports the context and a hook. Its shape is `{ moveCardByOffset(cardKey: string, offset: -1 | 1): void; moveCardToColumn(cardKey: string, columnId: ColumnId): void; columns: { id: ColumnId; name: string }[] }`.
  - `Board.tsx` builds the value with `useMemo` and callbacks that read `boardRef.current`, so the value is stable and memoized cards don't re-render.
  - `columns` comes from `COLUMNS` in `@awb/shared/columns.ts`, which is static.
- **One move path:** in `Board.tsx`, add `performMove(activeCard, target: DropTarget)`, used by the pointer monitor, Alt+Arrow and the menu:
  - it calls `getDropDestination`; on `null` it does nothing (no announcement);
  - otherwise `moveTicket.mutate(vars, { onSuccess: () => announceMove(activeCard.key, dest.column) })`, using the per-call `onSuccess` option of TanStack `mutate`. Don't change `useMoveTicket`.
  - `announceMove` reads `boardRef.current` (already optimistic) and finds the card's index in the target Column's visible tickets: "`<KEY> moved to <Column name>, position <index+1> of <length>.`".
- **Alt+Arrow:** the neighbour is the visible card above (Up) or below (Down) in the same Column.
  - Up → `{ kind: "card", cardKey: above.key, edge: "top" }`.
  - Down → `{ kind: "card", cardKey: below.key, edge: "bottom" }`.
  - No neighbour → nothing. Handle it in the card's `onKeyDown` (`e.altKey && (ArrowUp|ArrowDown)`), with `preventDefault`.
  - Refocus after the move: `requestAnimationFrame(() => (document.querySelector(\`[data-ticket-key="${key}"]\`) as HTMLElement | null)?.focus())`. React re-orders DOM nodes, which can drop focus.
- **"⋯" button inside a draggable card:**
  - Clicks and keydowns on the button and menu must `stopPropagation()`, so `TicketCard`'s onClick and its Enter/Space handlers don't open the modal.
  - In `draggable({...})`, add `canDrag: ({ input }) => !(document.elementFromPoint(input.clientX, input.clientY) as HTMLElement | null)?.closest('[data-card-actions-root]')`, and put `data-card-actions-root` on the wrapper around the button and menu. That way pressing on them never starts a drag.
  - The menu state lives in a small child component inside the card, not in Board.
  - The menu: `role="menu"`, items `role="menuitem"` with text "Move to <Column name>" for every column except the card's own. Choosing one calls `moveCardToColumn` (target `{ kind: "column", columnId }`, which is the bottom) and closes the menu. Esc or an outside click closes it, and focus returns to the "⋯" button.
- **Announcer element:** a visually hidden `div` (the usual sr-only CSS: `position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap`) rendered by `Board`. Don't use `display:none`; screen readers ignore it.
- **E2E (`e2e/keyboard.spec.ts`):**
  - Use `card.focus()` then `page.keyboard.press("Alt+ArrowUp")`.
  - Read the announcer with `expect(page.getByTestId("board-announcer")).toContainText(...)`.
  - Activity: `GET /api/tickets/<KEY>` returns `activity`. Look for an entry with type/kind `moved` and actor `you`; check the actual field names in `packages/shared/src/types.ts`.
  - Pointer drop: use `dragCard` from `e2e/helpers.ts`.
  - No sleeps.
- Keep all existing e2e passing, including `dnd.spec.ts` "One fetch per drop". The per-call `onSuccess` doesn't refetch. Don't add locks or mutexes.
