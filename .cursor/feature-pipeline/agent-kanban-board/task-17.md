# Task 17: Search and quick filters

## Context
The AI Work Board is a local Jira-style kanban for AI agents. The Board page (`src/web/pages/BoardPage.tsx`) shows five Columns from `GET /api/projects/:key/board`, with Feature labels (task 15) and Assignee avatars. Jira's board header has a search box and quick filters; this task adds them: free-text search over key, title and description, Feature chips, and Assignee avatar filters. Filters combine with AND, live in the URL, and Column counts reflect the filtered cards (as in Jira).

## Do
- Server: `GET /api/projects/:key/board` accepts optional query parameters, applied in SQL:
  - `q` — case-insensitive substring match on key, title or description.
  - `feature` — comma-separated Feature ids; a card matches if its Feature is any of them; the special value `none` matches cards without a Feature.
  - `assignee` — comma-separated Actor names; the special value `none` matches unassigned cards.
  - Different parameters combine with AND; values within one parameter with OR. `Board.features` and `Board.actors` are always unfiltered (so the chips stay visible). Apply the same parameter rules to `GET /api/projects/:key/tickets` (`feature` and `assignee` become comma lists there too, still accepting single values).
- Web:
  - `src/web/components/board/BoardFilters.tsx` in the `BoardPage` header area reserved in task 06: a search input with a magnifier icon ("Search board", debounced 250 ms); an Assignee avatar stack (each `ActorAvatar` toggles that Actor, plus an "Unassigned" avatar); Feature chips (`FeatureLabel`-styled toggle buttons, plus "No feature"); a "Clear filters" link shown when any filter is active.
  - State in the URL query: `q`, `feature`, `assignee` (comma lists), preserving `selectedIssue`. `useBoard(projectKey, filters)` includes the filters in the query key (`[...qk.board(key), filters]`) so live-update invalidation of `qk.board(key)` still refetches it.
  - An empty filtered Board shows "No tickets match these filters" in the Board area (Columns still render with 0 counts).
  - Drag-and-drop stays enabled while filtered; the move `position` is computed against the visible cards — convert it to the unfiltered position by placing the card directly after the visible card it was dropped under (or before the visible card above it when dropped at the top), using the ranks from the cached data.
- Tests `test/board-filters.test.ts`: `q` matches key, title and description, case-insensitively; `feature` single, multiple and `none`; `assignee` single, multiple and `none`; combinations AND; counts reflect filtered cards; `features`/`actors` unfiltered; the tickets list endpoint accepts the same.

## Follow these existing patterns
- `src/domain/tickets.ts` `getBoard`/`listTickets` — extend, don't duplicate.
- `src/web/components/FeatureLabel.tsx`, `ActorAvatar.tsx`, `src/web/api/board.ts` — reuse.

## Do not
- Touch files outside: `src/domain/`, `src/server/`, `src/web/`, `src/shared/`, `test/`.
- Add dependencies, reformat unrelated code, or commit.
- Filter on the client only (the server applies the filters).

## Done when
- Searching and toggling chips filters the Board, the URL reflects the filters (reload keeps them), and counts match.
- `pnpm test && pnpm typecheck && pnpm build` passes.
