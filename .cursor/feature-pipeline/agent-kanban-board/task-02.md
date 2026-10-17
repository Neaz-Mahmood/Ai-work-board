# Task 02: Projects through REST and CLI

## Context
The AI Work Board (local Jira-style kanban for AI agents) has a skeleton from task 01: `createApp` in `src/server/app.ts`, the `Db` wrapper in `src/server/db.ts`, migrations in `src/server/migrations.ts`, `DomainError` in `src/server/errors.ts`, the CLI entry `main` in `src/cli/main.ts`, and test helpers in `test/helpers.ts`. This task adds Projects end to end through REST and the CLI, and builds the CLI client framework every later CLI command uses. A Project is one local repository with an absolute path and a unique Project Key; Tickets will later be keyed `<KEY>-<n>`.

## Do
- Migration 2 (`projects`) appended in `src/server/migrations.ts`:
  `projects(id INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, path TEXT NOT NULL UNIQUE, next_ticket_number INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`. Timestamps are ISO strings from `ctx.clock.now().toISOString()`.
- `src/shared/types.ts` (types only; shared by server, CLI and web — no runtime imports): `export type Project = { key: string; name: string; path: string; createdAt: string; updatedAt: string }`; `export type ApiError = { error: { code: string; message: string } }`.
- `src/domain/projects.ts` (functions take `ctx: Ctx` first):
  - `normalizeProjectPath(p)`: must be absolute (else VALIDATION "Path must be absolute"), must exist and be a directory (else VALIDATION), then `fs.realpathSync`, strip trailing separator.
  - `deriveKey(folderName, existingKeys: Set<string>)`: split on `-`, `_`, space, `.` and camelCase boundaries; drop parts with no letters; take the first letter of each part, uppercased; if that gives fewer than 2 letters, use the first 3 letters of the name's letters (uppercased); if still fewer than 2 letters, use `PRJ`; cap at 5 letters. If taken, try base+`2`, base+`3`, …, trimming letters from the end of base so the whole key stays ≤ 5 characters. Examples to test: `ai-work-board`→`AWB`, `myCoolApp`→`MCA`, `backend`→`BAC`, `a-b-c-d-e-f-g`→`ABCDE`, `AWB` taken → `AWB2`, `ABCDE` taken → `ABCD2`.
  - `createProject(ctx, { path, name?, key? })`: normalise path; duplicate path → CONFLICT "Path already registered as <KEY>"; `name` defaults to the folder basename; a given `key` is uppercased and must match `^[A-Z]{2,5}$` (else VALIDATION) and must not be taken (else CONFLICT — never silently rewritten); otherwise derive.
  - `listProjects`, `getProject(key)` (NOT_FOUND), `renameProject(key, name)` (trimmed, 1–100 chars), `deleteProject(key)`.
  - `resolveProject(ctx, { key?, cwd? })`: explicit key wins (NOT_FOUND if unknown). Otherwise realpath `cwd` when it exists and pick the registered Project whose path equals it or is an ancestor of it (`cwd.startsWith(path + sep)`), choosing the deepest (longest path). No match → `DomainError` code `NO_PROJECT`, status 404, message `No project registered for <cwd>. Run \`awb init\` in the repository root.` Neither key nor cwd → VALIDATION.
- `src/server/routes/projects.ts`, mounted in `createApp`:
  - `GET /api/projects` → `Project[]` ordered by name
  - `POST /api/projects` `{ path, name?, key? }` → `Project`, 201
  - `GET /api/projects/resolve?cwd=` → `Project` (register before `/:key`)
  - `GET /api/projects/:key` → `Project`
  - `PATCH /api/projects/:key` `{ name }` → `Project`
  - `DELETE /api/projects/:key` → 204 (UI-only; the CLI and MCP never expose it)
  - Invalid JSON or wrong field types → VALIDATION.
- CLI framework in `src/cli/`:
  - `src/cli/client.ts`: `apiRequest(io, opts, method, path, body?)` using `fetch` against `--url` or `io.env.AWB_URL` or `http://127.0.0.1:4747`. Sends header `X-AWB-Actor` from `--as` or `io.env.AWB_ACTOR` when set. Connection failure → throws a `ServerUnreachable` error. Non-2xx → throws `CliDomainError(code, message)` from the `{ error }` body.
  - `src/cli/project.ts`: `resolveProjectKey(io, opts)` → `--project` flag, else `GET /api/projects/resolve?cwd=<io.cwd>`.
  - `src/cli/main.ts`: global flags `--as <actor>`, `--project <KEY>`, `--json`, `--url <url>`, parsed for every command. `--as you` is refused with exit 2 and "The actor name 'you' is reserved for the board UI." Exit codes: 0 success; 1 domain error (print `error: <message>` to stderr); 2 usage error; 3 server unreachable (print `AI Work Board server is not running at <url>. Run \`awb start\`.`).
  - Commands: `awb init [--key KEY] [--name NAME] [--path DIR]` registers `--path` (resolved against `io.cwd`) or `io.cwd`, printing `Registered <KEY> (<name>) at <path>`; `awb projects` prints one line per Project `KEY  name  path`. With `--json` both print the JSON response.
  - Keep each command in its own module under `src/cli/commands/` (`init.ts`, `projects.ts`); `start` moves to `src/cli/commands/start.ts`.
- `test/helpers.ts`: add `startTestServer()` → serves a `makeTestApp()` app with `@hono/node-server` on `127.0.0.1` port 0 and returns `{ url, request, close, dataDir }`; and `runCli(argv, { url, cwd, env? })` → calls `main` with captured output and returns `{ code, stdout, stderr }` (always passes `--url`).
- Tests `test/projects.test.ts` (REST through `makeTestApp`): create/list/get/rename/delete; key derivation examples above; derived key collision; chosen-key collision 409; invalid key 400; relative path and missing dir 400; duplicate path 409 (including via a symlink or trailing slash); resolve: exact path, subdirectory, deepest of nested Projects, explicit key wins, no match → 404 `NO_PROJECT` with the `awb init` message.
- Tests `test/cli-projects.test.ts` (through `startTestServer` + `runCli`): `awb init` in a temp dir then `awb projects` lists it; `--json` output parses; `--as you` → exit 2; closed port (`--url http://127.0.0.1:1`) → exit 3 with the "Run `awb start`" message; duplicate init → exit 1 with the error message.

## Follow these existing patterns
- `src/server/app.ts`, `src/server/db.ts`, `src/server/errors.ts`, `test/helpers.ts` from task 01 — use `Db` methods only, `db.tx` for multi-statement writes, `DomainError` helpers for failures, `.ts` import extensions, no `enum`.
- `.cursor/feature-pipeline/agent-kanban-board/spec.md` — "Data model → Project / Key derivation", "Project resolution", "REST API", "CLI".
- `CONTEXT.md` — Project, Project Key.

## Do not
- Touch files outside: `src/`, `test/`, `bin/awb.js` (only if needed for the new command layout).
- Add dependencies, reformat unrelated code, or commit.
- Add a delete command to the CLI.

## Done when
- All REST routes above behave as described, with errors in the `{ "error": { "code", "message" } }` shape.
- `awb init` and `awb projects` work against a running server; exit codes 0/1/2/3 behave as specified.
- `pnpm test && pnpm typecheck` passes.
