import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { runCli, startTestServer, type TestServer } from "./helpers.ts";
import { hashPassword, verifyPassword } from "../src/server/auth.ts";

describe("CLI Auth", () => {
  let server: TestServer;
  let tempBase: string;
  const ownerPassword = "cli-test-owner-password";
  const ownerPasswordHash = hashPassword(ownerPassword);
  const sessionSecret = "cli-session-secret-at-least-32-chars-long";
  const apiTokens = ["token-cli-valid-123"];

  beforeAll(async () => {
    tempBase = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "awb-cli-auth-test-")));
    server = await startTestServer({
      auth: {
        ownerPasswordHash,
        sessionSecret,
        apiTokens,
        secureCookies: false,
      },
    });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tempBase, { recursive: true, force: true });
  });

  test("CLI fails with distinct error message and exit code 4 when AWB_TOKEN is missing", async () => {
    const res = await runCli(["projects"], {
      url: server.url,
      cwd: tempBase,
      env: {},
    });
    expect(res.code).toBe(4);
    expect(res.stderr).toContain(
      "Authentication failed: set AWB_TOKEN to an API token configured on the server (AWB_API_TOKENS)."
    );
  });

  test("CLI fails with exit code 4 when AWB_TOKEN is invalid", async () => {
    const res = await runCli(["projects"], {
      url: server.url,
      cwd: tempBase,
      env: { AWB_TOKEN: "wrong-token" },
    });
    expect(res.code).toBe(4);
    expect(res.stderr).toContain(
      "Authentication failed: set AWB_TOKEN to an API token configured on the server (AWB_API_TOKENS)."
    );
  });

  test("CLI works when valid AWB_TOKEN is provided", async () => {
    const repoDir = path.join(tempBase, "cli-repo");
    fs.mkdirSync(repoDir, { recursive: true });

    const initRes = await runCli(["init", "--key", "CLIA", "--name", "CLI Auth Proj"], {
      url: server.url,
      cwd: repoDir,
      env: { AWB_TOKEN: apiTokens[0] },
    });
    expect(initRes.code).toBe(0);

    const listRes = await runCli(["projects"], {
      url: server.url,
      cwd: repoDir,
      env: { AWB_TOKEN: apiTokens[0] },
    });
    expect(listRes.code).toBe(0);
    expect(listRes.stdout).toContain("CLIA");
  });

  test("awb hash-password <password> prints hash and verifies with verifyPassword", async () => {
    const res = await runCli(["hash-password", "my-new-secret"], {
      url: server.url,
      cwd: tempBase,
      env: {},
    });
    expect(res.code).toBe(0);
    const hash = res.stdout.trim();
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("my-new-secret", hash)).toBe(true);
    expect(verifyPassword("other-password", hash)).toBe(false);
  });

  test("awb hash-password with empty argument returns exit code 2", async () => {
    const res = await runCli(["hash-password", ""], {
      url: server.url,
      cwd: tempBase,
      env: {},
    });
    expect(res.code).toBe(2);
    expect(res.stderr).toContain("Password cannot be empty");
  });
});
