# Task 09: Owner auth and API tokens across API, SSE, MCP and CLI

## Context
The AI Work Board (repo root `/Users/neazmahmood/Desktop/projects/practice/ai-work-board`) has a config resolver (`src/server/config.ts`, `resolveServerConfig`) that yields `auth: { ownerPasswordHash, sessionSecret, apiTokens, secureCookies }` in hosted mode and `undefined` in local mode. The hosted board has one human owner and no accounts:
- The browser logs in with the owner password and gets a signed session cookie. A browser session always acts as Actor `you`.
- The CLI and MCP agents send `Authorization: Bearer <token>`. The token only proves the caller is allowed in: agents still name themselves (`X-AWB-Actor`, MCP `actor` parameter or URL `actor`) and may never be `you`.

Local mode stays open, exactly as today.

## Do
- `src/server/auth.ts` (new):
  - `hashPassword(pw)` returns `scrypt$<saltHex>$<hashHex>` (Node `crypto.scryptSync`, N=16384, r=8, p=1, 64-byte key, 16-byte random salt). `verifyPassword(pw, stored)` compares with `crypto.timingSafeEqual`.
  - `tokenMatches(given, tokens)` is a constant-time comparison against each configured token.
  - Session cookie helpers on `hono/cookie`'s `setSignedCookie` / `getSignedCookie`. Cookie name `awb_session`, value = issued-at ms, `httpOnly`, `sameSite: "Lax"`, `secure: auth.secureCookies`, `path: "/"`, `maxAge` 30 days. Reject values older than 30 days.
- `src/server/routes/auth.ts` (new), mounted at `/api/auth`:
  - `POST /login` `{ password }` → 200 `{ signedIn: true }` and sets the cookie, or 401 `{ error: { code: "UNAUTHORIZED", message: "Wrong password" } }`.
  - `POST /logout` clears the cookie → 200.
  - `GET /session` → `{ authEnabled: boolean, signedIn: boolean }`. Local mode returns `{ authEnabled: false, signedIn: true }`.
- `src/server/app.ts`: `AppOptions` gains `auth?: { ownerPasswordHash: string; sessionSecret: string; apiTokens: string[]; secureCookies: boolean }`. When it is set, add a middleware before the `/api/*` and `/mcp` routes:
  - `/api/health` and `/api/auth/*` stay public.
  - A valid session cookie lets the request through and marks it as the owner.
  - Otherwise a valid `Bearer` token lets it through and marks it as an agent.
  - Otherwise 401 `UNAUTHORIZED`. This covers `/api/events` (SSE) and `/mcp` too.
  - Owner requests always act as Actor `you`, whatever `X-AWB-Actor` says. Agent REST requests use `X-AWB-Actor` as today but are rejected with a validation error if it is `you` (reuse `assertAgentActor` from `src/domain/actors.ts`).
  - MCP keeps its existing `assertAgentActor` rules.
  - Pass the request's resolved actor to routes via the Hono context (`c.set`/`c.get`) so `restActor(...)` call sites in `src/server/routes/tickets.ts` and `src/server/routes/features.ts` use it.
- `src/cli/commands/start.ts`: pass `config.auth` into `createApp`.
- `src/cli/client.ts`:
  - Send `Authorization: Bearer ${io.env.AWB_TOKEN}` when `AWB_TOKEN` is set.
  - Map a 401 to a distinct error: "Authentication failed: set AWB_TOKEN to an API token configured on the server (AWB_API_TOKENS)." It must stay distinct from the existing unreachable-server error.
- `src/cli/main.ts`:
  - Add `awb hash-password <password>` (or the password on stdin when the argument is omitted), which prints `hashPassword(...)`.
  - Mention `AWB_TOKEN` in the help text.
- `test/helpers.ts`: `makeTestApp({ auth })` already passes options through. Add a small helper to call `request` with extra headers (`Authorization`, `Cookie`).
- `test/auth.test.ts` (new), in-process:
  - right and wrong password;
  - the session endpoint, signed in and out;
  - a cookie request acts as `you` (check the Activity actor);
  - Bearer REST works and the Activity actor is the header name;
  - Bearer with `X-AWB-Actor: you` is rejected;
  - 401 on `/api/projects`, `/api/events` and `/mcp` without credentials, and with a bad token or a tampered cookie;
  - `/api/health` is public;
  - logout clears the cookie;
  - an app without `auth` behaves as today.
- `test/cli-auth.test.ts` (new): against `startTestServer` with auth, the CLI works with `AWB_TOKEN`, fails with the distinct message without it, and `awb hash-password x` output verifies with `verifyPassword`.

## Follow these existing patterns
- `test/mcp-helpers.ts`: MCP client over in-process `app.fetch`. Pass the `Authorization` header via the transport's `requestInit` or a custom fetch.
- `src/server/errors.ts` and the `app.onError` mapping in `src/server/app.ts`: the error JSON shape `{ error: { code, message } }`.
- `src/domain/actors.ts`: `restActor`, `assertAgentActor`.

