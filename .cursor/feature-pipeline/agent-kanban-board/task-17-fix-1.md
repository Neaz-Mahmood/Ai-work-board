# Task 17 fix 1: Keep optimistic drag-and-drop and filter chips working with the filtered board query

## Context
Task 17 changed `useBoard` (`src/web/api/board.ts:20`) to cache the Board under `[...qk.board(key), filters]` (with `filters` being `undefined` when no filter is active). Server filtering, the URL state and the tests are correct and `pnpm test && pnpm typecheck && pnpm build` passes. Two client problems remain:

1. **Optimistic move is gone, even without filters.** `useMoveTicket` in `src/web/api/tickets.ts` (lines 51, 53, 136, 147) still calls `getQueryData` / `setQueryData` with the exact key `qk.board(projectKey)` = `["board", key]`. TanStack hashes `["board", key, undefined]` as `["board","KEY",null]`, which is a different key, so `previousBoard` is always `undefined`. No optimistic update happens and nothing is rolled back on error. After a drop the card snaps back to its old place until the refetch returns. Task 17 caused this regression.
2. **Chips vanish on every filter change.** Each new `filters` value is a new query key with no data, so `isLoading` is true. `BoardPage.tsx:93-96` then passes `board?.actors ?? []` / `board?.features ?? []`, so every Assignee avatar and Feature chip disappears, and the Board is replaced by "Loading board..." on each toggle or debounced keystroke. The brief says `features`/`actors` stay unfiltered "so the chips stay visible".

## Do
- `src/web/api/tickets.ts` `useMoveTicket`:
  - Apply the optimistic update to the Board query that is actually rendered. Either accept the active `filters` (`useMoveTicket(projectKey, filters)`, with `Board.tsx` passing them through from `BoardPage`) and use the key `[...qk.board(projectKey), filters]`, or use `queryClient.getQueriesData` / `setQueriesData({ queryKey: qk.board(projectKey) }, …)` over the prefix. Use the same key(s) to restore on error. Keep `cancelQueries` / `invalidateQueries` on the `qk.board(projectKey)` prefix.
  - `position` is now an **unfiltered** index (task 17 `computeUnfilteredPosition`). When you insert optimistically into a column, put the card before the first cached card whose unfiltered rank is `>= position`, after you account for removing the card from its own column in a same-column move. Do not treat `position` as an index into the visible list. Do not renumber visible cards to `0..n-1` in a filtered view. Shift the ranks in unfiltered rank space instead (cards at or after the insertion rank get `+1`, and cards after the removed card in the source column get `-1`), so a second drag before the refetch still computes correct positions. For an unfiltered Board this gives the same result as before.
- `src/web/api/board.ts` `useBoard`: add `placeholderData: keepPreviousData` (exported by `@tanstack/react-query` v5, so no new dependency). Changing a filter then keeps the previous Board, actors and features on screen until the new data arrives, and `isLoading` stays false.

## Follow these existing patterns
- `src/web/api/tickets.ts` `useMoveTicket` onMutate/onError/onSettled structure. Extend it; don't add a second mutation.
- `src/web/components/board/Board.tsx` `computeUnfilteredPosition` gives the meaning of `position`.

## Do not
- Touch files outside `src/web/`, or change server/domain code or `test/` (server behaviour is already correct).
- Add dependencies, reformat unrelated code, or commit.

## Done when
- `grep -n "getQueryData<Board>(qk.board(projectKey))\|setQueryData<Board>(qk.board(projectKey)" src/web/api/tickets.ts` prints nothing. The optimistic update targets the filtered key or uses `getQueriesData`/`setQueriesData`.
- `grep -n "keepPreviousData" src/web/api/board.ts` matches.
- `grep -rn "src/web" test/` prints nothing (tests still don't import web code).
- `pnpm test && pnpm typecheck && pnpm build` passes.
- Manual: on an unfiltered Board, dragging a card shows it in the new place immediately with no snap-back. With a filter active, a drag also lands immediately, and toggling a chip leaves the avatars and chips visible.
