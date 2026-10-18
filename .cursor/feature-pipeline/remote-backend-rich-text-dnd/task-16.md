# Task 16: Prefactor: pure drag-and-drop destination function

## Context
The AI Work Board (repo root `/Users/neazmahmood/Desktop/projects/practice/ai-work-board`; web app in `apps/web`) is about to replace `@dnd-kit` on the Board with Atlassian Pragmatic drag-and-drop. Pragmatic reports a drop as "on card X, closest edge top/bottom" or "on the Column body".

Today, `apps/web/src/components/board/Board.tsx` turns a dnd-kit drop into the `{ column, position }` sent to `POST /api/tickets/:key/move` with an untested helper, `computeUnfilteredPosition`. The helper also handles a filtered Board, where only some cards are visible but `position` must be the full-column Rank. The server's semantics are in `apps/server/src/domain/tickets.ts` (`moveTicket`): Rank is dense from 0 per Column; `position` omitted means the bottom.

This task extracts that mapping into a pure, edge-based function with tests, and wires today's dnd-kit code to it with **identical** behaviour.

## Do
- `apps/web/src/components/board/boardDnd.ts` (new): export
  ```ts
  type DropTarget =
    | { kind: "card"; cardKey: string; edge: "top" | "bottom" }
    | { kind: "column"; columnId: ColumnId };
  function getDropDestination(args: {
    activeCard: Card;              // the dragged card (has column and rank)
    columns: { id: ColumnId; tickets: Card[] }[]; // visible (possibly filtered) cards per Column, in Rank order
    target: DropTarget;
  }): { column: ColumnId; position: number | undefined } | null; // null = no-op
  ```
  Semantics:
  - **Card target, top edge**: insert immediately before that card. **Bottom edge**: insert immediately after it.
  - **Column-body target**: the bottom of that Column. For the source Column, a no-op if the card is already last among the visible cards.
  - Dropping on itself, or a same-Column result equal to the current position, returns `null`.
  - `position` is expressed in **full-column Rank** using the neighbouring visible cards' `rank`, accounting for removal of the active card when moving within its own Column. This must match exactly what `computeUnfilteredPosition` produces today for the equivalent drop.
  - `undefined` means "bottom" when the target Column has no visible cards.
- `apps/web/src/components/board/boardDnd.test.ts` (new, Vitest; the root `vitest.config.ts` already includes `apps/web/src/**/*.test.ts`). Cases:
  - same Column moving down, top and bottom edges;
  - same Column moving up, top and bottom edges;
  - cross-Column on top of the first card, on the bottom of the last card, and in the middle;
  - Column body, both empty and non-empty;
  - same-Column body when the card is already last (`null`);
  - dropping on itself (`null`);
  - a filtered list where the visible ranks have gaps (e.g. visible ranks 0, 3, 7) both within and across Columns.

  Derive the expected positions from the server's move semantics in `apps/server/src/domain/tickets.ts`, and add a short comment per case explaining it.
- `apps/web/src/components/board/Board.tsx`:
  - Delete `computeUnfilteredPosition` and call `getDropDestination` from `handleDragEnd`.
  - Translate dnd-kit's result into a `DropTarget`: a card target where `activeIndex < overIndex` in the same Column → `bottom`; otherwise → `top`; a Column target → `column`. The behaviour must stay identical.

## Follow these existing patterns
- `/Users/neazmahmood/Desktop/projects/web/viva-os/viva-os-ui/apps/project-management/src/features/board/board-dnd.ts` (`getCardDestinationIndex`) and `board-dnd.test.ts`: an edge-based destination function and its tests.
- `apps/web/src/components/board/Board.tsx` `computeUnfilteredPosition`: the exact current Rank arithmetic to preserve.

## Do not
- Touch files outside: `apps/web/src/components/board/Board.tsx`, `apps/web/src/components/board/boardDnd.ts`, `apps/web/src/components/board/boardDnd.test.ts`
- Change the drag library, styling or server
- Add dependencies, reformat unrelated code, or commit

## Done when
- `computeUnfilteredPosition` is gone, `getDropDestination` is unit-tested, and Board drag behaviour is unchanged.
- `pnpm test` passes
- `pnpm typecheck` passes
- `pnpm test:e2e` passes
