import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  makeTestApp,
  readSseEvents,
  runCli,
  startTestServer,
  type TestApp,
  type TestServer,
} from "./helpers.ts";
import { connectMcp, callTool } from "./mcp-helpers.ts";

describe("Needs Attention - Domain, REST, MCP, CLI, and UI mappings", () => {
  let testApp: TestApp;
  let server: TestServer;
  let tempBase: string;
  let appRepoDir: string;
  let serverRepoDir: string;

  beforeAll(async () => {
    testApp = await makeTestApp();
    server = await startTestServer();
    tempBase = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "awb-attention-test-")));
    appRepoDir = path.join(tempBase, "app-repo");
    fs.mkdirSync(appRepoDir, { recursive: true });
    serverRepoDir = path.join(tempBase, "server-repo");
    fs.mkdirSync(serverRepoDir, { recursive: true });

    const p1 = await testApp.request("POST", "/api/projects", {
      path: appRepoDir,
      name: "Attention App Project",
      key: "ATT",
    });
    expect(p1.status).toBe(201);

    const p2 = await server.request("POST", "/api/projects", {
      path: serverRepoDir,
      name: "Attention CLI Project",
      key: "CLI",
    });
    expect(p2.status).toBe(201);
  });

  afterAll(async () => {
    await testApp.close();
    await server.close();
    fs.rmSync(tempBase, { recursive: true, force: true });
  });

  test("REST set and clear with Actors: column and assignee unchanged, updatedAt bumped, activity recorded", async () => {
    // 1. Create ticket in in_progress with assignee
    const createRes = await testApp.request(
      "POST",
      "/api/projects/ATT/tickets",
      {
        title: "Test Attention Ticket",
        column: "in_progress",
        assignee: "alice",
      },
      "creator-agent"
    );
    expect(createRes.status).toBe(201);
    const ticketKey = createRes.body.key;
    const initialUpdatedAt = createRes.body.updatedAt;
    expect(createRes.body.needsAttention).toBeNull();
    expect(createRes.body.column).toBe("in_progress");
    expect(createRes.body.assignee).toBe("alice");

    // 2. Set needs attention via PUT
    const putRes = await testApp.request(
      "PUT",
      `/api/tickets/${ticketKey}/attention`,
      { reason: "Blocked waiting on human credentials" },
      "bob"
    );
    expect(putRes.status).toBe(200);
    expect(putRes.body.needsAttention).toBe("Blocked waiting on human credentials");
    expect(putRes.body.column).toBe("in_progress");
    expect(putRes.body.assignee).toBe("alice");
    expect(putRes.body.updatedAt).not.toBe(initialUpdatedAt);

    // Verify activity entry
    const getRes1 = await testApp.request("GET", `/api/tickets/${ticketKey}`);
    expect(getRes1.status).toBe(200);
    const flaggedAct = getRes1.body.activity.find((a: any) => a.kind === "attention_flagged");
    expect(flaggedAct).toBeDefined();
    expect(flaggedAct.actor).toBe("bob");
    expect(flaggedAct.payload).toEqual({ reason: "Blocked waiting on human credentials" });

    // 3. Clear needs attention via DELETE
    const flaggedUpdatedAt = putRes.body.updatedAt;
    const deleteRes = await testApp.request(
      "DELETE",
      `/api/tickets/${ticketKey}/attention`,
      undefined,
      "carol"
    );
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.needsAttention).toBeNull();
    expect(deleteRes.body.column).toBe("in_progress");
    expect(deleteRes.body.assignee).toBe("alice");
    expect(deleteRes.body.updatedAt).not.toBe(flaggedUpdatedAt);

    // Verify activity entry
    const getRes2 = await testApp.request("GET", `/api/tickets/${ticketKey}`);
    expect(getRes2.status).toBe(200);
    const clearedAct = getRes2.body.activity.find((a: any) => a.kind === "attention_cleared");
    expect(clearedAct).toBeDefined();
    expect(clearedAct.actor).toBe("carol");
    expect(clearedAct.payload).toEqual({ reason: "Blocked waiting on human credentials" });
  });

  test("REST validation: empty, whitespace-only, and over-long reason rejected (1-500 chars)", async () => {
    const createRes = await testApp.request(
      "POST",
      "/api/projects/ATT/tickets",
      { title: "Validation Ticket" }
    );
    const ticketKey = createRes.body.key;

    // Empty reason
    const resEmpty = await testApp.request(
      "PUT",
      `/api/tickets/${ticketKey}/attention`,
      { reason: "" }
    );
    expect(resEmpty.status).toBe(400);

    // Whitespace only
    const resWhitespace = await testApp.request(
      "PUT",
      `/api/tickets/${ticketKey}/attention`,
      { reason: "     " }
    );
    expect(resWhitespace.status).toBe(400);

    // Missing reason field / not string
    const resNoReason = await testApp.request(
      "PUT",
      `/api/tickets/${ticketKey}/attention`,
      {}
    );
    expect(resNoReason.status).toBe(400);

    // Over 500 characters
    const resOver500 = await testApp.request(
      "PUT",
      `/api/tickets/${ticketKey}/attention`,
      { reason: "x".repeat(501) }
    );
    expect(resOver500.status).toBe(400);

    // Exactly 500 characters with surrounding whitespace (trimmed length is 500)
    const exact500 = "y".repeat(500);
    const res500 = await testApp.request(
      "PUT",
      `/api/tickets/${ticketKey}/attention`,
      { reason: `  ${exact500}  ` }
    );
    expect(res500.status).toBe(200);
    expect(res500.body.needsAttention).toBe(exact500);
  });

  test("Re-flagging records a second entry and updates reason", async () => {
    const createRes = await testApp.request(
      "POST",
      "/api/projects/ATT/tickets",
      { title: "Re-flag Ticket" }
    );
    const ticketKey = createRes.body.key;

    // First flag
    await testApp.request(
      "PUT",
      `/api/tickets/${ticketKey}/attention`,
      { reason: "Reason 1" },
      "agent-1"
    );

    // Second flag with different reason
    await testApp.request(
      "PUT",
      `/api/tickets/${ticketKey}/attention`,
      { reason: "Reason 2" },
      "agent-2"
    );

    // Third flag with same reason
    await testApp.request(
      "PUT",
      `/api/tickets/${ticketKey}/attention`,
      { reason: "Reason 2" },
      "agent-3"
    );

    const getRes = await testApp.request("GET", `/api/tickets/${ticketKey}`);
    expect(getRes.body.needsAttention).toBe("Reason 2");

    const flaggedActivities = getRes.body.activity.filter(
      (a: any) => a.kind === "attention_flagged"
    );
    expect(flaggedActivities).toHaveLength(3);
    expect(flaggedActivities[0].payload.reason).toBe("Reason 1");
    expect(flaggedActivities[0].actor).toBe("agent-1");
    expect(flaggedActivities[1].payload.reason).toBe("Reason 2");
    expect(flaggedActivities[1].actor).toBe("agent-2");
    expect(flaggedActivities[2].payload.reason).toBe("Reason 2");
    expect(flaggedActivities[2].actor).toBe("agent-3");
  });

  test("Clearing an unflagged Ticket is a no-op", async () => {
    const createRes = await testApp.request(
      "POST",
      "/api/projects/ATT/tickets",
      { title: "Unflagged Ticket" }
    );
    const ticketKey = createRes.body.key;
    const initialUpdatedAt = createRes.body.updatedAt;

    // Attempt to clear an unflagged ticket
    const deleteRes = await testApp.request(
      "DELETE",
      `/api/tickets/${ticketKey}/attention`,
      undefined,
      "noop-actor"
    );
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.needsAttention).toBeNull();
    expect(deleteRes.body.updatedAt).toBe(initialUpdatedAt);

    // No activity should be added
    const getRes = await testApp.request("GET", `/api/tickets/${ticketKey}`);
    const clearActs = getRes.body.activity.filter((a: any) => a.kind === "attention_cleared");
    expect(clearActs).toHaveLength(0);
  });

  test("needsAttention appears on cards in GET /api/projects/:key/board", async () => {
    const createRes = await testApp.request(
      "POST",
      "/api/projects/ATT/tickets",
      { title: "Board Card Ticket" }
    );
    const ticketKey = createRes.body.key;

    // 1. Initial board: needsAttention is null
    const boardRes1 = await testApp.request("GET", "/api/projects/ATT/board");
    expect(boardRes1.status).toBe(200);
    const card1 = boardRes1.body.columns
      .flatMap((c: any) => c.tickets)
      .find((t: any) => t.key === ticketKey);
    expect(card1).toBeDefined();
    expect(card1.needsAttention).toBeNull();

    // 2. Set attention
    await testApp.request("PUT", `/api/tickets/${ticketKey}/attention`, {
      reason: "Need design approval",
    });

    const boardRes2 = await testApp.request("GET", "/api/projects/ATT/board");
    const card2 = boardRes2.body.columns
      .flatMap((c: any) => c.tickets)
      .find((t: any) => t.key === ticketKey);
    expect(card2).toBeDefined();
    expect(card2.needsAttention).toBe("Need design approval");

    // 3. Clear attention
    await testApp.request("DELETE", `/api/tickets/${ticketKey}/attention`);

    const boardRes3 = await testApp.request("GET", "/api/projects/ATT/board");
    const card3 = boardRes3.body.columns
      .flatMap((c: any) => c.tickets)
      .find((t: any) => t.key === ticketKey);
    expect(card3).toBeDefined();
    expect(card3.needsAttention).toBeNull();
  });

  test("ticket.updated events emitted on set and clear, and not on no-op clear", async () => {
    const createRes = await testApp.request(
      "POST",
      "/api/projects/ATT/tickets",
      { title: "Event Broadcast Ticket" }
    );
    const ticketKey = createRes.body.key;

    // 1. Set attention -> expect ticket.updated
    const sseRes1 = await testApp.app.request("/api/events?project=ATT");
    expect(sseRes1.status).toBe(200);
    const ssePromise1 = readSseEvents(sseRes1, 1);
    await testApp.request(
      "PUT",
      `/api/tickets/${ticketKey}/attention`,
      { reason: "Broadcast reason" },
      "event-agent"
    );
    const events1 = await ssePromise1;
    expect(events1).toHaveLength(1);
    expect(events1[0].type).toBe("ticket.updated");
    expect(events1[0].projectKey).toBe("ATT");
    expect(events1[0].ticketKey).toBe(ticketKey);
    expect(events1[0].actor).toBe("event-agent");

    // 2. Clear attention -> expect ticket.updated
    const sseRes2 = await testApp.app.request("/api/events?project=ATT");
    expect(sseRes2.status).toBe(200);
    const ssePromise2 = readSseEvents(sseRes2, 1);
    await testApp.request(
      "DELETE",
      `/api/tickets/${ticketKey}/attention`,
      undefined,
      "clearing-agent"
    );
    const events2 = await ssePromise2;
    expect(events2).toHaveLength(1);
    expect(events2[0].type).toBe("ticket.updated");
    expect(events2[0].projectKey).toBe("ATT");
    expect(events2[0].ticketKey).toBe(ticketKey);
    expect(events2[0].actor).toBe("clearing-agent");

    // 3. Clear unflagged ticket (no-op) -> expect no event
    const sseRes3 = await testApp.app.request("/api/events?project=ATT");
    expect(sseRes3.status).toBe(200);
    const ssePromise3 = readSseEvents(sseRes3, 1, 200);
    await testApp.request("DELETE", `/api/tickets/${ticketKey}/attention`);
    const events3 = await ssePromise3;
    expect(events3).toHaveLength(0);
  });

  test("MCP set_needs_attention and clear_needs_attention with actors", async () => {
    const createRes = await testApp.request(
      "POST",
      "/api/projects/ATT/tickets",
      {
        title: "MCP Attention Ticket",
        column: "todo",
        assignee: "worker-bob",
      }
    );
    const ticketKey = createRes.body.key;

    const client = await connectMcp(testApp.app, "mcp-default-agent");
    try {
      // 1. Set attention via MCP
      const setRes = await callTool(client, "set_needs_attention", {
        ticketKey,
        reason: "Stuck on external service dependency",
        actor: "mcp-actor-1",
      });
      expect(setRes.isError).toBe(false);
      expect(setRes.data.needsAttention).toBe("Stuck on external service dependency");
      expect(setRes.data.column).toBe("todo");
      expect(setRes.data.assignee).toBe("worker-bob");

      // Verify activity attribution
      const getRes1 = await testApp.request("GET", `/api/tickets/${ticketKey}`);
      const act1 = getRes1.body.activity.find((a: any) => a.kind === "attention_flagged");
      expect(act1.actor).toBe("mcp-actor-1");

      // 2. Clear attention via MCP
      const clearRes = await callTool(client, "clear_needs_attention", {
        ticketKey,
        actor: "mcp-actor-2",
      });
      expect(clearRes.isError).toBe(false);
      expect(clearRes.data.needsAttention).toBeNull();
      expect(clearRes.data.column).toBe("todo");
      expect(clearRes.data.assignee).toBe("worker-bob");

      // Verify activity attribution
      const getRes2 = await testApp.request("GET", `/api/tickets/${ticketKey}`);
      const act2 = getRes2.body.activity.find((a: any) => a.kind === "attention_cleared");
      expect(act2.actor).toBe("mcp-actor-2");

      // 3. Validation error via MCP
      const invalidRes = await callTool(client, "set_needs_attention", {
        ticketKey,
        reason: "   ",
      });
      expect(invalidRes.isError).toBe(true);
    } finally {
      await client.close();
    }
  });

  test("CLI ticket attention KEY REASON and --clear with actors, and ticket show formatting", async () => {
    // 1. Create a ticket on server project CLI
    const createCliRes = await runCli(
      ["ticket", "create", "CLI Flag Ticket", "--as", "setup-agent"],
      {
        url: server.url,
        cwd: serverRepoDir,
      }
    );
    expect(createCliRes.code).toBe(0);
    expect(createCliRes.stdout).toContain("Created CLI-1");

    // Initially show: does not print Needs attention
    const showInitial = await runCli(["ticket", "show", "CLI-1"], {
      url: server.url,
      cwd: serverRepoDir,
    });
    expect(showInitial.code).toBe(0);
    expect(showInitial.stdout).not.toContain("Needs attention:");

    // 2. Flag via CLI: awb ticket attention KEY REASON
    const flagRes = await runCli(
      ["ticket", "attention", "CLI-1", "Needs manual confirmation", "--as", "agent-flag"],
      {
        url: server.url,
        cwd: serverRepoDir,
      }
    );
    expect(flagRes.code).toBe(0);
    expect(flagRes.stdout).toBe("Flagged CLI-1\n");

    // Show ticket: prints Needs attention: <reason>
    const showFlagged = await runCli(["ticket", "show", "CLI-1"], {
      url: server.url,
      cwd: serverRepoDir,
    });
    expect(showFlagged.code).toBe(0);
    expect(showFlagged.stdout).toContain("Needs attention: Needs manual confirmation\n");

    // Verify actor attribution in activity
    const getRes1 = await server.request("GET", "/api/tickets/CLI-1");
    const actFlag = getRes1.body.activity.find((a: any) => a.kind === "attention_flagged");
    expect(actFlag).toBeDefined();
    expect(actFlag.actor).toBe("agent-flag");

    // 3. Clear via CLI: awb ticket attention KEY --clear
    const clearRes = await runCli(
      ["ticket", "attention", "CLI-1", "--clear", "--as", "agent-unflag"],
      {
        url: server.url,
        cwd: serverRepoDir,
      }
    );
    expect(clearRes.code).toBe(0);
    expect(clearRes.stdout).toBe("Cleared CLI-1\n");

    // Show ticket after clear: does not print Needs attention:
    const showCleared = await runCli(["ticket", "show", "CLI-1"], {
      url: server.url,
      cwd: serverRepoDir,
    });
    expect(showCleared.code).toBe(0);
    expect(showCleared.stdout).not.toContain("Needs attention:");

    // Verify actor attribution in activity
    const getRes2 = await server.request("GET", "/api/tickets/CLI-1");
    const actClear = getRes2.body.activity.find((a: any) => a.kind === "attention_cleared");
    expect(actClear).toBeDefined();
    expect(actClear.actor).toBe("agent-unflag");
    expect(actClear.payload).toEqual({ reason: "Needs manual confirmation" });

    // 4. CLI errors: missing key, missing reason
    const errMissingKey = await runCli(["ticket", "attention"], {
      url: server.url,
      cwd: serverRepoDir,
    });
    expect(errMissingKey.code).toBe(2);
    expect(errMissingKey.stderr).toContain("Error: Ticket key is required");

    const errMissingReason = await runCli(["ticket", "attention", "CLI-1"], {
      url: server.url,
      cwd: serverRepoDir,
    });
    expect(errMissingReason.code).toBe(2);
    expect(errMissingReason.stderr).toContain("Error: Attention reason is required");
  });
});
