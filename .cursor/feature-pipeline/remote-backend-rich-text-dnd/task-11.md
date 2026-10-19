# Task 11: Split into web and server apps; local mode serves the bundled SPA

## Context
The AI Work Board (repo root `/Users/neazmahmood/Desktop/projects/practice/ai-work-board`) becomes a pnpm workspace of three packages, so the UI can be deployed separately from the backend:
- `apps/web`: the React SPA (Vite, static build).
- `apps/server`: domain core, storage, REST, SSE, MCP and the `awb` CLI.
- `packages/shared` (`@awb/shared`, already exists): shared types.

In local mode (`awb start`), the server still serves the built SPA from the same origin. In hosted mode it serves no UI. This is a mechanical move: behaviour, tests and e2e stay the same.

## Do
- `pnpm-workspace.yaml`: `packages: ["apps/*", "packages/*"]`.
- Move with `git mv` (preserving history):
  - `src/web/` → `apps/web/src/` (including `index.html`)
  - `vite.config.ts` → `apps/web/vite.config.ts`, with `root: "src"`, `build.outDir: "../dist"`, `emptyOutDir: true`, and the same dev `server.proxy` for `/api` and `/mcp`
  - `src/domain/`, `src/server/`, `src/mcp/`, `src/cli/` → `apps/server/src/domain/`, `apps/server/src/server/`, `apps/server/src/mcp/`, `apps/server/src/cli/`
  - `bin/awb.js` → `apps/server/bin/awb.js`
  - `test/` → `apps/server/test/`
- `apps/web/package.json`: `{ "name": "@awb/web", "private": true, "type": "module", "dependencies": { "@awb/shared": "workspace:*" }, "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" } }`.
- `apps/server/package.json`: `{ "name": "@awb/server", "version": "0.1.0", "private": true, "type": "module", "bin": { "awb": "bin/awb.js" }, "dependencies": { "@awb/shared": "workspace:*" } }`. `src/server/app.ts` reads the version from `../../package.json`, which now resolves to this file.
- Keep all third-party dependencies in the root `package.json` (hoisted) for now; don't redistribute them.
- Root `package.json`:
  - `bin.awb` → `apps/server/bin/awb.js`
  - `build` → `pnpm --filter @awb/web build`
  - `dev` → `pnpm --filter @awb/web dev`
  - `start` → `node apps/server/bin/awb.js start`
  - `test`, `typecheck` and `test:e2e` stay root commands.
- `vitest.config.ts` (root): `include: ["apps/server/test/**/*.test.ts", "apps/web/src/**/*.test.ts"]`.
- `tsconfig.json` (root): `include` → `apps`, `packages`, `e2e`, `scripts`, `vitest.config.ts`, `playwright.config.ts`.
- `apps/server/src/cli/commands/start.ts`: in local mode serve the SPA from `apps/web/dist`, resolved relative to the file (`new URL("../../../../web/dist", import.meta.url)`; verify the path).
- `scripts/e2e-server.ts`: import from `../apps/server/src/server/app.ts`, with `staticDir` → `apps/web/dist`.
- `e2e/helpers.ts` and any other moved-file import paths: fix them.
- `.gitignore` already ignores `dist` at any depth; confirm `apps/web/dist` is ignored.
- `README.md`: update the paths in the development section only.

## Follow these existing patterns
- The current `vite.config.ts` and `src/cli/commands/start.ts`: same proxy, same static-serving behaviour (`serveStatic` with SPA fallback in `src/server/app.ts`).

## Do not
- Touch files outside: the moves above, `apps/*/package.json`, root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `vitest.config.ts`, `tsconfig.json`, `playwright.config.ts`, `scripts/e2e-server.ts`, `e2e/`, `README.md`, and import-path fixes inside moved files
- Change any behaviour, rename any symbol, or edit logic
- Add new third-party dependencies, reformat unrelated code, or commit

## Done when
- The top-level `src/`, `test/` and `bin/` directories no longer exist.
- `pnpm build` writes `apps/web/dist/index.html`, and `node apps/server/bin/awb.js start` serves the board at http://127.0.0.1:4747.
- `pnpm test` passes
- `pnpm typecheck` passes
- `pnpm test:e2e` passes

## Clarifications (checked against the code)
- **Already done by Claude; don't redo, undo or edit these:**
  - every `git mv` in the Do list (top-level `src/`, `test/` and `bin/` are gone; files are at their new paths);
  - `pnpm-workspace.yaml`, `apps/web/package.json`, `apps/server/package.json`;
  - root `package.json` (`bin` + `build`/`dev`/`start` scripts);
  - `pnpm install` (both apps link `@awb/shared`).

  Don't run pnpm (other than the three verification commands), git or any other shell command.
- **Relative imports that survive the move unchanged — don't touch them:**
  - `apps/server/test/*` still imports `../src/...`;
  - `apps/server/bin/awb.js` still imports `../src/cli/main.ts`;
  - `apps/server/src/server/app.ts` and `apps/server/src/mcp/server.ts` read `../../package.json`, which is now `apps/server/package.json` (same version `0.1.0`), as the spec intends.
- **Edits left to you (only these):**
  1. `apps/web/vite.config.ts`: `root: "src"` and `build.outDir: "../dist"`. Keep `emptyOutDir` and the proxy unchanged.
  2. `vitest.config.ts`: `include: ["apps/server/test/**/*.test.ts", "apps/web/src/**/*.test.ts"]`. Leave the other options unchanged.
  3. `tsconfig.json` `include`: exactly `["apps", "packages", "e2e", "scripts", "vitest.config.ts", "playwright.config.ts"]`. Leave `compilerOptions` unchanged. `apps/web/vite.config.ts` is covered by `apps`.
  4. `apps/server/src/cli/commands/start.ts`: change the static dir URL from `"../../../dist/web"` to `"../../../../web/dist"`. From `apps/server/src/cli/commands/start.ts` that resolves to `apps/web/dist`.
  5. `scripts/e2e-server.ts`: import `createApp` from `../apps/server/src/server/app.ts`, and set `staticDir` to `path.join(repoRoot, "apps/web/dist")`.
  6. `README.md` section "10. Development": keep the commands. Add one bullet describing the layout: `apps/web` (Vite SPA, built to `apps/web/dist`), `apps/server` (domain, REST/SSE/MCP server, `awb` CLI, tests) and `packages/shared` (`@awb/shared` types). Change nothing else in the README.
- `e2e/helpers.ts` already imports only `@awb/shared` and `@playwright/test`, so it needs no change. Check the other `e2e/` files, and change them only if an import is actually broken.
- `.gitignore` has `dist` with no slash, which ignores `apps/web/dist`. No change.
- Claude will run `pnpm build` and the `awb start` smoke test. Your checks are the three pnpm commands. Note that `pnpm test:e2e` runs `pnpm build` first.
