# Task 05 fix 1: restore the `name_lower` lookup for Feature names

## Context
The AI Work Board (repo root `/Users/neazmahmood/Desktop/projects/practice/ai-work-board`) is converting its domain core to async `ctx.adb`. Task 05 converted `src/domain/tickets.ts`, `blockers.ts` and `features.ts`; that work is correct and must be kept, with one exception.

Feature names are unique per project through a stored `name_lower` column (`src/server/migrations.ts:84-89`, `UNIQUE(project_id, name_lower)`), written with JS `trimmedName.toLowerCase()`. Task 05 changed the two duplicate-name lookups in `src/domain/features.ts` to `lower(name) = lower(?)`. SQLite's `lower()` only folds ASCII, while JS `toLowerCase()` folds all of Unicode. A name such as "Été" next to an existing "été" passes the friendly duplicate check and then fails on the unique index with a 500 error instead of the intended conflict error.

## Do
In `src/domain/features.ts` only:
- Line ~135 (`createFeature`): change back to `"SELECT id FROM features WHERE project_id = ? AND name_lower = ?"`, passing `trimmedName.toLowerCase()` as the parameter.
- Line ~410 (`updateFeature`): change back to `"SELECT id FROM features WHERE project_id = ? AND name_lower = ? AND id != ?"`, passing `trimmedName.toLowerCase()`.
- Keep everything else in the file as it is (async, `ctx.adb`, `RETURNING id`, `Number(...)`).

## Do not
- Touch any other file or any other line
- Add dependencies, reformat code, or commit

## Done when
- No `lower(name)` remains in `src/domain/features.ts`
- `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` pass
