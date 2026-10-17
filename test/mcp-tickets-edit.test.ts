import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { makeTestApp, type TestApp } from "./helpers.ts";
import { connectMcp, callTool } from "./mcp-helpers.ts";

describe("MCP ticket update and move tools", () => {
  let testApp: TestApp;
  let tempBase: string;
  let repoDir: string;

  beforeAll(async () => {
    testApp = makeTestApp();
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "awb-mcp-edit-test-"));
    repoDir = path.join(tempBase, "mcp-edit-repo");
    fs.mkdirSync(repoDir, { recursive: true });

    await testApp.request("POST", "/api/projects", {
      path: repoDir,
      name: "MCP Edit Project",
      key: "MEDIT",
    });
  });

  afterAll(() => {
    testApp.close();
    fs.rmSync(tempBase, { recursive: true, force: true });
  });

  test("tool list includes update_ticket and move_ticket", async () => {
    const client = await connectMcp(testApp.app);
    try {
      const { tools } = await client.listTools();
      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain("update_ticket");
      expect(toolNames).toContain("move_ticket");

      // Verify no delete tools
      expect(toolNames.some((n) => n.toLowerCase().includes("delete"))).toBe(false);
    } finally {
      await client.close();
    }
  });

  test("update_ticket updates fields and attributes actor correctly", async () => {
    // Create initial ticket via REST
    const created = await testApp.request("POST", "/api/projects/MEDIT/tickets", {
      title: "Initial MCP Ticket",
      description: "Initial description",
      priority: "low",
    });
    const key = created.body.key;

    // 1. Update title and priority using tool arg actor
    const client = await connectMcp(testApp.app);
    try {
      const updateRes1 = await callTool(client, "update_ticket", {
        ticketKey: key,
        title: "Updated via MCP",
        priority: "highest",
        actor: "mcp-agent-1",
      });

      expect(updateRes1.isError).toBe(false);
      expect(updateRes1.data.title).toBe("Updated via MCP");
      expect(updateRes1.data.priority).toBe("highest");
      const latestAct1 = updateRes1.data.activity[updateRes1.data.activity.length - 1];
      expect(latestAct1.actor).toBe("mcp-agent-1");

      // 2. Update description using URL actor
      const clientUrl = await connectMcp(testApp.app, "url-worker");
      try {
        const updateRes2 = await callTool(clientUrl, "update_ticket", {
          ticketKey: key,
          description: "New description from URL worker",
        });
        expect(updateRes2.isError).toBe(false);
        expect(updateRes2.data.description).toBe("New description from URL worker");
        const latestAct2 = updateRes2.data.activity[updateRes2.data.activity.length - 1];
        expect(latestAct2.actor).toBe("url-worker");
      } finally {
        await clientUrl.close();
      }

      // 3. Fallback to default 'agent' when neither provided
      const updateRes3 = await callTool(client, "update_ticket", {
        ticketKey: key,
        priority: "medium",
      });
      expect(updateRes3.isError).toBe(false);
      expect(updateRes3.data.priority).toBe("medium");
      const latestAct3 = updateRes3.data.activity[updateRes3.data.activity.length - 1];
      expect(latestAct3.actor).toBe("agent");
    } finally {
      await client.close();
    }
  });

  test("update_ticket assignee set and unset (with null)", async () => {
    const created = await testApp.request("POST", "/api/projects/MEDIT/tickets", {
      title: "Assignee MCP Ticket",
    });
    const key = created.body.key;

    const client = await connectMcp(testApp.app);
    try {
      // Set assignee to "coder-bot"
      const setRes = await callTool(client, "update_ticket", {
        ticketKey: key,
        assignee: "coder-bot",
        actor: "lead",
      });
      expect(setRes.isError).toBe(false);
      expect(setRes.data.assignee).toBe("coder-bot");

      // Unset assignee using null
      const unsetRes = await callTool(client, "update_ticket", {
        ticketKey: key,
        assignee: null,
        actor: "lead",
      });
      expect(unsetRes.isError).toBe(false);
      expect(unsetRes.data.assignee).toBeNull();
    } finally {
      await client.close();
    }
  });

  test("update_ticket rejects reserved actor 'you' and invalid inputs", async () => {
    const created = await testApp.request("POST", "/api/projects/MEDIT/tickets", {
      title: "Validation Ticket",
    });
    const key = created.body.key;

    const client = await connectMcp(testApp.app);
    try {
      // Reserved actor 'you'
      const resYou = await callTool(client, "update_ticket", {
        ticketKey: key,
        title: "Try You",
        actor: "you",
      });
      expect(resYou.isError).toBe(true);
      expect(resYou.data).toContain("reserved");

      // Invalid priority
      const resBadPrio = await callTool(client, "update_ticket", {
        ticketKey: key,
        priority: "invalid_priority",
      });
      expect(resBadPrio.isError).toBe(true);

      // Non-existent ticket
      const resNotFnd = await callTool(client, "update_ticket", {
        ticketKey: "MEDIT-9999",
        title: "Won't work",
      });
      expect(resNotFnd.isError).toBe(true);
    } finally {
      await client.close();
    }
  });

  test("move_ticket moves across columns and reorders within column", async () => {
    // Create two tickets in backlog
    const t1 = await testApp.request("POST", "/api/projects/MEDIT/tickets", {
      title: "Move Tool 1",
      column: "backlog",
    });
    const t2 = await testApp.request("POST", "/api/projects/MEDIT/tickets", {
      title: "Move Tool 2",
      column: "backlog",
    });
    const key1 = t1.body.key;
    const key2 = t2.body.key;

    const client = await connectMcp(testApp.app, "mcp-mover");
    try {
      // Move key1 to in_progress
      const moveRes1 = await callTool(client, "move_ticket", {
        ticketKey: key1,
        column: "in_progress",
      });
      expect(moveRes1.isError).toBe(false);
      expect(moveRes1.data.column).toBe("in_progress");
      expect(moveRes1.data.rank).toBe(0);
      const act1 = moveRes1.data.activity[moveRes1.data.activity.length - 1];
      expect(act1.actor).toBe("mcp-mover");
      expect(act1.kind).toBe("moved");

      // Move key2 to in_progress at position 0 (top)
      const moveRes2 = await callTool(client, "move_ticket", {
        ticketKey: key2,
        column: "in_progress",
        position: 0,
        actor: "custom-mover",
      });
      expect(moveRes2.isError).toBe(false);
      expect(moveRes2.data.column).toBe("in_progress");
      expect(moveRes2.data.rank).toBe(0);
      const act2 = moveRes2.data.activity[moveRes2.data.activity.length - 1];
      expect(act2.actor).toBe("custom-mover");

      // Verify key1 shifted to rank 1
      const checkKey1 = await callTool(client, "get_ticket", { ticketKey: key1 });
      expect(checkKey1.isError).toBe(false);
      expect(checkKey1.data.rank).toBe(1);

      // Reorder within in_progress: move key1 to position 0
      const rerankRes = await callTool(client, "move_ticket", {
        ticketKey: key1,
        column: "in_progress",
        position: 0,
      });
      expect(rerankRes.isError).toBe(false);
      expect(rerankRes.data.rank).toBe(0);
      const actRerank = rerankRes.data.activity[rerankRes.data.activity.length - 1];
      expect(actRerank.kind).toBe("reranked");
      expect(actRerank.payload).toEqual({ from: 1, to: 0 });

      // Move with reserved actor 'you' rejected
      const moveYou = await callTool(client, "move_ticket", {
        ticketKey: key1,
        column: "done",
        actor: "you",
      });
      expect(moveYou.isError).toBe(true);
      expect(moveYou.data).toContain("reserved");
    } finally {
      await client.close();
    }
  });
});
