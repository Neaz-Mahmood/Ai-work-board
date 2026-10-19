import { describe, expect, test } from "vitest";
import { makeTestApp } from "./helpers.ts";
import { hashPassword } from "../src/server/auth.ts";
import { createLoginRateLimiter } from "../src/server/loginRateLimit.ts";

describe("LoginRateLimiter (Unit)", () => {
  test("5 failures -> blocked and retryAfterSeconds is correct", () => {
    let t = 1_000_000;
    const clock = { now: () => new Date(t) };
    const limiter = createLoginRateLimiter({
      clock,
      maxFailures: 5,
      windowMs: 15 * 60_000,
    });

    expect(limiter.check("127.0.0.1")).toEqual({ allowed: true });

    for (let i = 0; i < 4; i++) {
      limiter.recordFailure("127.0.0.1");
      expect(limiter.check("127.0.0.1")).toEqual({ allowed: true });
    }

    // Advance 100 seconds
    t += 100_000;

    // 5th failure
    limiter.recordFailure("127.0.0.1");

    const res = limiter.check("127.0.0.1");
    expect(res.allowed).toBe(false);
    if (!res.allowed) {
      // 900s window - 100s elapsed = 800s left
      expect(res.retryAfterSeconds).toBe(800);
    }
  });

  test("the window expiring unblocks", () => {
    let t = 1_000_000;
    const clock = { now: () => new Date(t) };
    const limiter = createLoginRateLimiter({
      clock,
      maxFailures: 5,
      windowMs: 15 * 60_000,
    });

    for (let i = 0; i < 5; i++) {
      limiter.recordFailure("127.0.0.1");
    }
    expect(limiter.check("127.0.0.1").allowed).toBe(false);

    // Advance 15 minutes (window expires)
    t += 15 * 60_000;

    expect(limiter.check("127.0.0.1")).toEqual({ allowed: true });
  });

  test("success resets the failure count", () => {
    let t = 1_000_000;
    const clock = { now: () => new Date(t) };
    const limiter = createLoginRateLimiter({
      clock,
      maxFailures: 5,
      windowMs: 15 * 60_000,
    });

    for (let i = 0; i < 4; i++) {
      limiter.recordFailure("127.0.0.1");
    }
    expect(limiter.check("127.0.0.1")).toEqual({ allowed: true });

    limiter.recordSuccess("127.0.0.1");

    for (let i = 0; i < 4; i++) {
      limiter.recordFailure("127.0.0.1");
      expect(limiter.check("127.0.0.1")).toEqual({ allowed: true });
    }

    limiter.recordFailure("127.0.0.1");
    expect(limiter.check("127.0.0.1").allowed).toBe(false);
  });

  test("pruning keeps the size <= maxKeys", () => {
    let t = 1_000_000;
    const clock = { now: () => new Date(t) };
    const limiter = createLoginRateLimiter({
      clock,
      maxFailures: 1,
      windowMs: 15 * 60_000,
      maxKeys: 3,
    });

    // Add 3 keys
    limiter.recordFailure("k1");
    t += 1000;
    limiter.recordFailure("k2");
    t += 1000;
    limiter.recordFailure("k3");

    expect(limiter.check("k1").allowed).toBe(false);
    expect(limiter.check("k2").allowed).toBe(false);
    expect(limiter.check("k3").allowed).toBe(false);

    t += 1000;
    // 4th key added -> oldest (k1) should be pruned
    limiter.recordFailure("k4");

    expect(limiter.check("k1")).toEqual({ allowed: true });
    expect(limiter.check("k2").allowed).toBe(false);
    expect(limiter.check("k3").allowed).toBe(false);
    expect(limiter.check("k4").allowed).toBe(false);
  });
});

