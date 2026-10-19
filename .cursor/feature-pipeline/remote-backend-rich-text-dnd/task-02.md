# Task 02: Projects identified by a client-normalized path (ADR 0007)

## Context
The AI Work Board (repo root `/Users/neazmahmood/Desktop/projects/practice/ai-work-board`) will be hostable on a remote server, which can't see the repositories on the user's laptop. Today the server checks that a Project path exists, and resolves it and the agent's cwd with `fs.realpathSync`. From now on the server must never touch the filesystem for Projects. Clients (the `awb` CLI, and MCP agents) send absolute, symlink-resolved paths, and the server only stores strings and matches a cwd by deepest prefix. This task lands that change before the storage rewrite.

## Do
- `src/domain/projects.ts`:
  - Make `normalizeProjectPath` pure, with no `fs` use. It requires an absolute path (`path.isAbsolute`, otherwise a `validation` error "Project path must be absolute"), applies `path.normalize`, and strips trailing slashes except for `/`.
  - Remove the existence, directory and `realpathSync` checks from `createProject` and `resolveProject`. `resolveProject` normalizes the given `cwd` with the same pure function and picks the deepest registered Project path that equals or contains it (`p === cwd` or `cwd.startsWith(p + "/")`).
  - Duplicate normalized paths are still rejected, exactly as today.
- `src/cli/commands/init.ts`: before calling the API, resolve the path argument (default `io.cwd`) with `fs.realpathSync`. If it doesn't exist or isn't a directory, print a clear error to stderr and exit 2. Send the resolved path.
- `src/cli/project.ts` (`resolveProjectKey`): send `fs.realpathSync(io.cwd)` when that path exists, otherwise `io.cwd` unchanged. Do the same in any other CLI code that sends `cwd` to the server (search `src/cli` for `cwd`).
- `src/mcp/tools/projects.ts`, `src/mcp/tools/tickets.ts`, `src/mcp/tools/features.ts`: wherever a tool's input schema describes `cwd` or `path`, state that it must be the absolute, symlink-resolved path of the repository on the agent's machine.
- Tests:
  - `test/projects.test.ts`: the server accepts a path that doesn't exist on disk; trailing slashes are normalized; duplicate normalized paths are rejected; a relative path is rejected; cwd lookup picks the deepest Project containing it.
  - `test/mcp-projects.test.ts`: the same through MCP where relevant.
  - `test/cli-projects.test.ts`: `awb init` in a directory reached through a symlink registers the real path; `awb init` on a missing directory exits 2 with an error.
  - Remove or adjust any existing test that expected the server to reject a non-existent path.

## Follow these existing patterns
- `test/cli-projects.test.ts`: CLI tests use `main(argv, io)` against `startTestServer()` from `test/helpers.ts`.
- `src/server/errors.ts`: `validation(...)` and `conflict(...)` for domain errors.
- The existing error `NO_PROJECT` ("No project registered for <cwd>. Run `awb init` in the repository root.") must stay unchanged.

## Do not
- Touch files outside: `src/domain/projects.ts`, `src/cli/`, `src/mcp/tools/`, `src/web/components/AddProjectDialog.tsx` (only if its copy claims the server checks the path), `test/`
- Change the storage layer (`src/server/db.ts`, `src/server/migrations.ts`)
- Add dependencies, reformat unrelated code, or commit

## Done when
- No `fs` import or call remains in `src/domain/projects.ts`.
- The server accepts a Project whose path doesn't exist on the server, and the CLI sends symlink-resolved paths.
- `pnpm test` passes
- `pnpm typecheck` passes
- `pnpm test:e2e` passes
