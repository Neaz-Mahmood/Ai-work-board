import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { makeTestApp, startTestServer, type TestApp, type TestServer } from "./helpers.ts";
import { connectMcp, callTool } from "./mcp-helpers.ts";
import { resolveActorName, assertAgentActor, ACTOR_NAME } from "../src/domain/actors.ts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

describe("Actor resolution and validation", () => {
  test("resolveActorName unit cases", () => {
    // param beats URL
    expect(resolveActorName("worker", "url-agent")).toBe("worker");
    expect(resolveActorName("  worker  ", "url-agent")).toBe("worker");

    // URL beats default
    expect(resolveActorName(undefined, "url-agent")).toBe("url-agent");
    expect(resolveActorName("", "url-agent")).toBe("url-agent");
    expect(resolveActorName("   ", "url-agent")).toBe("url-agent");
    expect(resolveActorName(undefined, "  url-agent  ")).toBe("url-agent");

    // default agent
    expect(resolveActorName(undefined, undefined)).toBe("agent");
    expect(resolveActorName("", "")).toBe("agent");
    expect(resolveActorName("   ", "   ")).toBe("agent");
  });

  test("assertAgentActor validation", () => {
    // Valid agent actor names
    expect(() => assertAgentActor("agent")).not.toThrow();
    expect(() => assertAgentActor("claude-3-opus")).not.toThrow();
    expect(() => assertAgentActor("cursor_v1.0")).not.toThrow();
    expect(() => assertAgentActor("agy")).not.toThrow();

    // Invalid format
    expect(() => assertAgentActor("")).toThrowError(/Invalid actor name/);
    expect(() => assertAgentActor("hello world")).toThrowError(/Invalid actor name/);
    expect(() => assertAgentActor("bad@actor")).toThrowError(/Invalid actor name/);
    expect(() => assertAgentActor("a".repeat(41))).toThrowError(/Invalid actor name/);

    // Reserved actor name 'you' (case-insensitive)
    expect(() => assertAgentActor("you")).toThrowError(
      "The actor name 'you' is reserved for the board UI."
    );
    expect(() => assertAgentActor("YOU")).toThrowError(
      "The actor name 'you' is reserved for the board UI."
    );
    expect(() => assertAgentActor("You")).toThrowError(
      "The actor name 'you' is reserved for the board UI."
    );
  });
});

