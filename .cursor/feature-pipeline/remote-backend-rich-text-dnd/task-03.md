# Task 03: Expand: async Db and async app factory, still on SQLite

## Context
The AI Work Board (repo root `/Users/neazmahmood/Desktop/projects/practice/ai-work-board`) is moving from synchronous SQLite (`better-sqlite3`) to Postgres/PGlite, whose APIs are async. The domain core (`src/domain/*.ts`, about 120 synchronous `ctx.db.get/all/run/tx` calls) will be converted in later batches (expand–contract). This task is the **expand** step:
- Add an async `AsyncDb` beside the existing sync `Db`, backed by the same SQLite connection and the same transaction state.
- Add a single in-process write mutex.
- Make `createApp` async.

No domain module changes yet, and all behaviour stays identical.

## Do
- `src/server/writeMutex.ts` (new): `createWriteMutex()` returns `{ run<T>(fn: () => Promise<T>): Promise<T> }`. Calls run strictly one after another (FIFO), and a rejected `fn` releases the lock.
- `src/server/db.ts`:
  - Add `export interface AsyncDb`:
    - `get<T>(sql, ...params): Promise<T | undefined>`
    - `all<T>(sql, ...params): Promise<T[]>`
    - `run(sql, ...params): Promise<{ changes: number }>`
    - `tx<T>(fn: () => Promise<T>): Promise<T>`
  - Replace `openDb(file)` with `openSqlite(file): { db: Db; adb: AsyncDb; close(): void }`. Both wrappers share one `better-sqlite3` connection and one transaction flag. A sync `db.tx` inside an `adb.tx` joins it, and vice versa.
  - `adb.tx` runs through the write mutex. Use `AsyncLocalStorage` (from `node:async_hooks`) to detect that the caller is already inside an `adb.tx`, and in that case just run `fn` (join). Otherwise `BEGIN IMMEDIATE`, then `COMMIT`, or `ROLLBACK` on throw.
  - `adb.run` doesn't return a last-insert id. New code gets ids with `INSERT … RETURNING id` through `adb.get` (SQLite ≥ 3.35 supports `RETURNING`).
  - Keep the existing sync `Db` interface unchanged.
- `src/domain/context.ts`: `Ctx` gains `adb: AsyncDb` beside `db`.
- `src/server/app.ts`:
  - `export async function createApp(opts): Promise<{ app: Hono; ctx: Ctx; close(): Promise<void> }>`.
  - Open with `openSqlite`, keep running `migrate(db)` with the sync `db`, and build `ctx` with both `db` and `adb`.
- Callers of `createApp`: `src/cli/commands/start.ts`, `scripts/e2e-server.ts`, `test/helpers.ts`. In `test/helpers.ts`, `makeTestApp` and `startTestServer` become async and `close` returns a Promise. Update every test file to `await makeTestApp()` / `await testApp.close()`. This is a mechanical change.
- `test/async-db.test.ts` (new), against a temp-dir SQLite file:
  - `adb.get/all/run` work.
  - `INSERT … RETURNING id` returns the id.
  - `adb.tx` commits, and rolls back on throw.
  - A nested `adb.tx` joins the outer one.
  - A sync `db.tx` inside `adb.tx` joins it, and both roll back together.
  - Two concurrent `adb.tx` calls whose bodies `await new Promise(r => setTimeout(r, 20))` never overlap: record enter/exit order.

## Follow these existing patterns
- `src/server/db.ts`: the current `tx` implementation (`BEGIN IMMEDIATE`, rollback on throw, nested calls just run `fn`). Mirror its semantics in the async version.
- `test/helpers.ts`: keep `makeTestApp` as the single test entry point, with the same return shape apart from async.

## Do not
- Touch files outside: `src/server/db.ts`, `src/server/writeMutex.ts`, `src/server/app.ts`, `src/domain/context.ts`, `src/cli/commands/start.ts`, `scripts/e2e-server.ts`, `test/`
- Convert any domain module (`src/domain/*.ts` other than `context.ts`) to `adb`; later tasks do that.
- Add dependencies, reformat unrelated code, or commit

## Done when
- `ctx.adb` exists and is tested; every existing test passes unchanged in what it asserts.
- `pnpm test` passes
- `pnpm typecheck` passes
- `pnpm test:e2e` passes
