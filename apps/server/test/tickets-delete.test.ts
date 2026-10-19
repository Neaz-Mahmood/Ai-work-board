import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { makeTestApp, runCli, startTestServer, readSseEvents, type TestApp, type TestServer } from "./helpers.ts";
import { connectMcp } from "./mcp-helpers.ts";

describe("Ticket Deletion and Detail tests", () => {
  let testApp: TestApp;
  let server: TestServer;
  let tempBase: string;
  let repoDir: string;

  beforeAll(async () => {
    testApp = await makeTestApp();
    server = await startTestServer();
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "awb-delete-test-"));
    repoDir = path.join(tempBase, "del-repo");
    fs.mkdirSync(repoDir, { recursive: true });

    await testApp.request("POST", "/api/projects", {
      path: repoDir,
      name: "Delete Test Project",
      key: "DEL",
    });

    await server.request("POST", "/api/projects", {
      path: repoDir,
      name: "Delete CLI Project",
      key: "DCLI",
    });
  });

  afterAll(async () => {
    await testApp.close();
    await server.close();
    fs.rmSync(tempBase, { recursive: true, force: true });
  });

  test("REST delete returns 204, Ticket gone (404), Activity gone, ranks dense, numbers not reused, event emitted", async () => {
    // 1. Create 3 tickets in backlog
    const t1 = await testApp.request("POST", "/api/projects/DEL/tickets", { title: "Ticket 1" }, "alice");
    const t2 = await testApp.request("POST", "/api/projects/DEL/tickets", { title: "Ticket 2" }, "bob");
    const t3 = await testApp.request("POST", "/api/projects/DEL/tickets", { title: "Ticket 3" }, "charlie");

    expect(t1.status).toBe(201);
    expect(t2.status).toBe(201);
    expect(t3.status).toBe(201);

    expect(t1.body.key).toBe("DEL-1");
    expect(t2.body.key).toBe("DEL-2");
    expect(t3.body.key).toBe("DEL-3");

    // Add some activity to DEL-2
    await testApp.request("PATCH", "/api/tickets/DEL-2", { title: "Ticket 2 Updated" }, "alice");

    // Verify DEL-2 has activity
    const row2 = await testApp.ctx.db.get<{ id: number }>(
      "SELECT id FROM tickets WHERE project_id = (SELECT id FROM projects WHERE key = 'DEL') AND number = 2"
    );
    expect(row2).toBeDefined();
    const activityCountBefore = await testApp.ctx.db.get<{ count: number | string }>(
      "SELECT COUNT(*) as count FROM activity WHERE ticket_id = ?",
      row2!.id
    );
    expect(Number(activityCountBefore?.count)).toBeGreaterThan(0);

    // Subscribe to SSE events to check ticket.deleted event
    const sseRes = await testApp.app.request("/api/events?project=DEL");
    expect(sseRes.status).toBe(200);
    const ssePromise = readSseEvents(sseRes, 1);

    // 2. REST delete returns 204
    const delRes = await testApp.request("DELETE", "/api/tickets/DEL-2", undefined, "diana");
    expect(delRes.status).toBe(204);

    // Verify ticket.deleted event emitted
    const events = await ssePromise;
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("ticket.deleted");
    expect(events[0].event).toBe("ticket.deleted");
    expect(events[0].projectKey).toBe("DEL");
    expect(events[0].ticketKey).toBe("DEL-2");
    expect(events[0].actor).toBe("diana");

    // 3. Ticket is gone (404)
    const getRes = await testApp.request("GET", "/api/tickets/DEL-2");
    expect(getRes.status).toBe(404);

    // Deleting again returns 404
    const delAgainRes = await testApp.request("DELETE", "/api/tickets/DEL-2");
    expect(delAgainRes.status).toBe(404);

    // 4. Activity is gone
    const activityCountAfter = await testApp.ctx.db.get<{ count: number | string }>(
      "SELECT COUNT(*) as count FROM activity WHERE ticket_id = ?",
      row2!.id
    );
    expect(Number(activityCountAfter?.count)).toBe(0);

    // 5. Ranks of remaining tickets in that column are dense 0..n-1
    const remainingCards = await testApp.request("GET", "/api/projects/DEL/tickets?column=backlog");
    expect(remainingCards.status).toBe(200);
    expect(remainingCards.body).toHaveLength(2);
    expect(remainingCards.body[0].key).toBe("DEL-1");
    expect(remainingCards.body[0].rank).toBe(0);
    expect(remainingCards.body[1].key).toBe("DEL-3");
    expect(remainingCards.body[1].rank).toBe(1);

    // 6. Next created ticket gets a new number (not reused)
    const t4 = await testApp.request("POST", "/api/projects/DEL/tickets", { title: "Ticket 4" }, "alice");
    expect(t4.status).toBe(201);
    expect(t4.body.key).toBe("DEL-4");
    expect(t4.body.number).toBe(4);
    expect(t4.body.rank).toBe(2);
  });

  test("MCP tool list contains no tool whose name includes delete", async () => {
    const client = await connectMcp(testApp.app);
    try {
      const { tools } = await client.listTools();
      const deleteTools = tools.filter((t) => t.name.toLowerCase().includes("delete"));
      expect(deleteTools).toHaveLength(0);
    } finally {
      await client.close();
    }
  });

  test("runCli([ticket, delete, X-1]) exits 2 (unknown command)", async () => {
    const res = await runCli(["ticket", "delete", "X-1"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(res.code).toBe(2);
  });
});