describe("MCP projects endpoint", () => {
  let testApp: TestApp;
  let tempBase: string;

  beforeAll(() => {
    testApp = makeTestApp();
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "awb-mcp-test-"));
  });

  afterAll(() => {
    testApp.close();
    fs.rmSync(tempBase, { recursive: true, force: true });
  });

  test("tool list contains list_projects and create_project, and no delete tools", async () => {
    const client = await connectMcp(testApp.app);
    try {
      const { tools } = await client.listTools();
      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain("list_projects");
      expect(toolNames).toContain("create_project");

      // Verify no delete tools are exposed through MCP
      const hasDeleteTool = toolNames.some((name) => name.toLowerCase().includes("delete"));
      expect(hasDeleteTool).toBe(false);
    } finally {
      await client.close();
    }
  });

  test("create_project then list_projects returns it", async () => {
    const client = await connectMcp(testApp.app);
    try {
      const projDir = path.join(tempBase, "mcp-project-1");
      fs.mkdirSync(projDir, { recursive: true });

      const createRes = await callTool(client, "create_project", {
        path: projDir,
        name: "MCP Project 1",
        key: "MCP",
      });

      expect(createRes.isError).toBe(false);
      expect(createRes.data).toMatchObject({
        key: "MCP",
        name: "MCP Project 1",
        path: fs.realpathSync(projDir),
      });

      const listRes = await callTool(client, "list_projects", {});
      expect(listRes.isError).toBe(false);
      expect(Array.isArray(listRes.data)).toBe(true);
      const found = listRes.data.find((p: any) => p.key === "MCP");
      expect(found).toBeDefined();
      expect(found.name).toBe("MCP Project 1");
    } finally {
      await client.close();
    }
  });

  test("errors come back as isError with CONFLICT: … / VALIDATION: …", async () => {
    const client = await connectMcp(testApp.app);
    try {
      const projDir = path.join(tempBase, "mcp-conflict-test");
      fs.mkdirSync(projDir, { recursive: true });

      // First create succeeds
      const first = await callTool(client, "create_project", {
        path: projDir,
        name: "Conflict Test",
        key: "CONF",
      });
      expect(first.isError).toBe(false);

      // Duplicate path error -> CONFLICT
      const dupPath = await callTool(client, "create_project", {
        path: projDir,
        name: "Other Name",
        key: "CONF2",
      });
      expect(dupPath.isError).toBe(true);
      expect(dupPath.data).toMatch(/^CONFLICT: Path already registered as CONF/);

      // Duplicate key error -> CONFLICT
      const projDir2 = path.join(tempBase, "mcp-conflict-test-2");
      fs.mkdirSync(projDir2, { recursive: true });
      const dupKey = await callTool(client, "create_project", {
        path: projDir2,
        key: "CONF",
      });
      expect(dupKey.isError).toBe(true);
      expect(dupKey.data).toMatch(/^CONFLICT: Project key CONF is already in use/);

      // Invalid key format -> VALIDATION
      const projDir3 = path.join(tempBase, "mcp-val-test-3");
      fs.mkdirSync(projDir3, { recursive: true });
      const invalidKey = await callTool(client, "create_project", {
        path: projDir3,
        key: "TOOLONGKEY",
      });
      expect(invalidKey.isError).toBe(true);
      expect(invalidKey.data).toMatch(/^VALIDATION: Project key must be 2 to 5 uppercase letters/);

      // Non-existent path -> VALIDATION
      const nonExistent = await callTool(client, "create_project", {
        path: path.join(tempBase, "does-not-exist"),
      });
      expect(nonExistent.isError).toBe(true);
      expect(nonExistent.data).toMatch(/^VALIDATION: Path does not exist/);
    } finally {
      await client.close();
    }
  });

  test("actor: 'you' returns isError with reserved message", async () => {
    const client = await connectMcp(testApp.app);
    try {
      const projDir = path.join(tempBase, "mcp-actor-you");
      fs.mkdirSync(projDir, { recursive: true });

      const res = await callTool(client, "create_project", {
        path: projDir,
        actor: "you",
      });
      expect(res.isError).toBe(true);
      expect(res.data).toBe("VALIDATION: The actor name 'you' is reserved for the board UI.");

      // Case-insensitive test
      const resCase = await callTool(client, "create_project", {
        path: projDir,
        actor: "YoU",
      });
      expect(resCase.isError).toBe(true);
      expect(resCase.data).toBe("VALIDATION: The actor name 'you' is reserved for the board UI.");
    } finally {
      await client.close();
    }
  });

  test("URL ?actor=you returns isError with reserved message, but param beats URL", async () => {
    const client = await connectMcp(testApp.app, "you");
    try {
      const projDir = path.join(tempBase, "mcp-url-actor-you");
      fs.mkdirSync(projDir, { recursive: true });

      // No actor param -> inherits 'you' from URL -> fails
      const res = await callTool(client, "create_project", {
        path: projDir,
      });
      expect(res.isError).toBe(true);
      expect(res.data).toBe("VALIDATION: The actor name 'you' is reserved for the board UI.");

      // Explicit valid actor param beats URL -> succeeds
      const resWithParam = await callTool(client, "create_project", {
        path: projDir,
        actor: "override-agent",
        key: "OVR",
      });
      expect(resWithParam.isError).toBe(false);
      expect(resWithParam.data.key).toBe("OVR");
    } finally {
      await client.close();
    }
  });

  test("MCP client can connect over real HTTP server", async () => {
    const testServer: TestServer = await startTestServer();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "awb-net-test-"));
    try {
      const client = new Client({ name: "real-net-client", version: "1.0.0" });
      const transport = new StreamableHTTPClientTransport(
        new URL(testServer.url + "/mcp?actor=net-agent")
      );
      await client.connect(transport);

      const listRes = await callTool(client, "list_projects", {});
      expect(listRes.isError).toBe(false);
      expect(Array.isArray(listRes.data)).toBe(true);

      const createRes = await callTool(client, "create_project", {
        path: tempDir,
        name: "Network Test Project",
        key: "NET",
      });
      expect(createRes.isError).toBe(false);
      expect(createRes.data.key).toBe("NET");

      await client.close();
    } finally {
      await testServer.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
