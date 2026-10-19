# Task 08: Server config resolver and hosted-mode detection

## Context
The AI Work Board (repo root `/Users/neazmahmood/Desktop/projects/practice/ai-work-board`) runs in two modes:
- **Local** (default): `awb start` on 127.0.0.1:4747, PGlite under the data dir, no auth, serves the UI.
- **Hosted**: the backend binds to a public interface and/or uses Postgres via `DATABASE_URL`, and must have auth configured.

Storage is already PGlite/Postgres (`createApp`'s `database` option). This task replaces the ad-hoc env helpers with one config resolver, adds a configurable bind host, and makes hosted mode refuse to start without its auth settings. Auth itself is enforced in the next task; here we only resolve and validate config.

## Do
- `src/server/config.ts`: replace `defaultDataDir` / `defaultPort` with `resolveServerConfig(env, flags?: { host?: string; port?: string; dataDir?: string })`. It returns:
  ```ts
  type ServerConfig = {
    mode: "local" | "hosted";
    host: string;          // flags.host ?? AWB_HOST ?? "127.0.0.1"
    port: number;          // flags.port ?? AWB_PORT ?? 4747
    dataDir: string;       // flags.dataDir ?? AWB_HOME ?? ~/.ai-work-board
    databaseUrl?: string;  // DATABASE_URL
    allowedOrigins: string[]; // AWB_ALLOWED_ORIGINS, comma-separated, trimmed, empty → []
    auth?: { ownerPasswordHash: string; sessionSecret: string; apiTokens: string[]; secureCookies: boolean };
  };
  ```
  - Hosted mode applies when `host` is not loopback (`127.0.0.1`, `localhost`, `::1`) or `DATABASE_URL` is set.
  - In hosted mode, `AWB_OWNER_PASSWORD_HASH`, `AWB_SESSION_SECRET` and `AWB_API_TOKENS` (comma-separated, at least one non-empty) are all required. If any is missing, throw a `ConfigError` whose message names every missing variable.
  - `secureCookies` is `false` only when `host` is loopback, otherwise `true`.
  - In local mode `auth` is undefined, even if the variables are set.
  - Invalid port: throw `ConfigError`.
- `src/cli/commands/start.ts`:
  - Use the resolver. Add a `--host` flag (also add it to the help text and arg parsing in `src/cli/main.ts`). Print a `ConfigError` to stderr and exit 2.
  - Bind to `config.host`.
  - Database: `DATABASE_URL` → `{ kind: "postgres", url }`, otherwise PGlite in `<dataDir>/pgdata`.
  - Serve the UI (`staticDir`) only in local mode.
  - The startup line prints the real host and port, and the browser auto-open happens only in local mode.
- Update every other import of `defaultDataDir` / `defaultPort` (search `src/`).
- `test/config.test.ts` (new), pure unit tests on `resolveServerConfig`:
  - local defaults;
  - flags beat env;
  - `AWB_HOST=0.0.0.0` → hosted;
  - `DATABASE_URL` on loopback → hosted;
  - hosted with nothing set → the error lists all three variables;
  - hosted with all set → `auth` filled and `secureCookies` true;
  - origins parsing;
  - a bad port.

## Follow these existing patterns
- `src/server/config.ts` (current): env-in, value-out pure functions.
- `src/cli/commands/start.ts`: existing startup and shutdown flow; keep it.

## Do not
- Touch files outside: `src/server/config.ts`, `src/cli/commands/start.ts`, `src/cli/main.ts`, `test/config.test.ts`, and any file that only needs its import updated
- Implement login, cookies, tokens or CORS (later tasks)
- Add dependencies, reformat unrelated code, or commit

## Done when
- `AWB_HOST=0.0.0.0 node bin/awb.js start` exits 2 naming `AWB_OWNER_PASSWORD_HASH`, `AWB_SESSION_SECRET`, `AWB_API_TOKENS`, and plain `node bin/awb.js start` still starts in local mode.
- `pnpm test` passes
- `pnpm typecheck` passes
- `pnpm test:e2e` passes

## Clarifications (checked against the code)
- Export `class ConfigError extends Error` (set `name = "ConfigError"`) and `resolveServerConfig` from `src/server/config.ts`. Remove `defaultDataDir` / `defaultPort`; their only caller is `start.ts`.
- Treat an env var that is empty or whitespace-only as unset (current `AWB_HOME` behaviour). Trim values.
- Port: the value must be an integer in 1–65535. Anything else (`"abc"`, `"0"`, `"70000"`, `"3.5"`) throws `ConfigError` with message `Invalid port: <raw value>`. This applies to both the flag and `AWB_PORT`. Today a bad `AWB_PORT` silently falls back to 4747; that changes to an error.
- Comma lists (`AWB_ALLOWED_ORIGINS`, `AWB_API_TOKENS`): split on `,`, trim each entry, drop empty ones.
- Missing-vars error message: `Hosted mode requires: AWB_OWNER_PASSWORD_HASH, AWB_SESSION_SECRET, AWB_API_TOKENS` (list only the missing ones, in that order). `AWB_API_TOKENS` counts as missing when it has no non-empty entry.
- Loopback check is an exact match on `127.0.0.1`, `localhost`, `::1`.
- `start.ts`: call `resolveServerConfig(io.env, { host: values.host, port: values.port, dataDir: values["data-dir"] })` inside try/catch. On `ConfigError`, write `<message>\n` to stderr and return 2. Rethrow other errors. Add `host?: string` to `StartOptions`.
- Pass `database` to `createApp` explicitly (`{ kind: "postgres", url }` or `{ kind: "pglite", dir: path.join(dataDir, "pgdata") }`). Pass `staticDir` only when `mode === "local"`.
- Build the startup URL as `http://${host}:${port}`, with IPv6 hosts (any host containing `:`) wrapped in brackets. Use the same URL for the `open` call, which still runs only when `values.open` is set and mode is local.
- `src/cli/main.ts`: add `host: { type: "string" }` next to `port` under "start options". Add `[--host H]` to the `start` line in the top-level USAGE and in the `awb start` help. Add a help line: `--host <H>           Interface to bind (default: 127.0.0.1 or AWB_HOST)`. Then pass `host` through wherever `port` is passed to `startCommand`.
- `test/config.test.ts`: pass a plain env object (never `process.env`). For the dataDir default, assert that it ends with `.ai-work-board`.
- Don't add locks or mutexes, and don't change `src/server/app.ts`.
