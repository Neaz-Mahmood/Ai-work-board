import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { makeTestApp, type TestApp } from "./helpers.ts";
import {
  hashPassword,
  verifyPassword,
  tokenMatches,
} from "../src/server/auth.ts";
import { connectMcp, callTool } from "./mcp-helpers.ts";

describe("Server Auth", () => {
  const password = "correct-horse-battery-staple";
  const ownerPasswordHash = hashPassword(password);
  const sessionSecret = "super-secure-session-secret-at-least-32-chars";
  const apiTokens = ["token-alpha-123", "token-beta-456"];

  describe("Password and token hashing helpers", () => {
    test("hashPassword produces scrypt format and verifyPassword verifies it", () => {
      const hash = hashPassword("test-pw");
      expect(hash.startsWith("scrypt$")).toBe(true);
      expect(verifyPassword("test-pw", hash)).toBe(true);
      expect(verifyPassword("wrong-pw", hash)).toBe(false);
    });

    test("verifyPassword returns false for malformed hashes without throwing", () => {
      expect(verifyPassword("pw", "not-a-hash")).toBe(false);
      expect(verifyPassword("pw", "scrypt$xyz")).toBe(false);
      expect(verifyPassword("pw", "scrypt$badhex$badhex")).toBe(false);
      expect(verifyPassword("pw", "")).toBe(false);
    });

    test("tokenMatches performs constant-time comparison", () => {
      expect(tokenMatches("token-alpha-123", apiTokens)).toBe(true);
      expect(tokenMatches("token-beta-456", apiTokens)).toBe(true);
      expect(tokenMatches("token-alpha", apiTokens)).toBe(false);
      expect(tokenMatches("wrong-token", apiTokens)).toBe(false);
      expect(tokenMatches("", apiTokens)).toBe(false);
    });
  });

  describe("Hosted mode (auth enabled)", () => {
    let testApp: TestApp;
    let tempDir: string;
    let repoDir: string;
    let sessionCookie: string;

    beforeAll(async () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "awb-auth-test-"));
      repoDir = path.join(tempDir, "repo");
      fs.mkdirSync(repoDir, { recursive: true });

      testApp = await makeTestApp({
        auth: {
          ownerPasswordHash,
          sessionSecret,
          apiTokens,
          secureCookies: false,
        },
      });
    });

    afterAll(async () => {
      await testApp.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test("/api/health is public", async () => {
      const res = await testApp.requestWithHeaders("GET", "/api/health");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test("session endpoint when signed out", async () => {
      const res = await testApp.requestWithHeaders("GET", "/api/auth/session");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ authEnabled: true, signedIn: false });
    });

    test("right and wrong password on login", async () => {
      // Wrong password
      const badRes = await testApp.requestWithHeaders("POST", "/api/auth/login", {
        body: { password: "wrong-password" },
      });
      expect(badRes.status).toBe(401);
      expect(badRes.body).toEqual({
        error: { code: "UNAUTHORIZED", message: "Wrong password" },
      });

      // Missing password
      const missingRes = await testApp.requestWithHeaders("POST", "/api/auth/login", {
        body: {},
      });
      expect(missingRes.status).toBe(401);
      expect(missingRes.body.error.code).toBe("UNAUTHORIZED");

      // Right password
      const goodRes = await testApp.requestWithHeaders("POST", "/api/auth/login", {
        body: { password },
      });
      expect(goodRes.status).toBe(200);
      expect(goodRes.body).toEqual({ signedIn: true });

      const setCookie = goodRes.headers.get("set-cookie");
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain("awb_session=");

      sessionCookie = setCookie!.split(";")[0];
    });

    test("session endpoint when signed in", async () => {
      const res = await testApp.requestWithHeaders("GET", "/api/auth/session", {
        headers: { Cookie: sessionCookie },
      });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ authEnabled: true, signedIn: true });
    });

    test("401 on /api/projects, /api/events, and /mcp without credentials", async () => {
      const resProjects = await testApp.requestWithHeaders("GET", "/api/projects");
      expect(resProjects.status).toBe(401);
      expect(resProjects.body).toEqual({
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });

      const resEvents = await testApp.requestWithHeaders("GET", "/api/events");
      expect(resEvents.status).toBe(401);
      expect(resEvents.body.error.code).toBe("UNAUTHORIZED");

      const resMcp = await testApp.requestWithHeaders("POST", "/mcp", {
        body: { jsonrpc: "2.0", method: "tools/list", id: 1 },
      });
      expect(resMcp.status).toBe(401);
      expect(resMcp.body.error.code).toBe("UNAUTHORIZED");
    });

    test("401 on bad token or tampered cookie", async () => {
      // Bad Bearer token
      const resBadToken = await testApp.requestWithHeaders("GET", "/api/projects", {
        headers: { Authorization: "Bearer bad-token-xyz" },
      });
      expect(resBadToken.status).toBe(401);

      // Tampered cookie
      const resTampered = await testApp.requestWithHeaders("GET", "/api/projects", {
        headers: { Cookie: "awb_session=tampered.signature" },
      });
      expect(resTampered.status).toBe(401);
    });

    test("a cookie request acts as 'you' regardless of X-AWB-Actor header", async () => {
      const projRes = await testApp.requestWithHeaders("POST", "/api/projects", {
        body: { path: repoDir, name: "Auth Project", key: "AUTH" },
        headers: {
          Cookie: sessionCookie,
          "X-AWB-Actor": "someone-else",
        },
      });
      expect(projRes.status).toBe(201);

      const ticketRes = await testApp.requestWithHeaders(
        "POST",
        "/api/projects/AUTH/tickets",
        {
          body: { title: "Owner Ticket" },
          headers: {
            Cookie: sessionCookie,
            "X-AWB-Actor": "impersonator",
          },
        }
      );
      expect(ticketRes.status).toBe(201);
      expect(ticketRes.body.activity[0].actor).toBe("you");
    });

    test("Bearer REST works and the Activity actor is the header name", async () => {
      const ticketRes = await testApp.requestWithHeaders(
        "POST",
        "/api/projects/AUTH/tickets",
        {
          body: { title: "Agent Ticket" },
          headers: {
            Authorization: `Bearer ${apiTokens[0]}`,
            "X-AWB-Actor": "build-bot",
          },
        }
      );
      expect(ticketRes.status).toBe(201);
      expect(ticketRes.body.activity[0].actor).toBe("build-bot");
    });

    test("Bearer with X-AWB-Actor: you is rejected", async () => {
      const res = await testApp.requestWithHeaders(
        "POST",
        "/api/projects/AUTH/tickets",
        {
          body: { title: "Impersonator Ticket" },
          headers: {
            Authorization: `Bearer ${apiTokens[0]}`,
            "X-AWB-Actor": "you",
          },
        }
      );
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION");
      expect(res.body.error.message).toContain("reserved");
    });

    test("MCP works with valid Bearer token", async () => {
      const mcpClient = await connectMcp(testApp.app, "mcp-agent", {
        Authorization: `Bearer ${apiTokens[0]}`,
      });
      const result = await callTool(mcpClient, "list_projects");
      expect(result.isError).toBe(false);
      expect(Array.isArray(result.data)).toBe(true);
      await mcpClient.close();
    });

    test("logout clears the cookie and signs out", async () => {
      const logoutRes = await testApp.requestWithHeaders("POST", "/api/auth/logout", {
        headers: { Cookie: sessionCookie },
      });
      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body).toEqual({ signedIn: false });

      const setCookie = logoutRes.headers.get("set-cookie");
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain("awb_session=");
      // Cookie is cleared or expired
      const clearedCookie = setCookie!.split(";")[0];
      const sessionRes = await testApp.requestWithHeaders("GET", "/api/auth/session", {
        headers: { Cookie: clearedCookie },
      });
      expect(sessionRes.status).toBe(200);
      expect(sessionRes.body).toEqual({ authEnabled: true, signedIn: false });
    });
  });

  describe("Local mode (auth not configured)", () => {
    let testApp: TestApp;
    let tempDir: string;
    let repoDir: string;

    beforeAll(async () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "awb-local-test-"));
      repoDir = path.join(tempDir, "repo");
      fs.mkdirSync(repoDir, { recursive: true });

      testApp = await makeTestApp(); // auth is undefined
    });

    afterAll(async () => {
      await testApp.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test("endpoints are open without credentials", async () => {
      const resHealth = await testApp.request("GET", "/api/health");
      expect(resHealth.status).toBe(200);

      const resProjects = await testApp.request("GET", "/api/projects");
      expect(resProjects.status).toBe(200);
    });

    test("/api/auth endpoints in local mode", async () => {
      const resSession = await testApp.request("GET", "/api/auth/session");
      expect(resSession.status).toBe(200);
      expect(resSession.body).toEqual({ authEnabled: false, signedIn: true });

      const resLogin = await testApp.request("POST", "/api/auth/login", { password: "any" });
      expect(resLogin.status).toBe(200);
      expect(resLogin.body).toEqual({ signedIn: true });

      const resLogout = await testApp.request("POST", "/api/auth/logout");
      expect(resLogout.status).toBe(200);
      expect(resLogout.body).toEqual({ signedIn: false });
    });

    test("local UI still acts as 'you' without being rejected", async () => {
      await testApp.request("POST", "/api/projects", {
        path: repoDir,
        name: "Local Proj",
        key: "LOCL",
      });

      const res = await testApp.request(
        "POST",
        "/api/projects/LOCL/tickets",
        { title: "Local UI Ticket" },
        "you"
      );
      expect(res.status).toBe(201);
      expect(res.body.activity[0].actor).toBe("you");
    });
  });
});
