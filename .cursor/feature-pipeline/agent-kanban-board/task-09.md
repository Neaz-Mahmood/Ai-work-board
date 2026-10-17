# Task 09: Drag-and-drop and inline create

## Context
The AI Work Board is a local Jira-style kanban for AI agents. The Board renders read-only (task 06, `src/web/components/board/`), Tickets can be moved through `POST /api/tickets/:ticketKey/move { column, position? }` (task 07, `position` is 0-based in the target Column and ranks are dense), and Tickets are created with `POST /api/projects/:key/tickets`. This task lets the human drag cards between Columns and reorder them within a Column (Jira-style, setting Rank), and create a Ticket inline at the bottom of any Column.

## Do
- Dependencies: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.
- `src/web/api/tickets.ts`: `useMoveTicket(projectKey)` mutation → `POST /api/tickets/:ticketKey/move`. Optimistic: in `onMutate` cancel `qk.board(key)` queries, snapshot, and update the cached `Board` (remove the card from its Column, insert at the target index, renumber `rank` in both Columns); on error restore the snapshot and show a toast/inline error; on settle invalidate `qk.board(key)`. `useCreateTicket(projectKey)` mutation → POST, invalidating `qk.board(key)` and `qk.projects`.
- `src/web/components/board/Board.tsx`: wrap in `DndContext` (pointer sensor with a 5px activation distance so clicks still work; keyboard sensor with sortable coordinates). Each Column is a droppable `SortableContext` (vertical list strategy) keyed by Column id; each card is a sortable item keyed by Ticket key. Use a `DragOverlay` rendering the card while dragging. On drag end compute the target Column and 0-based index (dropping onto an empty Column or the column body → bottom) and call `useMoveTicket`. Dropping in the same place does nothing.
- Visual feedback: the Column under the pointer gets a subtle highlight (`#E9F2FF`), the dragged card's original slot shows a placeholder.
- `src/web/components/board/CreateTicketInline.tsx`: at the bottom of every Column a subtle "+ Create" button; clicking turns it into a textarea ("What needs to be done?"); Enter submits (creates the Ticket in that Column with that title), Shift+Enter inserts a newline, Escape or blur with empty text cancels; after creating, the input stays open and clears for the next Ticket (as in Jira). Show server validation errors inline.

## Follow these existing patterns
- `src/web/components/board/Board.tsx`, `Column.tsx`, `TicketCard.tsx` from task 06 — keep their look; add dnd wrappers around them.
- `src/web/api/board.ts`, `src/web/api/queryKeys.ts` — hooks and cache keys.
- `src/shared/types.ts` — `Board`, `Card`, `ColumnId`.

## Do not
- Touch files outside: `src/web/`, `package.json`, `pnpm-lock.yaml`.
- Add dependencies other than the three `@dnd-kit` packages; reformat unrelated code; commit.
- Change the REST API.

## Done when
- Dragging a card to another Column or to a new position persists after reload, and the Activity of that Ticket (via `awb ticket show KEY`) shows `moved`/`reranked` by Actor `you`.
- "+ Create" adds a Ticket to the chosen Column at the bottom.
- `pnpm test && pnpm typecheck && pnpm build` passes.
