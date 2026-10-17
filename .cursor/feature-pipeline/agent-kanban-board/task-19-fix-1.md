# Task 19 fix 1: Clean up e2e temp dirs and cover the Assignee filter

## Context
The Playwright smoke suite from Task 19 passes (6/6, twice in a row), but two things fall short of the brief:

1. **Temp dirs leak on every run.** Each `pnpm test:e2e` run leaves behind one `$TMPDIR/awb-e2e-XXXX` data dir (containing `board.db*`) and six `$TMPDIR/awb-e2e-repo-XXXX` dirs. Measured: before two runs there were 8 data dirs + 37 repo dirs; after, 10 + 49.
   - Data dir: `playwright.config.ts` `webServer` has no `gracefulShutdown`, so Playwright stops the server with SIGKILL. The SIGTERM/SIGINT/exit handlers in `scripts/e2e-server.ts` (lines 42-53) never run and `fs.rmSync(dataDir, ...)` never happens.
   - Repo dirs: `e2e/helpers.ts` `createProject` (line 22) calls `fs.mkdtempSync(path.join(os.tmpdir(), "awb-e2e-repo-"))` for every Project and nothing removes them.
2. **The Assignee filter is never exercised.** `e2e/board.spec.ts` test "5. Filters" (lines 216-301) creates tickets with assignees `alice` and `bob`, but it only toggles a Feature chip and the search box. The brief's Filters test ("two Features and two assignees") must also check the Assignee filter.

## Do
- `playwright.config.ts`: add `gracefulShutdown: { signal: "SIGTERM", timeout: 5000 }` to `webServer`, so the server's existing SIGTERM handler runs and removes its data dir.
- `e2e/helpers.ts`: make the per-Project repo dirs removable. For example, create them all under one parent temp dir (`awb-e2e-repos-XXXX`) and export a `cleanupRepoDirs()` that `fs.rmSync`s it, or record each created dir and remove them all in the cleanup. Call the cleanup from `test.afterAll` in `e2e/board.spec.ts`, or from a Playwright `globalTeardown`.
- `e2e/board.spec.ts` test 5: after "Clear filters" (or before the Feature step), click the `bob` button in `getByRole("group", { name: "Assignees" })` (`getByRole("button", { name: "bob" })`). Assert the URL contains `assignee=bob`, the cards for t2 and t3 are visible, and t1 is hidden. Then clear the filters again and assert all three cards are back.

## Follow these existing patterns
- `scripts/e2e-server.ts` cleanup handlers (already correct once SIGTERM is delivered).
- `test/helpers.ts` temp-dir creation and removal.
- `src/web/components/board/BoardFilters.tsx` lines 179-208: the Assignees group, where each avatar button has `aria-label={actor.name}` and `aria-pressed`.

## Do not
- Touch product code in `src/`, or files outside `e2e/`, `scripts/e2e-server.ts`, `playwright.config.ts` and `package.json`.
- Add dependencies.
- Touch `~/.ai-work-board`.

## Done when
- Run from the project root:
  ```sh
  before=$(ls -d "${TMPDIR:-/tmp}"/awb-e2e-* 2>/dev/null | wc -l)
  pnpm test:e2e && pnpm test:e2e
  after=$(ls -d "${TMPDIR:-/tmp}"/awb-e2e-* 2>/dev/null | wc -l)
  [ "$before" -eq "$after" ] && echo CLEAN
  ```
  Both runs pass 6/6 and the script prints `CLEAN`.
- `grep -n 'name: "Assignees"' e2e/board.spec.ts` matches, and test 5 asserts `assignee=` in the URL.
- `lsof -i :4799` prints nothing after the runs.
- `pnpm test && pnpm typecheck` still pass.