## Do not
- Touch files outside: `src/server/`, `src/cli/`, `src/domain/actors.ts` (only if a helper is needed), `test/`
- Add UI changes (a later task) or CORS (a later task)
- Add dependencies, reformat unrelated code, or commit

## Done when
- With `auth` configured, nothing but health and `/api/auth/*` is reachable without a valid cookie or token. Without it, behaviour is unchanged.
- `pnpm test` passes
- `pnpm typecheck` passes
- `pnpm test:e2e` passes

## Clarifications (checked against the code)
- **Which callers to update:** `restActor(c.req.header("X-AWB-Actor"))` is also called in `src/server/routes/projects.ts`. Update every call site in `projects.ts`, `tickets.ts` and `features.ts`.
- **Request actor helper:** add `src/server/requestActor.ts` exporting `requestActor(c: Context): string`:
  - owner request → `"you"`;
  - agent request (Bearer) → `const a = restActor(c.req.header("X-AWB-Actor")); assertAgentActor(a); return a;`;
  - no auth configured (local mode) → `restActor(c.req.header("X-AWB-Actor"))`, exactly as today. The local UI still sends `you`, and that must keep working.
- **Context typing:** use Hono's module augmentation in `requestActor.ts`: `declare module "hono" { interface ContextVariableMap { principal: "owner" | "agent" } }`. The middleware does `c.set("principal", ...)`, and `requestActor` reads `c.get("principal")`, which is undefined in local mode. Routes keep their plain `new Hono()`.
- **401 responses:** the middleware and `/login` return `c.json({ error: { code: "UNAUTHORIZED", message } }, 401)` directly. Use `"Authentication required"` for the middleware and `"Wrong password"` for login. Don't change `DomainError` / `errors.ts`.
- **Middleware placement:** register it with `app.use(...)` after `app.onError` and before `/api/health` and every route, applied to `/api/*` and `/mcp`. Skip it when `opts.auth` is undefined. Inside it, let `/api/health` and anything under `/api/auth/` pass through. Check the cookie first, then `Authorization: Bearer <t>` (case-insensitive scheme, trimmed token).
- **Mounting `/api/auth`:** always mount it. `createAuthRoute(ctx, opts.auth)`:
  - `GET /session`: local mode → `{ authEnabled: false, signedIn: true }`; hosted → `{ authEnabled: true, signedIn: <valid cookie> }`.
  - `POST /login` in local mode → 200 `{ signedIn: true }`, no cookie.
  - `POST /logout` → 200 `{ signedIn: false }` (in local mode too); in hosted mode it clears the cookie with `deleteCookie(c, "awb_session", { path: "/" })`.
  - A missing or non-string `password` → 401 "Wrong password". Don't throw.
- **Cookie timing:** issued-at and expiry use `ctx.clock.now()`, not `Date.now()`, so tests control time. The value is the decimal string of the ms. Reject it if it isn't a finite integer, if it's more than 30 days old, or if signature verification returns `false`/`undefined`. `maxAge` is `60 * 60 * 24 * 30` seconds.
- **Constant-time compares:** `tokenMatches` must not short-circuit on length. Compare SHA-256 digests of `given` and each token with `timingSafeEqual` and check every token. `verifyPassword` returns `false` (doesn't throw) for a malformed stored hash.
- **Test helpers:** give `startTestServer` an optional `opts?: Partial<AppOptions>` and pass it to `makeTestApp`. Add `requestWithHeaders(method, path, { body?, headers? })` returning `{ status, body, headers: Headers }` to `TestApp` (the cookie test needs `Set-Cookie`). Leave the existing `request` signature unchanged.
- **MCP tests:** give `connectMcp` an optional third parameter `headers?: Record<string, string>`, merged into the custom fetch's init headers. For "401 without credentials" on `/mcp`, a raw `app.request("/mcp", { method: "POST", ... })` returning 401 is enough.
- **CLI:**
  - Add `export class AuthFailed extends Error` in `client.ts`, with the exact message from the Do section. `apiRequest` throws it when `res.status === 401`, before the generic error mapping.
  - `main.ts` catches it next to `ServerUnreachable`, prints the message to stderr, and returns exit code **4**. Add `4                    Authentication failed` under "Exit Codes".
  - Add `AWB_TOKEN` to Global Options help as: `Auth: set AWB_TOKEN to send "Authorization: Bearer <token>" to a hosted server`.
- **`hash-password`:**
  - Runs without contacting a server and prints the hash plus `\n` to stdout.
  - With no positional argument, read all of `process.stdin` and strip one trailing newline. An empty password → usage error, exit 2.
  - Add it to USAGE and to `getHelpText`.
  - Tests use only the argument form.
- **Server smoke run:** `src/cli/commands/start.ts` passes `auth: config.auth` and nothing else changes.
- Don't add locks or mutexes. Don't touch `src/web/`, and don't add CORS.
