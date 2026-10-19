# Task 03 fix 1: finish the async Db expand step

## Context
The AI Work Board (repo root `/Users/neazmahmood/Desktop/projects/practice/ai-work-board`) is moving from sync SQLite to async Postgres/PGlite via expand–contract. Task 03 adds an async `AsyncDb` (`ctx.adb`) beside the sync `Db` and makes `createApp` async. Most of it is already done and must be kept:
- `src/server/writeMutex.ts`: `createWriteMutex()` (done)
- `src/server/db.ts`: `openSqlite(file)` returning `{ db, adb, close }`, `AsyncDb` interface (done, one bug below)
- `src/server/app.ts`: `createApp` is async, `close()` returns a Promise (done)
- `src/domain/context.ts`, `src/cli/commands/start.ts`, `scripts/e2e-server.ts`, `test/helpers.ts` (done: `makeTestApp` and `startTestServer` are async, `close()` returns a Promise)

What's missing: the test files were never updated for the async API, so `pnpm typecheck` and `pnpm test` fail, and the new async-db test file doesn't exist.

## Do
1. **Update every test file under `test/`** that calls `makeTestApp(...)`, `createApp(...)` or `.close()` on their results:
   - `await makeTestApp(...)` / `await createApp(...)`; make the enclosing `beforeEach`/`it`/helper functions `async` where needed.
   - `await testApp.close()` / `await created.close()`, including in `afterEach` and `finally` blocks.
   - Run `pnpm typecheck` to find them all (e.g. `test/skeleton.test.ts`, `test/tickets.test.ts`, `test/tickets-edit.test.ts`, `test/tickets-delete.test.ts`, and others). This is mechanical: don't change what any test asserts.
2. **Fix a transaction bug in `src/server/db.ts`.** The sync `db.tx` currently joins any open transaction when `inTx` is true. While an `adb.tx` is awaiting, an unrelated sync `db.tx` (e.g. from another request) would silently join it and roll back with it. Change sync `db.tx` so that:
   - if `txStorage.getStore()` is truthy (called from inside an `adb.tx` or a sync `db.tx`), it just runs `fn` (join), as now;
   - else if `inTx` is true (an async transaction is open, but we're not inside it), it throws `new Error("Sync transaction started while an async transaction is open")`;
   - otherwise `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK` as now.
   Keep everything else in `db.ts` as it is.
3. **Create `test/async-db.test.ts`** (vitest; mirror the style of existing tests in `test/`). Use `openSqlite` on a file in a temp dir (`fs.mkdtempSync(path.join(os.tmpdir(), "awb-adb-"))`), create a small table, and in `afterEach` close and `fs.rmSync(dir, { recursive: true, force: true })`. Cover:
   - `adb.get`, `adb.all`, `adb.run` work (`run` returns `{ changes }`).
   - `INSERT … RETURNING id` through `adb.get` returns the id.
   - `adb.tx` commits; `adb.tx` whose body throws rolls back and rethrows.
   - A nested `adb.tx` joins the outer one (the outer throw rolls back the inner write too).
   - A sync `db.tx` inside `adb.tx` joins it, and both roll back together on throw.
   - Two concurrent `adb.tx` calls whose bodies `await new Promise(r => setTimeout(r, 20))` never overlap: record enter/exit events and assert `["enter1","exit1","enter2","exit2"]`.
   - A sync `db.tx` started from outside while an `adb.tx` is awaiting (start `adb.tx` with a body that awaits a timer, then call `db.tx` before it resolves) throws `"Sync transaction started while an async transaction is open"`, and the async transaction still commits.
   - The write mutex releases after a rejected `fn`: a later `adb.tx` still runs.

## Follow these existing patterns
- `test/pglite-proof.test.ts`: temp-dir setup and cleanup.
- `test/helpers.ts`: how the tests get an app.

## Do not
- Touch files outside: `src/server/db.ts`, `test/`
- Convert any domain module (`src/domain/*.ts`) to `adb`
- Add dependencies, reformat unrelated code, or commit

## Done when
- `pnpm typecheck` passes
- `pnpm test` passes (every existing test runs and passes, plus the new `test/async-db.test.ts`)
- `pnpm test:e2e` passes
