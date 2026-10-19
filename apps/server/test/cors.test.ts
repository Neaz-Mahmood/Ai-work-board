import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { makeTestApp, type TestApp } from "./helpers.ts";
import { hashPassword } from "../src/server/auth.ts";

describe("CORS middleware", () => {
  describe("with allowedOrigins: ['http://localhost:4800']", () => {
    let testApp: TestApp;

    beforeAll(async () => {
      testApp = await makeTestApp({
        allowedOrigins: ["http://localhost:4800"],
      });
    });

    afterAll(async () => {
      await testApp.close();
    });

    test("preflight OPTIONS from an allowed origin gets Access-Control-Allow-Origin and Access-Control-Allow-Credentials: true", async () => {
      const res = await testApp.app.request("/api/projects", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:4800",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Content-Type",
        },
      });

      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:4800");
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
      expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    });

    test("preflight OPTIONS from an allowed origin to /mcp gets CORS headers", async () => {
      const res = await testApp.app.request("/mcp", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:4800",
          "Access-Control-Request-Method": "POST",
        },
      });

      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:4800");
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    });

    test("preflight OPTIONS from a disallowed origin gets neither", async () => {
      const res = await testApp.app.request("/api/projects", {
        method: "OPTIONS",
        headers: {
          Origin: "http://evil.com",
          "Access-Control-Request-Method": "POST",
        },
      });

      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    });

    test("a request with no Origin works and gets no CORS headers", async () => {
      const res = await testApp.app.request("/api/health", {
        method: "GET",
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    });

    test("GET from an allowed origin gets CORS headers", async () => {
      const res = await testApp.app.request("/api/health", {
        method: "GET",
        headers: {
          Origin: "http://localhost:4800",
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:4800");
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    });

    test("GET from a disallowed origin gets no CORS headers", async () => {
      const res = await testApp.app.request("/api/health", {
        method: "GET",
        headers: {
          Origin: "http://evil.com",
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    });
  });

  describe("with auth and allowedOrigins configured", () => {
    let testApp: TestApp;

    beforeAll(async () => {
      testApp = await makeTestApp({
        allowedOrigins: ["http://localhost:4800"],
        auth: {
          ownerPasswordHash: hashPassword("secret-pass"),
          sessionSecret: "a-secret-that-is-at-least-32-chars-long",
          apiTokens: ["token-123"],
          secureCookies: false,
        },
      });
    });

    afterAll(async () => {
      await testApp.close();
    });

    test("request from an allowed origin without credentials returns 401 with CORS headers", async () => {
      const res = await testApp.app.request("/api/projects", {
        method: "GET",
        headers: {
          Origin: "http://localhost:4800",
        },
      });

      expect(res.status).toBe(401);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:4800");
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    });

    test("preflight OPTIONS from an allowed origin returns 204 (not 401)", async () => {
      const res = await testApp.app.request("/api/projects", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:4800",
          "Access-Control-Request-Method": "GET",
        },
      });

      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:4800");
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    });
  });

  describe("with empty or undefined allowedOrigins", () => {
    let testApp: TestApp;

    beforeAll(async () => {
      testApp = await makeTestApp({
        allowedOrigins: [],
      });
    });

    afterAll(async () => {
      await testApp.close();
    });

    test("no CORS headers added for any origin", async () => {
      const res = await testApp.app.request("/api/health", {
        method: "GET",
        headers: {
          Origin: "http://localhost:4800",
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    });
  });
});
