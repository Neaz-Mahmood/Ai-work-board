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
- `/Users/neazmahmood/Desktop/projects/web/viva-os/viva-os-ui/apps/project-management/src/features/board/board-announcer.ts`: the announcer store and message format.
- `.../features/board/board-card-actions.ts`: a context of stable card actions (`onMoveCard(offset)`, `onChangeStatus`).
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
