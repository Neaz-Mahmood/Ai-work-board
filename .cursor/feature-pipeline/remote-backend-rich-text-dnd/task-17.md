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

## Clarifications (checked against the code)
- **Reference code is inside this repo now:** `.cursor/feature-pipeline/remote-backend-rich-text-dnd/reference-17/` holds excerpts from the viva-os board:
  - `board-card.excerpt.tsx`: card `draggable` + `dropTargetForElements` effect, `setEdgeAttribute`;
  - `board-column.excerpt.tsx`: Column body drop target + `autoScrollForElements`;
  - `use-board-dnd.ts`: the single `monitorForElements`;
  - `set-board-drag-preview.ts`;
  - `board-auto-scroll.ts`;
  - `board-drop-indicator.excerpt.css`: insertion-line CSS.

  Read those for patterns, and **never read any path outside this repository** (doing so aborts your run). Mirror only what this task needs: no Column dragging, virtualisation, activation handles, prefetch or drop-flash.
- **Dependencies are installed by Claude; don't run pnpm add or remove.**
  - `@atlaskit/pragmatic-drag-and-drop@^3.1.0` (3.1.0);
  - `@atlaskit/pragmatic-drag-and-drop-hitbox@^2.2.2`;
  - `@atlaskit/pragmatic-drag-and-drop-auto-scroll@3.2.0`, pinned exactly: 3.2.1 depends on core 4.x, which would create a second drag registry.
  - `@dnd-kit/*` is already uninstalled, so typecheck fails until you remove its imports from `Board.tsx`, `Column.tsx` and `TicketCard.tsx`.
- **Import paths** (as in the reference):
  - `@atlaskit/pragmatic-drag-and-drop/element/adapter` (`draggable`, `dropTargetForElements`, `monitorForElements`);
  - `@atlaskit/pragmatic-drag-and-drop/combine`;
  - `@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview` and `.../element/pointer-outside-of-preview`;
  - `@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge` (`attachClosestEdge`, `extractClosestEdge`);
  - `@atlaskit/pragmatic-drag-and-drop-auto-scroll/element` (`autoScrollForElements`).

  If a path in the reference differs (e.g. `adapter/element-adapter`), use whichever resolves in typecheck.
- **Drop-edge attribute:** use `data-drop-edge` (the spec's name), not the reference's `data-card-edge`. Only touch the DOM when the value changes (as `setEdgeAttribute` does).
- **Column:**
  - Remove the `isHighlighted` prop. The Board no longer tracks the hovered Column; the Column toggles `is-over` on its own element in the drop target's `onDragEnter`/`onDragLeave`/`onDrop`.
  - Keep `projectKey`, `actors` and the existing markup/classes.
  - The Column drop target's `canDrop` accepts only card drags.
- **Monitor `onDrop` (Board):** `const innermost = location.current.dropTargets[0]`. If none → return.
  - If `innermost.data.type === "card"` → `{ kind: "card", cardKey, edge: extractClosestEdge(innermost.data) }`. Treat a non-`top`/`bottom` edge as `"bottom"`.
  - If `type === "column"` → `{ kind: "column", columnId }`.
  - Find `activeCard` by `source.data.cardKey` in `boardRef.current.columns`.
  - `canMonitor: ({ source }) => source.data.type === "card"`.
- **Click vs drag:** use a `didDragRef` like the reference (set in `onDragStart`, cleared with `setTimeout(…, 0)` after drop). `TicketCard`'s `onClick` ignores clicks while it's `true`.
- **Keyboard:** the dnd-kit keyboard sensor goes away. Task 19 adds keyboard moves, so don't add one now. Keep Enter/Space opening the modal.
- **Removing props:** remove `TicketCard`'s now-unused `isOverlay`/`style` props only if nothing else uses them.
- **E2E:**
  - `dragCard(page, source, target, opts?: { edge?: "top" | "bottom" })`: compute the target's bounding box. `targetPosition` is `{ x: width / 2, y: 4 }` for top, `{ x: width / 2, y: height - 4 }` for bottom, and the centre otherwise. Call `source.dragTo(target, { targetPosition })`.
  - In `board.spec.ts`:
    - "3. Reorder within a Column" drags card3 onto card1 and expects card3 first, so call it with `{ edge: "top" }`;
    - "2. Drag across Columns" drags onto the Column locator (centre) and needs no change, unless the Column locator's centre lands on a card, in which case target the Column's empty area.
  - Don't add sleeps or `waitForTimeout`. Use `expect(...).toHaveAttribute`/`toBeVisible` polling.
- **Hosted e2e:** `e2e/hosted/auth.spec.ts` must keep passing.
- Don't add locks or mutexes.
