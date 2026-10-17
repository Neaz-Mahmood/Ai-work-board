# Task 06: Board view, read-only

## Context
The AI Work Board is a local Jira-style kanban for AI agents. Task 05 built the React app shell (sidebar, routing `/projects/:key`, a placeholder `BoardPage`), and task 04 added `GET /api/projects/:key/board`, which returns the Board: five fixed Columns, each with its Ticket cards ordered by Rank. This task renders that Board read-only in Jira's style. Drag-and-drop (09), the detail modal (10), live updates (08) and filters (17) come later.

## Do
- `src/web/api/board.ts`: `useBoard(projectKey)` → `useQuery({ queryKey: qk.board(key), queryFn: GET /api/projects/:key/board })`.
- `src/web/pages/BoardPage.tsx`: replaces the placeholder. Header: breadcrumb `Projects / <name>`, page title `<KEY> board` style heading (Jira shows "<Project> board"), and an empty right-hand area reserved for search/filters (task 17). Below: the Board. Loading and error states.
- `src/web/components/board/Board.tsx`: horizontal flex of the five Columns from the response, in order; the board area scrolls horizontally when narrower than the Columns (no page-level horizontal scroll).
- `src/web/components/board/Column.tsx`: 272px-wide column, `--color-column` background, 6px radius, header with the Column name in uppercase small bold subtle text followed by the Ticket count (e.g. `TO DO 3`); cards stacked with 4px gaps; the column body scrolls vertically if tall. Empty columns stay visible.
- `src/web/components/board/TicketCard.tsx` (Jira card look: white, 1px shadow `0 1px 1px rgba(9,30,66,.25)`, 3px radius, 8–12px padding, hover background `#F7F8F9`):
  - Title (up to 3 lines, then ellipsis).
  - Footer row: left — Feature label slot (render nothing when `feature` is null; task 15 fills it), then `PriorityIcon`, then the key in subtle small text; right — `ActorAvatar` for the Assignee (or nothing).
  - Marker slots: render a small red "Blocked" lozenge when `blocked` is true and an orange "Needs attention" lozenge (with `title` = reason) when `needsAttention` is non-null. Both values are already in the `Card` type.
  - The whole card is a button-like element with `data-ticket-key` attribute (task 10 opens the modal on click; for now clicking does nothing).
- `src/web/components/PriorityIcon.tsx`: inline SVG chevrons like Jira — highest (two red up chevrons, `#C9372C`), high (one red-orange up chevron, `#E2483D`), medium (two horizontal orange bars, `#E2B203`), low (one blue down chevron, `#0C66E4`), lowest (two blue down chevrons); `aria-label` and `title` = the priority name.
- `src/web/components/ActorAvatar.tsx`: 24px circle with the Actor's initials (first two letters, uppercased) in white on the Actor's colour (look the colour up from `board.actors`; fall back to grey `#8590A2`); `title` = Actor name.
- Card and column styles in `src/web/components/board/board.css`.

## Follow these existing patterns
- `src/web/api/projects.ts`, `src/web/api/queryKeys.ts`, `src/web/api/client.ts` — query hooks and keys.
- `src/web/styles/theme.css` — colour tokens; reuse them.
- `src/shared/types.ts` — `Board`, `Card`, `Actor`, `ColumnId`, `Priority`.

## Do not
- Touch files outside: `src/web/`.
- Add dependencies, reformat unrelated code, or commit.
- Add drag-and-drop, Ticket creation, the modal, SSE or filters (later tasks).

## Done when
- Opening `/projects/<KEY>` shows five Columns (Backlog, To Do, In Progress, In Review, Done) with counts and Jira-style cards for Tickets created via `awb ticket create`.
- `pnpm test && pnpm typecheck && pnpm build` passes.
