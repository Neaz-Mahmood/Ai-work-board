# Task 20: Rate-limit failed owner logins

## Context
The AI Work Board (repo root `/Users/neazmahmood/Desktop/projects/practice/ai-work-board`; backend in `apps/server`) has a hosted mode with one owner password. `POST /api/auth/login` (`apps/server/src/server/routes/auth.ts`) checks it with scrypt (`verifyPassword` in `apps/server/src/server/auth.ts`). Nothing limits repeated attempts, so the password can be brute-forced. The README's Hosting → Security note currently says "There is no built-in login rate limiting yet".

The server runs as **one instance** (README says so), so an in-memory limiter is enough. Local mode has no auth and is unaffected.

## Design (decided; don't change)
- **Key:** the client IP.
  - By default, the socket address from `getConnInfo(c).remote.address` (`import { getConnInfo } from "@hono/node-server/conninfo"`).
  - When `trustProxy` is on, use the **last** entry of `X-Forwarded-For`: the address added by the nearest proxy, which the client can't forge. Fall back to the socket address when the header is missing.
  - If no address can be found, use the key `"unknown"`.
- **Limit:** at most **5 failed attempts per key per 15-minute window**.
  - The window starts at the first failure.
  - Once a key has 5 failures inside its window, further login requests from that key get **429** until the window ends, and the password is **not checked** (no scrypt work).
  - A **successful** login deletes that key's record.
- **429 response:** `{ error: { code: "RATE_LIMITED", message: "Too many failed sign-in attempts. Try again in N minutes." } }` with a `Retry-After: <seconds>` header. `N` = `ceil(secondsLeft / 60)`, minimum 1.
- **Time** comes from the app's `ctx.clock`, never `Date.now()`, so tests control it.
- **Memory bound:** on every login request, first delete records whose window has ended. If the map still holds more than 10,000 keys, delete the oldest-window entries until it's at 10,000.
- **No global (all-IP) limit.** It would let anyone lock the owner out. Per-IP limiting plus a long random password is the intended protection.
- **Bearer tokens aren't rate-limited** in this task; the README tells people to make them long and random.

## Do
- `apps/server/src/server/loginRateLimit.ts` (new):
  - `createLoginRateLimiter({ clock, maxFailures = 5, windowMs = 15 * 60_000, maxKeys = 10_000 })` returns `{ check(key): { allowed: true } | { allowed: false; retryAfterSeconds: number }, recordFailure(key), recordSuccess(key) }`.
  - Pure in-memory `Map`. No timers, locks or mutexes.
- `apps/server/src/server/config.ts`:
  - `ServerConfig` gains `trustProxy: boolean`, from `AWB_TRUST_PROXY`.
  - `"1"`, `"true"`, `"yes"` (case-insensitive, trimmed) → `true`; unset or empty → `false`; any other value → `ConfigError("Invalid AWB_TRUST_PROXY: <value>")`.
  - It applies in both modes (harmless locally).
- `apps/server/src/server/app.ts`: `AppOptions` gains `trustProxy?: boolean`, passed to `createAuthRoute`.
- `apps/server/src/cli/commands/start.ts`: pass `trustProxy: config.trustProxy`.
- `apps/server/src/server/routes/auth.ts`: `createAuthRoute(ctx, auth, opts?: { trustProxy?: boolean })`.
  - Create one limiter per app.
  - In hosted mode, `POST /login`:
    1. resolves the key;
    2. `check` → 429 if blocked;
    3. on a wrong, missing or malformed password → `recordFailure` + the existing 401;
    4. on success → `recordSuccess` + the existing cookie/200.
  - `/session` and `/logout` are not limited.
- `apps/server/test/login-rate-limit.test.ts` (new):
  - **Unit tests of the limiter**, with a controllable clock: `{ now: () => new Date(t) }` where the test sets `t`.
    - 5 failures → blocked;
    - `retryAfterSeconds` is correct;
    - the window expiring unblocks;
    - success resets;
    - pruning keeps the size ≤ `maxKeys`.
  - **In-process app tests** (`makeTestApp({ auth, clock })`):
    - 5 wrong passwords → the 6th attempt with the **correct** password still gets 429 and a `Retry-After` header, and no cookie;
    - after advancing the clock 15 minutes, the correct password works;
    - a correct login after 4 failures resets the count, so 5 more failures are needed to block;
    - with `trustProxy: true`, different last `X-Forwarded-For` values are limited separately;
    - with `trustProxy` off, `X-Forwarded-For` is ignored.

    `app.request` has no socket, so in-process the key is `"unknown"` unless `trustProxy` is set. Rely on that.
- `apps/server/test/config.test.ts`: add cases for `AWB_TRUST_PROXY` (unset → false, `"true"` → true, `"maybe"` → `ConfigError`).
- `README.md`, Hosting section:
  - Add `AWB_TRUST_PROXY` to the env var list: "Set to `true` when a reverse proxy sets `X-Forwarded-For`; login rate limiting then uses the client address it reports."
  - Replace the Security bullet about missing rate limiting with: failed sign-ins are limited to 5 per client IP per 15 minutes; set `AWB_TRUST_PROXY=true` behind a proxy, or all clients share the proxy's address; still use a long random owner password and long random API tokens.

## Follow these existing patterns
- `apps/server/src/server/config.ts` `resolveServerConfig`: env parsing, `clean()`, `ConfigError`.
- `apps/server/src/server/routes/auth.ts`: the error JSON shape and the 401 path.
- `apps/server/test/auth.test.ts`: in-process auth app setup (`hashPassword`, `requestWithHeaders`).

## Do not
- Touch files outside: `apps/server/src/server/`, `apps/server/src/cli/commands/start.ts`, `apps/server/test/`, `README.md`
- Rate-limit Bearer tokens, add a global limit, add dependencies, add timers/locks/mutexes, change the web app, or commit
- Read any file outside this repository

## Done when
- In hosted mode, the 6th login attempt from one client within 15 minutes gets 429 with `Retry-After`, even with the right password. A success resets the count. Local mode is unchanged.
- `pnpm typecheck` passes
- `pnpm test` passes
- `pnpm test:e2e` passes (the hosted login e2e uses one wrong password, then the right one, so it stays under the limit)
