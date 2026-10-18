# Task 06: Migrate batch C: Projects, Actors, Activity, listing Comments

## Context
The AI Work Board (repo root `/Users/neazmahmood/Desktop/projects/practice/ai-work-board`) is converting its domain core from the sync `ctx.db` to the async `ctx.adb` (`AsyncDb` in `src/server/db.ts`), callers-first. All callers are already async. This last batch converts the leaf modules. After it, no domain code uses the sync `ctx.db`; only the migrations runner still does, and the next task removes it.

## Do
- Convert to `async` using `ctx.adb`:
  - `src/domain/projects.ts`: `createProject`, `listProjects`, `getProject`, `renameProject`, `deleteProject`, `resolveProject`. `normalizeProjectPath` and `deriveKey` are pure and stay sync.
  - `src/domain/actors.ts`: `touchActor`, `listActors`. `actorColor`, `restActor`, `resolveActorName` and `assertAgentActor` are pure and stay sync.
  - `src/domain/activity.ts`: `recordActivity`, `listActivity`
  - `src/domain/comments.ts`: `listComments`
- Add `await` at every call site across `src/domain/`, `src/server/routes/`, `src/mcp/` and `test/`.
- Write changed SQL portably:
  - `INSERT … RETURNING id` via `ctx.adb.get`
  - `ON CONFLICT … DO NOTHING` instead of `INSERT OR IGNORE`
  - `lower()` instead of `COLLATE NOCASE`
  - `Number(...)` around counts
- Remove `db` from the `Ctx` type in `src/domain/context.ts`. Keep the sync `Db` only where `src/server/app.ts` runs `migrate(db)`. Tests that read tables directly (e.g. `test/skeleton.test.ts`) switch to `await testApp.ctx.adb.all(...)`.

## Follow these existing patterns
- `src/domain/tickets.ts` (converted in the previous batch): the converted style.
- Activity entries, Actor registration on first use, and the Project Key derivation rules must behave exactly as today, as the existing tests define.

## Do not
- Touch files outside: `src/domain/`, `src/server/routes/`, `src/mcp/`, `src/server/app.ts`, `test/`
- Change `src/server/migrations.ts` or the SQLite driver; the next task replaces them.
- Add dependencies, reformat unrelated code, or commit

## Done when
- `grep -rn "ctx\.db\b" src test` returns nothing, and `Ctx` has no sync `db`.
- `pnpm test` passes
- `pnpm typecheck` passes
- `pnpm test:e2e` passes