describe("LoginRateLimiter (In-process app)", () => {
  const password = "correct-horse-battery-staple";
  const ownerPasswordHash = hashPassword(password);
  const sessionSecret = "super-secure-session-secret-at-least-32-chars";
  const apiTokens = ["token-alpha-123"];

  test("5 wrong passwords -> 6th attempt with correct password gets 429 and Retry-After header, and no cookie; after 15m correct password works", async () => {
    let t = 1_700_000_000_000;
    const clock = { now: () => new Date(t) };

    const testApp = await makeTestApp({
      clock,
      auth: {
        ownerPasswordHash,
        sessionSecret,
        apiTokens,
        secureCookies: false,
      },
    });

    try {
      // 5 wrong passwords
      for (let i = 0; i < 5; i++) {
        const res = await testApp.requestWithHeaders("POST", "/api/auth/login", {
          body: { password: "wrong-password" },
        });
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe("UNAUTHORIZED");
      }

      // 6th attempt with correct password gets 429
      const blockedRes = await testApp.requestWithHeaders("POST", "/api/auth/login", {
        body: { password },
      });
      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body).toEqual({
        error: {
          code: "RATE_LIMITED",
          message: "Too many failed sign-in attempts. Try again in 15 minutes.",
        },
      });
      const retryAfter = blockedRes.headers.get("retry-after");
      expect(retryAfter).toBeTruthy();
      expect(Number(retryAfter)).toBeGreaterThan(0);
      expect(blockedRes.headers.get("set-cookie")).toBeNull();

      // Advance clock 15 minutes
      t += 15 * 60_000;

      // Correct password works
      const successRes = await testApp.requestWithHeaders("POST", "/api/auth/login", {
        body: { password },
      });
      expect(successRes.status).toBe(200);
      expect(successRes.body).toEqual({ signedIn: true });
      expect(successRes.headers.get("set-cookie")).toContain("awb_session=");
    } finally {
      await testApp.close();
    }
  });

  test("a correct login after 4 failures resets the count, so 5 more failures are needed to block", async () => {
    let t = 1_700_000_000_000;
    const clock = { now: () => new Date(t) };

    const testApp = await makeTestApp({
      clock,
      auth: {
        ownerPasswordHash,
        sessionSecret,
        apiTokens,
        secureCookies: false,
      },
    });

    try {
      // 4 wrong attempts
      for (let i = 0; i < 4; i++) {
        const res = await testApp.requestWithHeaders("POST", "/api/auth/login", {
          body: { password: "wrong" },
        });
        expect(res.status).toBe(401);
      }

      // 5th attempt: correct password succeeds and resets
      const okRes = await testApp.requestWithHeaders("POST", "/api/auth/login", {
        body: { password },
      });
      expect(okRes.status).toBe(200);

      // 4 more wrong attempts do not block
      for (let i = 0; i < 4; i++) {
        const res = await testApp.requestWithHeaders("POST", "/api/auth/login", {
          body: { password: "wrong" },
        });
        expect(res.status).toBe(401);
      }

      // 5th wrong attempt
      const fifthRes = await testApp.requestWithHeaders("POST", "/api/auth/login", {
        body: { password: "wrong" },
      });
      expect(fifthRes.status).toBe(401);

      // 6th attempt is blocked
      const blockedRes = await testApp.requestWithHeaders("POST", "/api/auth/login", {
        body: { password },
      });
      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.error.code).toBe("RATE_LIMITED");
    } finally {
      await testApp.close();
    }
  });

  test("with trustProxy: true, different last X-Forwarded-For values are limited separately", async () => {
    let t = 1_700_000_000_000;
    const clock = { now: () => new Date(t) };

    const testApp = await makeTestApp({
      clock,
      trustProxy: true,
      auth: {
        ownerPasswordHash,
        sessionSecret,
        apiTokens,
        secureCookies: false,
      },
    });

    try {
      // 5 failures from client A (last entry is 10.0.0.1)
      for (let i = 0; i < 5; i++) {
        const res = await testApp.requestWithHeaders("POST", "/api/auth/login", {
          body: { password: "wrong" },
          headers: { "X-Forwarded-For": "client, 10.0.0.1" },
        });
        expect(res.status).toBe(401);
      }

      // 6th attempt from client A is blocked
      const blockedRes = await testApp.requestWithHeaders("POST", "/api/auth/login", {
        body: { password },
        headers: { "X-Forwarded-For": "client, 10.0.0.1" },
      });
      expect(blockedRes.status).toBe(429);

      // Client B (last entry is 10.0.0.2) is not blocked
      const allowedRes = await testApp.requestWithHeaders("POST", "/api/auth/login", {
        body: { password },
        headers: { "X-Forwarded-For": "client, 10.0.0.2" },
      });
      expect(allowedRes.status).toBe(200);
      expect(allowedRes.body).toEqual({ signedIn: true });
    } finally {
      await testApp.close();
    }
  });

  test("with trustProxy off, X-Forwarded-For is ignored", async () => {
    let t = 1_700_000_000_000;
    const clock = { now: () => new Date(t) };

    const testApp = await makeTestApp({
      clock,
      trustProxy: false,
      auth: {
        ownerPasswordHash,
        sessionSecret,
        apiTokens,
        secureCookies: false,
      },
    });

    try {
      // 5 failures with X-Forwarded-For: 10.0.0.1
      for (let i = 0; i < 5; i++) {
        const res = await testApp.requestWithHeaders("POST", "/api/auth/login", {
          body: { password: "wrong" },
          headers: { "X-Forwarded-For": "10.0.0.1" },
        });
        expect(res.status).toBe(401);
      }

      // Because trustProxy is off, key is "unknown" for both
      // Even with X-Forwarded-For: 10.0.0.2, it is blocked!
      const blockedRes = await testApp.requestWithHeaders("POST", "/api/auth/login", {
        body: { password },
        headers: { "X-Forwarded-For": "10.0.0.2" },
      });
      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.error.code).toBe("RATE_LIMITED");
    } finally {
      await testApp.close();
    }
  });

  test("parallel wrong logins can't exceed the limit", async () => {
    let t = 1_700_000_000_000;
    const clock = { now: () => new Date(t) };

    const testApp = await makeTestApp({
      clock,
      auth: {
        ownerPasswordHash,
        sessionSecret,
        apiTokens,
        secureCookies: false,
      },
    });

    try {
      const requests = Array.from({ length: 20 }, () =>
        testApp.requestWithHeaders("POST", "/api/auth/login", {
          body: { password: "wrong-password" },
        })
      );
      const responses = await Promise.all(requests);
      const status401Count = responses.filter((r) => r.status === 401).length;
      const status429Count = responses.filter((r) => r.status === 429).length;

      expect(status401Count).toBe(5);
      expect(status429Count).toBe(15);
    } finally {
      await testApp.close();
    }
  });
});
