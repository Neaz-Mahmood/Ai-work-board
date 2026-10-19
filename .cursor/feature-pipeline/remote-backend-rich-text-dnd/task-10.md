# Task 10: Expand: extract the shared package

## Context
The AI Work Board (repo root `/Users/neazmahmood/Desktop/projects/practice/ai-work-board`) is about to split into a separately deployed web app and a server app in a pnpm workspace. The web UI currently imports server-side files directly: `src/shared/types.ts`, `src/shared/columns.ts`, and `src/domain/events.ts` (from `src/web/api/useLiveUpdates.ts`). This task creates a workspace package `@awb/shared` that holds the code both sides need, and points every import at it. Nothing moves except the shared code, and behaviour is unchanged.

## Do
- `pnpm-workspace.yaml`: add `packages: ["packages/*"]`. Keep the existing `overrides` entry.
- `packages/shared/package.json` (new): `{ "name": "@awb/shared", "version": "0.1.0", "private": true, "type": "module", "exports": { "./*": "./src/*" } }`.
- Move `src/shared/types.ts` → `packages/shared/src/types.ts` and `src/shared/columns.ts` → `packages/shared/src/columns.ts`.
- `packages/shared/src/events.ts` (new): move the `BoardEventType` and `BoardEvent` **types** out of `src/domain/events.ts`. `src/domain/events.ts` keeps the `EventBus` class and imports those types from `@awb/shared/events.ts`.
- Root `package.json`: add `"@awb/shared": "workspace:*"` to dependencies, then run `pnpm install`.
- Replace every import of `../shared/…`, `../../shared/…`, `../../../shared/…` and `../../domain/events.ts` (types) across `src/`, `test/`, `e2e/`, `scripts/` with `@awb/shared/types.ts`, `@awb/shared/columns.ts` or `@awb/shared/events.ts`.
- Delete the empty `src/shared/` directory.
- `tsconfig.json`: add `"packages"` to `include`.
- Node runs `.ts` files directly with type stripping, which Node refuses inside `node_modules`. The workspace symlink resolves to `packages/shared/src`, so it should work. Verify with the commands below. If Node refuses, stop and report the exact error; don't work around it.

## Follow these existing patterns
- Existing import style: explicit `.ts` extensions and `import type` for types (`verbatimModuleSyntax` is on).

## Do not
- Touch files outside: `packages/shared/`, `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, and import lines in `src/`, `test/`, `e2e/`, `scripts/`
- Move the web or server code (the next task does that)
- Add dependencies other than the workspace link, reformat unrelated code, or commit

## Done when
- No file under `src/web` imports from `src/domain`, `src/server` or `src/shared`; `grep -rn "domain/\|server/\|/shared/" src/web` returns nothing.
- `node bin/awb.js --help` runs.
- `pnpm test` passes
- `pnpm typecheck` passes
- `pnpm test:e2e` passes

## Clarifications (checked against the code)
- **Already done by Claude; don't redo or edit these:**
  - `pnpm-workspace.yaml` (packages + the existing override);
  - `packages/shared/package.json`;
  - the root `package.json` dependency `"@awb/shared": "workspace:*"`, plus `pnpm install` (`node_modules/@awb/shared` → `packages/shared` symlink exists);
  - `"packages"` in `tsconfig.json` `include`.

  Node 26 has been checked to import `.ts` from `@awb/shared/...` through the symlink. Don't run pnpm, git or any other shell command apart from the three verification commands.
- **File moves:** use your file tools. Create `packages/shared/src/types.ts` and `packages/shared/src/columns.ts` with byte-identical contents, then delete `src/shared/types.ts`, `src/shared/columns.ts` and the `src/shared/` directory. `columns.ts` keeps its relative `./types.ts` import, since both files live in the same package.
- **Events:** only the two types `BoardEventType` and `BoardEvent` move, to `packages/shared/src/events.ts`, unchanged. `src/domain/events.ts` keeps `EventBus` and adds `import type { BoardEvent } from "@awb/shared/events.ts";`. It must not re-export the types. Retarget the type-only importers:
  - `src/web/api/useLiveUpdates.ts`
  - `src/server/routes/events.ts`
  - `test/claim.test.ts`

  `src/server/app.ts` keeps `import { EventBus } from "../domain/events.ts"`.
- **Import specifiers:**
  - `@awb/shared/types.ts`, `@awb/shared/columns.ts` and `@awb/shared/events.ts`, with the `.ts` extension included;
  - keep `import type` where it is used today;
  - change only the module specifier on each import line.
- **Correct Done-when check:** the grep in Done-when matches `@awb/shared/` too, so use this one. It must print nothing:
  `grep -rnE "from \"(\.\./)+(domain|server|shared)/" src/web`
  To be sure nothing still points at the old location, this must also print nothing: `grep -rnE "shared/(types|columns)\.ts\"" src test e2e scripts | grep -v "@awb/shared"`.
- `node bin/awb.js --help` can't be run (shell is limited). Claude will run it.
