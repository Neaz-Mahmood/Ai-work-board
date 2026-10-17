# Task 19: UI smoke tests (Playwright)

## Context
The AI Work Board is a local Jira-style kanban for AI agents with a React UI served by the local server (`awb start`, `createApp` in `src/server/app.ts` with `staticDir` serving `dist/web`). The UI has no unit tests by design; this task adds the small Playwright smoke suite (test Seam 3) that checks the Board end to end in a real browser against a real server with an isolated temp data directory.

## Do
- Dev dependency: `@playwright/test`. Install the browser with `pnpm exec playwright install chromium`.
- `package.json` script: `"test:e2e": "pnpm build && playwright test"` (replacing the stub). Vitest must not pick up e2e files (`vitest.config.ts` already includes only `test/**/*.test.ts`; keep e2e files under `e2e/` named `*.spec.ts`).
- `scripts/e2e-server.ts`: creates a fresh temp dir (`fs.mkdtempSync`), calls `createApp({ dataDir, staticDir: <repo>/dist/web })`, serves it with `@hono/node-server` on `127.0.0.1:4799`, removes the temp dir on SIGTERM/SIGINT. Run with `node scripts/e2e-server.ts`.
- `playwright.config.ts`: `testDir: "e2e"`, Chromium only, `baseURL: "http://127.0.0.1:4799"`, `webServer: { command: "node scripts/e2e-server.ts", url: "http://127.0.0.1:4799/api/health", reuseExistingServer: false }`, `workers: 1`, `retries: 0`, trace on first retry off.
- Add `e2e`, `scripts` and `playwright.config.ts` to the `include` list in `tsconfig.json` so `pnpm typecheck` covers them.
- `e2e/helpers.ts`: REST helpers via Playwright `request` fixture: `createProject(request)` (makes its own temp repo dir with a unique key), `createTicket(request, key, body, actor?)`, `createFeature(...)`.
- `e2e/board.spec.ts` (each test creates its own Project so tests are independent):
  1. **Columns and counts**: Tickets in Backlog ×2 and To Do ×1 → the Board shows BACKLOG 2, TO DO 1, IN PROGRESS 0, IN REVIEW 0, DONE 0, and the cards with their keys.
  2. **Drag across Columns**: drag a card from Backlog to In Progress (use `locator.dragTo` or manual mouse moves with steps, respecting the 5px activation distance); after reload it is still in In Progress; `GET /api/tickets/:key` Activity has `moved` by `you`.
  3. **Reorder within a Column**: three To Do cards; drag the third above the first; order persists after reload.
  4. **Modal edit and comment**: click a card → URL has `selectedIssue=<KEY>`; edit the title, set Priority to High, add a comment with `**bold**` → it renders bold; close and reopen via URL; changes persist; Activity tab lists the changes.
  5. **Filters**: two Features and two assignees; toggling a Feature chip shows only its cards; search by a word from one Ticket's description narrows to it; "Clear filters" restores all; URL contains the filter params.
  6. **Live update**: with the Board open, create a Ticket through REST with actor `agent-x` → its card appears without reload within 3 s; flag it Needs Attention through REST → the "Needs attention" lozenge appears.
- Use role/text selectors and the `data-ticket-key` attribute on cards; add `data-testid` attributes in `src/web/` only where no accessible selector exists (e.g. `data-testid="column-todo"` on Columns), without changing behaviour or look.

## Follow these existing patterns
- `test/helpers.ts` — temp data dir handling; `src/cli/commands/start.ts` — how the server is served.
- `src/web/components/board/`, `src/web/components/ticket/TicketModal.tsx`, `src/web/components/board/BoardFilters.tsx` — the UI under test.

## Do not
- Touch files outside: `e2e/`, `scripts/e2e-server.ts`, `playwright.config.ts`, `tsconfig.json` (include list only), `package.json`, `pnpm-lock.yaml`, `.gitignore`, and `data-testid` additions in `src/web/`.
- Add dependencies other than `@playwright/test`; change app behaviour or styling; commit.
- Touch `~/.ai-work-board` (always a temp data dir).

## Done when
- All six smoke tests pass reliably (run twice in a row).
- `pnpm test:e2e` passes, and `pnpm test && pnpm typecheck` still pass.
