# Task 20 fix 1: parallel requests bypass the login limit

## Context
Task 20 (see `task-20.md`) added `createLoginRateLimiter` and wired it into `POST /api/auth/login` in `apps/server/src/server/routes/auth.ts`. The limiter itself is correct, but the route has a race.

## The bug (confirmed by Claude)
In the login handler, `limiter.check(key)` runs **before** `await c.req.json()`, and `limiter.recordFailure(key)` only runs **after** that await. Parallel requests from one client all pass `check` before any failure is recorded. Claude fired 20 wrong-password logins with `Promise.all` against an in-process app: all 20 returned 401 (20 password checks) and none returned 429. Expected: at most 5 × 401 and the rest 429.

## Fix
Do every async step **before** the limiter, so that check → verify → record runs in one synchronous stretch with no `await` in between (`verifyPassword` uses `scryptSync` and is synchronous):
1. Parse the body first (`await c.req.json()` in try/catch). On a parse error, or a missing or non-string `password`, treat it as `password = null`. Don't return yet.
2. Then, with no `await` until the outcome is recorded:
   - `key` → `limiter.check(key)` → 429 if blocked;
   - if `password === null || !verifyPassword(...)` → `recordFailure` + 401;
   - else → `recordSuccess`.
3. Only then `await setSessionCookie(...)` and return 200.

Add a short comment explaining why no `await` may sit between `check` and `recordFailure`.

Also remove the duplicate `Retry-After`: keep it only in the `c.json(..., 429, { "Retry-After": ... })` headers argument and delete the separate `c.header("Retry-After", ...)` line.

## Test
In `apps/server/test/login-rate-limit.test.ts`, add: "parallel wrong logins can't exceed the limit". Fire 20 wrong-password `POST /api/auth/login` requests at once with `Promise.all` on an in-process app with `auth`. Assert exactly 5 responses are 401 and 15 are 429.

## Do not
- Touch files other than `apps/server/src/server/routes/auth.ts` and `apps/server/test/login-rate-limit.test.ts`
- Change `loginRateLimit.ts`, the design, or the error shapes
- Add locks, mutexes, timers or dependencies, or commit
- Read any file outside this repository

## Done when
- The new test passes, and `pnpm typecheck`, `pnpm test` and `pnpm test:e2e` pass
