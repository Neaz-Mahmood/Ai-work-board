# Task 17: Switch the Board to Pragmatic drag-and-drop

## Context
The AI Work Board's kanban Board (repo root `/Users/neazmahmood/Desktop/projects/practice/ai-work-board`; web app in `apps/web`) feels laggy when dragging. It uses `@dnd-kit`, and:
- `Board.tsx` sets React state on every drag-over, re-rendering every Column and card;
- `Column` and `TicketCard` aren't memoized, and get new inline `onClick` arrows on every render;
- the collision-detection function is recreated on every render.

The viva-os kanban board feels smooth because it uses Atlassian Pragmatic drag-and-drop:
- the browser's native drag preview, with no React work per pointer move;
- a drop-indicator line placed at the closest edge through a DOM data attribute, not React state;
- one board-level monitor handling the drop;
- memoized cards and Columns.

This task ports that approach. A pure function, `getDropDestination` in `apps/web/src/components/board/boardDnd.ts`, already maps `{ kind: "card", cardKey, edge } | { kind: "column", columnId }` to the `{ column, position }` that `useMoveTicket` sends. The Columns are fixed: no Column dragging and no virtualization.

## Do
- Dependencies, at the workspace root:
  - `pnpm add -w @atlaskit/pragmatic-drag-and-drop@^3.1.0 @atlaskit/pragmatic-drag-and-drop-hitbox@^2.2.0 @atlaskit/pragmatic-drag-and-drop-auto-scroll@^3.2.0`
  - then `pnpm remove -w @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
- `apps/web/src/components/board/TicketCard.tsx`:
  - Replace `SortableTicketCard` with a `DraggableTicketCard` wrapped in `React.memo`, using `useEffect` + `combine(...)`:
    - `draggable({ element, getInitialData: () => ({ type: "card", cardKey, columnId }), onGenerateDragPreview: setCardDragPreview, onDragStart/onDrop })`. Local `isDragging` state dims the source card (opacity 0.4), and a click right after a drag must not open the modal.
    - `dropTargetForElements({ element, canDrop: other card, getIsSticky: () => true, getData: attachClosestEdge(..., { allowedEdges: ["top", "bottom"] }) })`. `onDrag`, `onDragLeave` and `onDrop` set or clear a `data-drop-edge="top|bottom"` attribute on the element directly, with no React state.
  - Keep `TicketCard` (presentational) and all its existing markup, `data-ticket-key`, role and keyboard Enter/Space to open.
- `apps/web/src/components/board/setCardDragPreview.ts` (new): a native custom drag preview that clones the card element (`setCustomNativeDragPreview` + `pointerOutsideOfPreview`).
- `apps/web/src/components/board/Column.tsx`:
  - Wrap in `React.memo`.
  - The Column body is a `dropTargetForElements` with data `{ type: "column", columnId }`. Its `onDragEnter`/`onDragLeave`/`onDrop` toggle the `is-over` class or a data attribute directly on the element (no Board-level state).
  - Register `autoScrollForElements` on the scrollable Column body.
  - Remove `SortableContext`.
  - Pass a stable `onTicketClick(ticketKey)` down instead of inline arrows.
- `apps/web/src/components/board/Board.tsx`:
  - Remove `DndContext`, `DragOverlay`, sensors and the `activeTicket`/`overColumnId` state.
  - Add one `useEffect` with `monitorForElements({ canMonitor: card drags, onDrop })`. `onDrop` reads the innermost drop target: a card target (with `extractClosestEdge`) or a Column target. It builds a `DropTarget`, calls `getDropDestination` with the current Board (read through a ref so the effect isn't re-registered every render), and calls `moveTicket.mutate(...)` when the result isn't `null`.
  - Wrap `onTicketClick` in `useCallback`. Keep the toast and empty-filter message.
- `apps/web/src/components/board/board.css`:
  - Drop-indicator line: a 2px accent-colour line drawn with `::before`/`::after` at the top or bottom of `[data-drop-edge]`, offset into the gap between cards.
  - Keep `.board-column.is-over`.
  - Remove the dnd-kit placeholder and overlay styles.
- `e2e/helpers.ts` `dragCard(page, source, target, opts?)`: rewrite it for native HTML5 drag using `source.dragTo(target, { targetPosition })`. `opts.edge` is `"top" | "bottom"` (a target position near the card's top or bottom), and with no edge it aims at the target's centre.
  - Keep the existing specs "2. Drag across Columns" and "3. Reorder within a Column" in `e2e/board.spec.ts` passing, adjusting only their helper calls.
  - Add `e2e/dnd.spec.ts` (new):
    - Dropping on the top edge of a card places the moved card directly above it; the bottom edge places it below. Both survive a reload, and Rank order is checked through `GET /api/projects/:key/board`.
    - Dropping on an empty Column body moves the card there.
    - With a search filter active (use the Board search input as in "5. Filters"), dropping relative to a visible card lands at the right full-Column Rank, checked via the API with the filter cleared.

## Follow these existing patterns
- `/Users/neazmahmood/Desktop/projects/web/viva-os/viva-os-ui/apps/project-management/src/features/board/board-card.tsx` (around the `draggable(...)` / `dropTargetForElements(...)` effect and `setEdgeAttribute`): card drag source and target with the closest edge set as a DOM attribute.
- `.../features/board/board-column.tsx` (its `dropTargetForElements` for the Column body): the Column drop target.
- `.../features/board/use-board-dnd.ts`: a single `monitorForElements` handling the drop through a callbacks ref.
- `.../features/board/set-board-drag-preview.ts` (`setBoardCardDragPreview`): the native preview clone.
- `.../features/board/board-auto-scroll.ts` and `board.css`: auto-scroll and drop-indicator styling.
- `apps/web/src/api/tickets.ts` `useMoveTicket`: keep its optimistic update and rollback as is.

## Do not
- Touch files outside: `apps/web/src/components/board/`, `e2e/`, root `package.json`, `pnpm-lock.yaml`
- Add Column reordering or virtualization, or change `useMoveTicket`, `useLiveUpdates` or the server (later tasks handle refetching and keyboard moves)
- Add dependencies beyond the three Pragmatic packages, reformat unrelated code, or commit

## Done when
- No `@dnd-kit` import remains; dragging shows a native preview and a drop line, and hovering doesn't re-render the Board.
- `pnpm typecheck` passes
- `pnpm test` passes
- `pnpm test:e2e` passes
