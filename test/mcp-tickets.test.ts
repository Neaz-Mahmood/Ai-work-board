import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { makeTestApp, type TestApp } from "./helpers.ts";
import { connectMcp, callTool } from "./mcp-helpers.ts";

describe("MCP tickets tools", () => {
  let testApp: TestApp;
  let tempBase: string;
  let repoDir: string;
  let subDir: string;

  beforeAll(async () => {
    testApp = makeTestApp();
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "awb-mcp-tickets-test-"));
    repoDir = path.join(tempBase, "mcp-repo");
    subDir = path.join(repoDir, "src", "sub");
    fs.mkdirSync(subDir, { recursive: true });

    await testApp.request("POST", "/api/projects", {
      path: repoDir,
      name: "MCP Project",
      key: "MCK",
    });
  });

  afterAll(() => {
    testApp.close();
    fs.rmSync(tempBase, { recursive: true, force: true });
  });

  test("tool list contains ticket tools and no delete tools", async () => {
    const client = await connectMcp(testApp.app);
    try {
      const { tools } = await client.listTools();
      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain("get_board");
      expect(toolNames).toContain("list_tickets");
      expect(toolNames).toContain("get_ticket");
      expect(toolNames).toContain("create_ticket");

      // Verify no delete tools
      const hasDeleteTool = toolNames.some((name) =>
        name.toLowerCase().includes("delete")
      );
      expect(hasDeleteTool).toBe(false);
    } finally {
      await client.close();
    }
  });

  test("create_ticket by explicit project key and by cwd resolution", async () => {
    const client = await connectMcp(testApp.app);
    try {
      // 1. By explicit project key
      const res1 = await callTool(client, "create_ticket", {
        project: "MCK",
        title: "Ticket via explicit project",
        description: "Created with explicit key",
        priority: "high",
        column: "todo",
      });
      expect(res1.isError).toBe(false);
      expect(res1.data.key).toBe("MCK-1");
      expect(res1.data.title).toBe("Ticket via explicit project");
      expect(res1.data.column).toBe("todo");
      expect(res1.data.priority).toBe("high");

      // 2. By cwd resolution (from nested subdirectory)
      const res2 = await callTool(client, "create_ticket", {
        cwd: subDir,
        title: "Ticket via cwd resolution",
        column: "backlog",
      });
      expect(res2.isError).toBe(false);
      expect(res2.data.key).toBe("MCK-2");
      expect(res2.data.title).toBe("Ticket via cwd resolution");
      expect(res2.data.column).toBe("backlog");
    } finally {
      await client.close();
    }
  });

  test("actor resolution: parameter vs ?actor= URL vs default agent vs 'you' rejection", async () => {
    // 1. Default fallback to 'agent' when neither URL nor param actor provided
    const clientDefault = await connectMcp(testApp.app);
    try {
      const res = await callTool(clientDefault, "create_ticket", {
        project: "MCK",
        title: "Default actor ticket",
      });
      expect(res.isError).toBe(false);
      expect(res.data.activity[0].actor).toBe("agent");
    } finally {
      await clientDefault.close();
    }

    // 2. Actor from URL
    const clientUrl = await connectMcp(testApp.app, "claude-code");
    try {
      const res = await callTool(clientUrl, "create_ticket", {
        project: "MCK",
        title: "URL actor ticket",
      });
      expect(res.isError).toBe(false);
      expect(res.data.activity[0].actor).toBe("claude-code");

      // 3. Parameter actor overrides URL actor
      const resOverride = await callTool(clientUrl, "create_ticket", {
        project: "MCK",
        title: "Param override ticket",
        actor: "cursor-agent",
      });
      expect(resOverride.isError).toBe(false);
      expect(resOverride.data.activity[0].actor).toBe("cursor-agent");

      // 4. Actor 'you' is rejected in MCP
      const resYou = await callTool(clientUrl, "create_ticket", {
        project: "MCK",
        title: "Impersonating UI",
        actor: "you",
      });
      expect(resYou.isError).toBe(true);
      expect(resYou.data).toContain("reserved for the board UI");
    } finally {
      await clientUrl.close();
    }
  });

  test("get_ticket retrieves full ticket details", async () => {
    const client = await connectMcp(testApp.app);
    try {
      const res = await callTool(client, "get_ticket", {
        ticketKey: "MCK-1",
      });
      expect(res.isError).toBe(false);
      expect(res.data.key).toBe("MCK-1");
      expect(res.data.title).toBe("Ticket via explicit project");
      expect(res.data.activity).toBeInstanceOf(Array);
      expect(res.data.activity.length).toBeGreaterThanOrEqual(1);

      // Unknown ticket returns error
      const errRes = await callTool(client, "get_ticket", {
        ticketKey: "MCK-9999",
      });
      expect(errRes.isError).toBe(true);
      expect(errRes.data).toContain("NOT_FOUND");
    } finally {
      await client.close();
    }
  });

  test("list_tickets with filters by cwd or project", async () => {
    const client = await connectMcp(testApp.app);
    try {
      // List all
      const resAll = await callTool(client, "list_tickets", {
        cwd: repoDir,
      });
      expect(resAll.isError).toBe(false);
      expect(Array.isArray(resAll.data)).toBe(true);
      expect(resAll.data.length).toBeGreaterThan(0);

      // Filter by column
      const resTodo = await callTool(client, "list_tickets", {
        project: "MCK",
        column: "todo",
      });
      expect(resTodo.isError).toBe(false);
      for (const card of resTodo.data) {
        expect(card.column).toBe("todo");
      }

      // Filter by query
      const resQuery = await callTool(client, "list_tickets", {
        cwd: repoDir,
        query: "explicit",
      });
      expect(resQuery.isError).toBe(false);
      expect(resQuery.data).toHaveLength(1);
      expect(resQuery.data[0].title).toBe("Ticket via explicit project");
    } finally {
      await client.close();
    }
  });

  test("get_board returns columns, tickets, features, and actors", async () => {
    const client = await connectMcp(testApp.app);
    try {
      const res = await callTool(client, "get_board", {
        cwd: subDir,
      });
      expect(res.isError).toBe(false);
      const board = res.data;
      expect(board.project.key).toBe("MCK");
      expect(board.columns).toHaveLength(5);
      expect(board.features).toEqual([]);
      expect(Array.isArray(board.actors)).toBe(true);
      expect(board.columns.map((c: any) => c.id)).toEqual([
        "backlog",
        "todo",
        "in_progress",
        "in_review",
        "done",
      ]);
    } finally {
      await client.close();
    }
  });
});
