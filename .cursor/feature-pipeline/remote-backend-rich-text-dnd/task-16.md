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

## Clarifications (checked against the code)
- **Don't read any file outside this repository** (no viva-os paths). Reading one aborts your run.
- **Types:** `Card` and `ColumnId` come from `@awb/shared/types.ts` (`import type`). `Card` has `key`, `column` and `rank`, where `rank` is the full-column Rank. `columns[i].tickets` are the visible cards in Rank order.
- **Exact rules.** Let `vis` = the visible cards of the target Column, and `A` = the active card. "Same" means `target column === A.column`.
  1. **Card target `X`:**
     - `X.key === A.key` → `null`.
     - Bottom edge → "after `X`".
     - Top edge: if `X` is the first card of `vis` → "before first"; otherwise → "after `P`", where `P` is the visible card immediately above `X`. If `P.key === A.key` (dropping on the top edge of the card right below you), → `null`.
  2. **"After `C`":** position = `C.rank` if same Column and `A.rank < C.rank` (A is removed from above); otherwise `C.rank + 1`.
  3. **"Before first" (`F = vis[0]`):** position = `F.rank`.
  4. **Column-body target:**
     - `vis` empty → `{ column, position: undefined }` (bottom).
     - Same Column and `A` is the last card of `vis` → `null`.
     - Otherwise → "after last card of `vis`" (rule 2).
  5. **Final no-op check:** same Column and computed `position === A.rank` → `null`.
- **Why this matches today.** `computeUnfilteredPosition` plus `handleDragEnd`, under the dnd-kit translation in the Do list, reduce to exactly these rules:
  - same Column moving down onto `X` → bottom of `X` → `X.rank`;
  - same Column moving up onto `X` → top of `X` → `vis[0].rank` if `X` is first, else `prev.rank + 1`;
  - other Column onto `X` → top of `X`;
  - Column body → rule 4. A cross-Column drop on an empty Column still calls `moveTicket.mutate` with `position: undefined`, as today.

  Keep `handleDragEnd`'s early returns (`!over`, unknown card/column). Call `moveTicket.mutate` exactly when `getDropDestination` returns non-null.
- **Tests:** one `describe`, with a small `card(key, column, rank)` factory. Include the gap cases: visible ranks 0, 3, 7, with the active card at rank 3 moving to the bottom edge of rank 7 → `7`; and from another Column onto the top edge of the rank-7 card → `3 + 1 = 4`. For every rule above, also assert at least one dnd-kit-equivalent case against a hand-computed value from the old `computeUnfilteredPosition` logic, with a one-line comment.
- Run `pnpm test`, `pnpm typecheck` and `pnpm test:e2e` (the drag e2e tests 2 and 3 in `e2e/board.spec.ts` must pass unchanged). Don't edit `e2e/`. Don't add sleeps, locks or mutexes.
