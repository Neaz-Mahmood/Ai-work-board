# Task 01: Walking skeleton

## Context
We are building the AI Work Board: a local Jira-style kanban board that AI coding agents write to through MCP and an `awb` CLI, and the human uses through a React web UI. One local Node server (TypeScript, Node 26, pnpm) is the only process that writes the SQLite database; it serves the UI, a REST API under `/api`, and later MCP at `/mcp`. The repository at `/Users/neazmahmood/Desktop/projects/practice/ai-work-board` is empty apart from `CONTEXT.md`, `docs/adr/`, `.claude/` and `.cursor/`. This task creates the project skeleton every later task builds on: package setup, test setup, the `createApp` factory, the database layer with migrations, `GET /api/health`, `awb start`, and a placeholder React page. Full spec (supplementary): `.cursor/feature-pipeline/agent-kanban-board/spec.md`.

## Do
- `package.json`: name `ai-work-board`, `"type": "module"`, `"private": true`, `"engines": { "node": ">=26" }`, `"bin": { "awb": "bin/awb.js" }`. Scripts:
  - `"test": "vitest run"`
  - `"typecheck": "tsc --noEmit"`
  - `"build": "vite build"`
  - `"dev": "vite"` (UI dev server; proxies to the API)
  - `"start": "node bin/awb.js start"`
  - `"test:e2e": "echo \"e2e suite not yet implemented\""` (task 19 replaces it)
- **No TypeScript build step for server/CLI.** Node 26 runs `.ts` files directly (type stripping). Therefore all relative imports use explicit `.ts` / `.tsx` extensions, and only erasable TypeScript syntax is allowed (no `enum`, no `namespace`, no constructor parameter properties).
- `tsconfig.json`: `strict: true`, `target: "ES2023"`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `allowImportingTsExtensions: true`, `noEmit: true`, `erasableSyntaxOnly: true`, `verbatimModuleSyntax: true`, `jsx: "react-jsx"`, `lib: ["ES2023", "DOM", "DOM.Iterable"]`, `types: ["node"]`, `skipLibCheck: true`, `include: ["src", "test", "bin", "vite.config.ts", "vitest.config.ts"]`.
- `vitest.config.ts`: `test.include: ["test/**/*.test.ts"]`, `environment: "node"`, `testTimeout: 15000`.
- `vite.config.ts`: `root: "src/web"`, `build.outDir: "../../dist/web"`, `emptyOutDir: true`, plugin `@vitejs/plugin-react`, dev `server.proxy` for `/api` and `/mcp` to `http://127.0.0.1:4747`.
- `.gitignore`: `node_modules`, `dist`, `*.log`, `test-results`, `playwright-report`.
- Allow better-sqlite3's install script under pnpm 11 (pnpm blocks dependency build scripts by default): add it to the allowed-builds setting pnpm 11 reads (e.g. `onlyBuiltDependencies: [better-sqlite3]` in `pnpm-workspace.yaml`, or the equivalent your pnpm version documents), then confirm `node -e "require('better-sqlite3')(':memory:')"` works. **If better-sqlite3 cannot be built on Node 26**, remove it and implement the same `Db` interface below with the built-in `node:sqlite` (`DatabaseSync`) instead; write a one-line comment at the top of `src/server/db.ts` saying which driver is used and why.
- `src/server/clock.ts`: `export type Clock = { now(): Date }`; `export const systemClock: Clock`.
- `src/server/db.ts`: a driver-agnostic wrapper. Every later task uses ONLY this interface:
  ```ts
  export type SqlParam = string | number | null;
  export interface Db {
    exec(sql: string): void;
    get<T>(sql: string, ...params: SqlParam[]): T | undefined;
    all<T>(sql: string, ...params: SqlParam[]): T[];
    run(sql: string, ...params: SqlParam[]): { changes: number; lastInsertRowid: number };
    tx<T>(fn: () => T): T; // BEGIN IMMEDIATE … COMMIT, ROLLBACK on throw; nested calls just run fn
    close(): void;
  }
  export function openDb(file: string): Db; // sets journal_mode=WAL, foreign_keys=ON, busy_timeout=5000
  ```
