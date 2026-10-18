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
