import { Hono } from "hono";
import type { Ctx } from "../../domain/context.ts";
import {
  verifyPassword,
  verifySessionCookie,
  setSessionCookie,
  clearSessionCookie,
} from "../auth.ts";

export type AuthConfig = {
  ownerPasswordHash: string;
  sessionSecret: string;
  apiTokens: string[];
  secureCookies: boolean;
};

export function createAuthRoute(ctx: Ctx, auth?: AuthConfig): Hono {
  const router = new Hono();

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

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Wrong password" } },
        401
      );
    }

    if (!body || typeof body !== "object" || typeof body.password !== "string") {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Wrong password" } },
        401
      );
    }

    if (!verifyPassword(body.password, auth.ownerPasswordHash)) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Wrong password" } },
        401
      );
    }

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