- `src/server/migrations.ts`: `export const migrations: { id: number; name: string; sql: string }[]` and `export function migrate(db: Db): void`. A `schema_version(id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)` table records applied migrations; `migrate` applies the missing ones in id order, each inside `db.tx`. Migration 1 (`init`) creates `app_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)`. Later tasks append migrations; they never edit earlier ones.
- `src/server/errors.ts`: `export class DomainError extends Error { code: string; status: 400 | 404 | 409 }` (assign fields in the constructor body, not as parameter properties) with helpers `validation(msg)` (code `VALIDATION`, 400), `notFound(msg)` (`NOT_FOUND`, 404), `conflict(msg)` (`CONFLICT`, 409). An `onError` handler in the app turns a `DomainError` into `{ "error": { "code", "message" } }` with its status, and any other error into code `INTERNAL`, status 500.
- `src/domain/context.ts`: `export type Ctx = { db: Db; clock: Clock }` (domain functions take `ctx` as first argument; task 08 adds `events`).
- `src/server/app.ts`:
  ```ts
  export type AppOptions = { dataDir: string; clock?: Clock; staticDir?: string };
  export function createApp(opts: AppOptions): { app: Hono; ctx: Ctx; close(): void };
  ```
  Creates `dataDir` if missing, opens `<dataDir>/board.db`, runs `migrate`, builds a Hono app with `GET /api/health` → `{ "ok": true, "version": <package.json version> }`. When `staticDir` is given and exists, serve it for non-`/api` and non-`/mcp` GETs with SPA fallback to `index.html` (use `serveStatic` from `@hono/node-server/serve-static`). Never binds a port.
- `src/server/config.ts`: `defaultDataDir(env)` = `env.AWB_HOME` or `~/.ai-work-board`; `defaultPort(env)` = `Number(env.AWB_PORT)` or `4747`.
- `src/cli/main.ts`:
  ```ts
  export type CliIo = { env: Record<string, string | undefined>; cwd: string; stdout(s: string): void; stderr(s: string): void };
  export async function main(argv: string[], io: CliIo): Promise<number>; // returns exit code
  ```
  For now supports `start [--port N] [--data-dir DIR] [--open]` and `--help`. Use `node:util` `parseArgs`. `start` calls `createApp({ dataDir, staticDir: <repo>/dist/web })`, serves it with `serve` from `@hono/node-server` on hostname `127.0.0.1` and the port, prints `AI Work Board running at http://127.0.0.1:<port>` and returns 0 while the server keeps the process alive. If the port is in use (EADDRINUSE), print `Port <port> is in use. Use --port or AWB_PORT.` to stderr and return 1. `--open` opens the browser with `open` (macOS) via `node:child_process`. Unknown command → usage text on stderr, return 2.
- `bin/awb.js` (plain JS, executable, `#!/usr/bin/env node`): imports `main` from `../src/cli/main.ts`, calls it with `process.argv.slice(2)` and real io, sets `process.exitCode` (does not call `process.exit`).
- `src/web/index.html`, `src/web/main.tsx`, `src/web/App.tsx`: a placeholder page titled "AI Work Board" that fetches `/api/health` and shows the version.
- `test/helpers.ts`:
  - `fixedClock(start = "2026-01-01T00:00:00.000Z")`: a `Clock` whose `now()` returns start, then +1 second on each call.
  - `makeTestApp()`: creates a fresh temp dir with `fs.mkdtempSync(path.join(os.tmpdir(), "awb-test-"))`, calls `createApp({ dataDir, clock: fixedClock() })`, and returns `{ app, ctx, dataDir, request, close }` where `request(method, path, body?, actor?)` calls `app.request` with JSON and an optional `X-AWB-Actor` header and resolves to `{ status, body }` (parsed JSON). `close()` closes the app and deletes the temp dir.
- `test/skeleton.test.ts`: `GET /api/health` returns `{ ok: true, version }`; a fresh data dir gets `board.db` and `schema_version` contains migration 1; running `createApp` twice on the same dir does not reapply migrations. Also test `main(["start", "--port", "<busy port>"], io)` returns 1 with the "in use" message (occupy the port first with `node:net`).

## Follow these existing patterns
- `.cursor/feature-pipeline/agent-kanban-board/spec.md` — "Implementation Decisions → Architecture" and "Testing Decisions".
- `CONTEXT.md` — use these terms in names (Project, Ticket, Column, Feature, Actor, Activity).
- `docs/adr/0004-single-local-server-is-the-only-writer.md` — why only the server writes.

## Do not
- Touch files outside: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`, `vitest.config.ts`, `vite.config.ts`, `.gitignore`, `bin/`, `src/`, `test/`.
- Add dependencies other than: runtime `hono`, `@hono/node-server`, `better-sqlite3`, `react`, `react-dom`; dev `typescript`, `vitest`, `vite`, `@vitejs/plugin-react`, `@types/node`, `@types/react`, `@types/react-dom`, `@types/better-sqlite3`.
- Use an ORM, a TS compiler emit step, `ts-node`/`tsx`, or `enum`.
- Initialise git or commit.

## Done when
- `pnpm install` succeeds and the SQLite driver loads.
- `node bin/awb.js start --port 4790 --data-dir <tmp>` serves `GET http://127.0.0.1:4790/api/health` with `{"ok":true,...}`.
- `pnpm build` produces `dist/web/index.html`.
- `pnpm test && pnpm typecheck` passes.
