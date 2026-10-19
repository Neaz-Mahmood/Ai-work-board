import type { Context } from "hono";
import { Hono } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Ctx } from "../../domain/context.ts";
import {
  verifyPassword,
  verifySessionCookie,
  setSessionCookie,
  clearSessionCookie,
} from "../auth.ts";
import { createLoginRateLimiter } from "../loginRateLimit.ts";

export type AuthConfig = {
  ownerPasswordHash: string;
  sessionSecret: string;
  apiTokens: string[];
  secureCookies: boolean;
};

function resolveClientKey(c: Context, trustProxy?: boolean): string {
  if (trustProxy) {
    const xff = c.req.header("x-forwarded-for");
    if (xff) {
      const parts = xff
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (parts.length > 0) {
        return parts[parts.length - 1];
      }
    }
  }

  try {
    const conn = getConnInfo(c);
    if (conn?.remote?.address) {
      return conn.remote.address;
    }
  } catch {
    // In-process app.request has no node socket; ignore error
  }

  return "unknown";
}

export function createAuthRoute(
  ctx: Ctx,
  auth?: AuthConfig,
  opts?: { trustProxy?: boolean }
): Hono {
  const router = new Hono();
  const limiter = createLoginRateLimiter({ clock: ctx.clock });

  router.get("/session", async (c) => {
    if (!auth) {
      return c.json({ authEnabled: false, signedIn: true });
    }
    const signedIn = await verifySessionCookie(c, auth.sessionSecret, ctx.clock);
    return c.json({ authEnabled: true, signedIn });
  });

  router.post("/login", async (c) => {
    if (!auth) {
      return c.json({ signedIn: true }, 200);
    }

    let password: string | null = null;
    try {
      const body = await c.req.json();
      if (body && typeof body === "object" && typeof body.password === "string") {
        password = body.password;
      }
    } catch {
      password = null;
    }

    // No await may sit between check and recordFailure to prevent parallel
    // requests from racing past check before failures are recorded.
    const key = resolveClientKey(c, opts?.trustProxy);
    const checkResult = limiter.check(key);
    if (!checkResult.allowed) {
      const secondsLeft = checkResult.retryAfterSeconds;
      const n = Math.max(1, Math.ceil(secondsLeft / 60));
      return c.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: `Too many failed sign-in attempts. Try again in ${n} minutes.`,
          },
        },
        429,
        { "Retry-After": String(secondsLeft) }
      );
    }

    if (password === null || !verifyPassword(password, auth.ownerPasswordHash)) {
      limiter.recordFailure(key);
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Wrong password" } },
        401
      );
    }

    limiter.recordSuccess(key);
    await setSessionCookie(c, auth.sessionSecret, auth.secureCookies, ctx.clock);
    return c.json({ signedIn: true }, 200);
  });

  router.post("/logout", async (c) => {
    if (auth) {
      clearSessionCookie(c);
    }
    return c.json({ signedIn: false }, 200);
  });

  return router;
}
