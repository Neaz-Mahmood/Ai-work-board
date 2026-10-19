import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { makeTestApp, readSseEvents, type TestApp } from "./helpers.ts";
import { connectMcp, callTool } from "./mcp-helpers.ts";

describe("Live updates (SSE) events", () => {
  let testApp: TestApp;
  let tempBase: string;
  let repoDirAwb: string;
  let repoDirOther: string;

  beforeAll(async () => {
    testApp = await makeTestApp();
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "awb-events-test-"));
    repoDirAwb = path.join(tempBase, "awb-repo");
    repoDirOther = path.join(tempBase, "other-repo");
    fs.mkdirSync(repoDirAwb, { recursive: true });
    fs.mkdirSync(repoDirOther, { recursive: true });

    await testApp.request("POST", "/api/projects", {
      path: repoDirAwb,
      name: "AWB Project",
      key: "AWB",
    });

    await testApp.request("POST", "/api/projects", {
      path: repoDirOther,
      name: "Other Project",
      key: "OTHER",
    });
  });

  afterAll(async () => {
    await testApp.close();
    fs.rmSync(tempBase, { recursive: true, force: true });
  });

  test("create Ticket via REST emits ticket.created event", async () => {
    const sseRes = await testApp.app.request("/api/events?project=AWB");
    expect(sseRes.status).toBe(200);

    const ssePromise = readSseEvents(sseRes, 1);

    const res = await testApp.request(
      "POST",
      "/api/projects/AWB/tickets",
      { title: "REST Ticket" },
      "alice"
    );
    expect(res.status).toBe(201);

    const events = await ssePromise;
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("ticket.created");
    expect(events[0].type).toBe("ticket.created");
    expect(events[0].projectKey).toBe("AWB");
    expect(events[0].ticketKey).toBe(res.body.key);
    expect(events[0].actor).toBe("alice");
    expect(typeof events[0].at).toBe("string");
  });

  test("update Ticket via REST emits ticket.updated event", async () => {
    const sseRes = await testApp.app.request("/api/events?project=AWB");
    const ssePromise = readSseEvents(sseRes, 1);

    const res = await testApp.request(
      "PATCH",
      "/api/tickets/AWB-1",
      { title: "Updated REST Ticket" },
      "bob"
    );
    expect(res.status).toBe(200);

    const events = await ssePromise;
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("ticket.updated");
    expect(events[0].type).toBe("ticket.updated");
    expect(events[0].projectKey).toBe("AWB");
    expect(events[0].ticketKey).toBe("AWB-1");
    expect(events[0].actor).toBe("bob");
    expect(typeof events[0].at).toBe("string");
  });

  test("move Ticket via REST emits ticket.moved event", async () => {
    const sseRes = await testApp.app.request("/api/events?project=AWB");
    const ssePromise = readSseEvents(sseRes, 1);

    const res = await testApp.request(
      "POST",
      "/api/tickets/AWB-1/move",
      { column: "in_progress" },
      "carol"
    );
    expect(res.status).toBe(200);

    const events = await ssePromise;
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("ticket.moved");
    expect(events[0].type).toBe("ticket.moved");
    expect(events[0].projectKey).toBe("AWB");
    expect(events[0].ticketKey).toBe("AWB-1");
    expect(events[0].actor).toBe("carol");
    expect(typeof events[0].at).toBe("string");
  });

  test("Ticket created via MCP emits ticket.created with actor = the MCP actor", async () => {
    const sseRes = await testApp.app.request("/api/events?project=AWB");
    const ssePromise = readSseEvents(sseRes, 1);

    const client = await connectMcp(testApp.app, "agent-claude");
    try {
      const toolRes = await callTool(client, "create_ticket", {
        project: "AWB",
        title: "MCP Created Ticket",
      });
      expect(toolRes.isError).toBe(false);
      expect(toolRes.data.key).toBe("AWB-2");

      const events = await ssePromise;
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe("ticket.created");
      expect(events[0].type).toBe("ticket.created");
      expect(events[0].projectKey).toBe("AWB");
      expect(events[0].ticketKey).toBe("AWB-2");
      expect(events[0].actor).toBe("agent-claude");
      expect(typeof events[0].at).toBe("string");
    } finally {
      await client.close();
    }
  });

  test("no event for a no-op update", async () => {
    const sseRes = await testApp.app.request("/api/events?project=AWB");
    const ssePromise = readSseEvents(sseRes, 1, 150);

    // Patch with identical title
    const res = await testApp.request(
      "PATCH",
      "/api/tickets/AWB-1",
      { title: "Updated REST Ticket" },
      "dave"
    );
    expect(res.status).toBe(200);

    const events = await ssePromise;
    expect(events).toHaveLength(0);
  });

  test("events for another Project are filtered out", async () => {
    const sseRes = await testApp.app.request("/api/events?project=AWB");
    const ssePromise = readSseEvents(sseRes, 1, 150);

    // Create a ticket on OTHER project
    const res = await testApp.request(
      "POST",
      "/api/projects/OTHER/tickets",
      { title: "Other Project Ticket" },
      "eve"
    );
    expect(res.status).toBe(201);

    const events = await ssePromise;
    expect(events).toHaveLength(0);
  });

  test("heartbeat ping arrives with sseHeartbeatMs: 50", async () => {
    const pingApp = await makeTestApp({ sseHeartbeatMs: 50 });
    try {
      const sseRes = await pingApp.app.request("/api/events?project=AWB");
      expect(sseRes.status).toBe(200);

      const events = await readSseEvents(sseRes, 1, 500);
      expect(events).toHaveLength(1);
      expect(events[0].comment).toBe("ping");
      expect(events[0].raw).toContain(": ping");
    } finally {
      await pingApp.close();
    }
  });

  test("events are emitted only after commit (a failing create emits nothing)", async () => {
    const sseRes = await testApp.app.request("/api/events?project=AWB");
    const ssePromise = readSseEvents(sseRes, 1, 150);

    // Failing create with empty title (validation failure)
    const res = await testApp.request(
      "POST",
      "/api/projects/AWB/tickets",
      { title: "" },
      "frank"
    );
    expect(res.status).toBe(400);

    const events = await ssePromise;
    expect(events).toHaveLength(0);
  });
});
