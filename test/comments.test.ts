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

describe("Comments - REST, MCP, and CLI", () => {
  let testApp: TestApp;
  let server: TestServer;
  let tempBase: string;
  let repoDir: string;

  beforeAll(async () => {
    testApp = makeTestApp();
    server = await startTestServer();
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "awb-comments-test-"));
    const appRepoDir = path.join(tempBase, "app-repo");
    fs.mkdirSync(appRepoDir, { recursive: true });
    repoDir = path.join(tempBase, "comment-repo");
    fs.mkdirSync(repoDir, { recursive: true });

    // Set up projects
    const p1 = await testApp.request("POST", "/api/projects", {
      path: appRepoDir,
      name: "Comments App Project",
      key: "CMT",
    });
    expect(p1.status).toBe(201);

    const p2 = await server.request("POST", "/api/projects", {
      path: repoDir,
      name: "Comments Server Project",
      key: "CLI",
    });
    expect(p2.status).toBe(201);
  });

  afterAll(async () => {
    testApp.close();
    await server.close();
    fs.rmSync(tempBase, { recursive: true, force: true });
  });

  test("REST adding returns the comment with header / default Actor", async () => {
    // Create a ticket
    const createRes = await testApp.request(
      "POST",
      "/api/projects/CMT/tickets",
      { title: "Ticket for comment test" },
      "alice"
    );
    expect(createRes.status).toBe(201);
    const ticketKey = createRes.body.key;

    // 1. Add comment with explicit actor header
    const commentRes1 = await testApp.request(
      "POST",
      `/api/tickets/${ticketKey}/comments`,
      { body: "First comment by bob" },
      "bob"
    );
    expect(commentRes1.status).toBe(201);
    expect(commentRes1.body.id).toBeDefined();
    expect(commentRes1.body.actor).toBe("bob");
    expect(commentRes1.body.body).toBe("First comment by bob");
    expect(typeof commentRes1.body.createdAt).toBe("string");

    // 2. Add comment with default actor (no X-AWB-Actor header -> 'agent')
    const commentRes2 = await testApp.request(
      "POST",
      `/api/tickets/${ticketKey}/comments`,
      { body: "Second comment by default agent" }
    );
    expect(commentRes2.status).toBe(201);
    expect(commentRes2.body.actor).toBe("agent");
    expect(commentRes2.body.body).toBe("Second comment by default agent");
  });

  test("REST validation: empty body and oversized body return 400", async () => {
    const createRes = await testApp.request(
      "POST",
      "/api/projects/CMT/tickets",
      { title: "Ticket for validation" }
    );
    const ticketKey = createRes.body.key;

    // Empty body
    const emptyRes = await testApp.request(
      "POST",
      `/api/tickets/${ticketKey}/comments`,
      { body: "" }
    );
    expect(emptyRes.status).toBe(400);
    expect(emptyRes.body.error.code).toBe("VALIDATION");

    // Whitespace body
    const wsRes = await testApp.request(
      "POST",
      `/api/tickets/${ticketKey}/comments`,
      { body: "    \n   " }
    );
    expect(wsRes.status).toBe(400);
    expect(wsRes.body.error.code).toBe("VALIDATION");

    // Non-string body
    const nonStrRes = await testApp.request(
      "POST",
      `/api/tickets/${ticketKey}/comments`,
      { body: 12345 }
    );
    expect(nonStrRes.status).toBe(400);
    expect(nonStrRes.body.error.code).toBe("VALIDATION");

    // Missing body
    const missingRes = await testApp.request(
      "POST",
      `/api/tickets/${ticketKey}/comments`,
      {}
    );
    expect(missingRes.status).toBe(400);
    expect(missingRes.body.error.code).toBe("VALIDATION");

    // Oversized body (> 20,000 chars)
    const longBody = "a".repeat(20001);
    const longRes = await testApp.request(
      "POST",
      `/api/tickets/${ticketKey}/comments`,
      { body: longBody }
    );
    expect(longRes.status).toBe(400);
    expect(longRes.body.error.code).toBe("VALIDATION");
  });

  test("Comments appear in GET /api/tickets/:key in chronological order (oldest first)", async () => {
    const createRes = await testApp.request(
      "POST",
      "/api/projects/CMT/tickets",
      { title: "Ticket for ordering" }
    );
    const ticketKey = createRes.body.key;

    await testApp.request(
      "POST",
      `/api/tickets/${ticketKey}/comments`,
      { body: "Comment One" },
      "agent-1"
    );
    await testApp.request(
      "POST",
      `/api/tickets/${ticketKey}/comments`,
      { body: "Comment Two" },
      "agent-2"
    );
    await testApp.request(
      "POST",
      `/api/tickets/${ticketKey}/comments`,
      { body: "Comment Three" },
      "agent-3"
    );

    const getRes = await testApp.request("GET", `/api/tickets/${ticketKey}`);
    expect(getRes.status).toBe(200);
    const comments = getRes.body.comments;
    expect(comments).toHaveLength(3);
    expect(comments[0].body).toBe("Comment One");
    expect(comments[0].actor).toBe("agent-1");
    expect(comments[1].body).toBe("Comment Two");
    expect(comments[1].actor).toBe("agent-2");
    expect(comments[2].body).toBe("Comment Three");
    expect(comments[2].actor).toBe("agent-3");
    expect(comments[0].id).toBeLessThan(comments[1].id);
    expect(comments[1].id).toBeLessThan(comments[2].id);
  });

  test("Activity commented and ticket updated_at bumped", async () => {
    const createRes = await testApp.request(
      "POST",
      "/api/projects/CMT/tickets",
      { title: "Ticket for activity check" }
    );
    const ticketKey = createRes.body.key;
    const initialUpdatedAt = createRes.body.updatedAt;

    const commentRes = await testApp.request(
      "POST",
      `/api/tickets/${ticketKey}/comments`,
      { body: "Activity checking comment" },
      "reviewer"
    );
    expect(commentRes.status).toBe(201);
    const commentId = commentRes.body.id;

    const getRes = await testApp.request("GET", `/api/tickets/${ticketKey}`);
    expect(getRes.status).toBe(200);

    // Activity check
    const activity = getRes.body.activity;
    const commentActivity = activity.find((a: any) => a.kind === "commented");
    expect(commentActivity).toBeDefined();
    expect(commentActivity.actor).toBe("reviewer");
    expect(commentActivity.payload).toEqual({ commentId });

    // updated_at bumped
    expect(getRes.body.updatedAt).toBeDefined();
    expect(new Date(getRes.body.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(initialUpdatedAt).getTime()
    );
  });

  test("SSE event ticket.commented emitted on comment creation", async () => {
    const createRes = await testApp.request(
      "POST",
      "/api/projects/CMT/tickets",
      { title: "Ticket for SSE event" }
    );
    const ticketKey = createRes.body.key;

    // Connect to SSE
    const sseRes = await testApp.app.request("/api/events?project=CMT");
    expect(sseRes.status).toBe(200);
    const ssePromise = readSseEvents(sseRes, 1);

    // Add comment
    await testApp.request(
      "POST",
      `/api/tickets/${ticketKey}/comments`,
      { body: "SSE broadcast test comment" },
      "broadcast-agent"
    );

    const events = await ssePromise;
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("ticket.commented");
    expect(events[0].projectKey).toBe("CMT");
    expect(events[0].ticketKey).toBe(ticketKey);
    expect(events[0].actor).toBe("broadcast-agent");
    expect(events[0].at).toBeDefined();
  });

  test("Comments are removed when the Ticket is deleted", async () => {
    const createRes = await testApp.request(
      "POST",
      "/api/projects/CMT/tickets",
      { title: "Ticket to be deleted with comments" }
    );
    const ticketKey = createRes.body.key;

    const c1 = await testApp.request(
      "POST",
      `/api/tickets/${ticketKey}/comments`,
      { body: "Will be deleted 1" }
    );
    const c2 = await testApp.request(
      "POST",
      `/api/tickets/${ticketKey}/comments`,
      { body: "Will be deleted 2" }
    );

    // Verify comments exist in database
    const commentsBefore = testApp.ctx.db.all<{ id: number }>(
      "SELECT id FROM comments WHERE id IN (?, ?)",
      c1.body.id,
      c2.body.id
    );
    expect(commentsBefore).toHaveLength(2);

    // Delete ticket
    const delRes = await testApp.request("DELETE", `/api/tickets/${ticketKey}`);
    expect(delRes.status).toBe(204);

    // Verify comments are deleted
    const commentsAfter = testApp.ctx.db.all<{ id: number }>(
      "SELECT id FROM comments WHERE id IN (?, ?)",
      c1.body.id,
      c2.body.id
    );
    expect(commentsAfter).toHaveLength(0);
  });

  test("MCP tool add_comment adds comments and resolves actors", async () => {
    // Create ticket on testApp
    const createRes = await testApp.request(
      "POST",
      "/api/projects/CMT/tickets",
      { title: "Ticket for MCP add_comment" }
    );
    const ticketKey = createRes.body.key;

    // 1. MCP tool with default actor (agent)
    const client = await connectMcp(testApp.app);
    try {
      const res = await callTool(client, "add_comment", {
        ticketKey,
        body: "Comment from MCP default actor",
      });
      expect(res.isError).toBe(false);
      expect(res.data.id).toBeDefined();
      expect(res.data.actor).toBe("agent");
      expect(res.data.body).toBe("Comment from MCP default actor");
    } finally {
      await client.close();
    }

    // 2. MCP tool with URL actor and parameter override
    const clientUrl = await connectMcp(testApp.app, "claude-code");
    try {
      // Uses URL actor
      const resUrl = await callTool(clientUrl, "add_comment", {
        ticketKey,
        body: "Comment from claude-code",
      });
      expect(resUrl.isError).toBe(false);
      expect(resUrl.data.actor).toBe("claude-code");

      // Param actor overrides URL actor
      const resOverride = await callTool(clientUrl, "add_comment", {
        ticketKey,
        body: "Comment from overridden actor",
        actor: "cursor-agent",
      });
      expect(resOverride.isError).toBe(false);
      expect(resOverride.data.actor).toBe("cursor-agent");

      // Reject actor 'you' in MCP
      const resYou = await callTool(clientUrl, "add_comment", {
        ticketKey,
        body: "Attempting you actor in MCP",
        actor: "you",
      });
      expect(resYou.isError).toBe(true);
      expect(resYou.data).toContain("reserved for the board UI");

      // Empty body error
      const resEmpty = await callTool(clientUrl, "add_comment", {
        ticketKey,
        body: "",
      });
      expect(resEmpty.isError).toBe(true);
      expect(resEmpty.data).toContain("VALIDATION");
    } finally {
      await clientUrl.close();
    }
  });

  test("CLI ticket comment (text and --file) and ticket show listing comments", async () => {
    // 1. Create a ticket via CLI
    const createRes = await runCli(["ticket", "create", "CLI Comment Ticket"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(createRes.code).toBe(0);
    const ticketKey = createRes.stdout.trim().replace("Created ", "");

    // 2. Add comment with text positional
    const commentTextRes = await runCli(
      ["ticket", "comment", ticketKey, "First inline comment from CLI", "--as", "agent-x"],
      { url: server.url, cwd: repoDir }
    );
    expect(commentTextRes.code).toBe(0);
    expect(commentTextRes.stdout).toBe(`Commented on ${ticketKey}\n`);

    // 3. Add comment with --file
    const commentFilePath = path.join(tempBase, "cli-comment.md");
    fs.writeFileSync(commentFilePath, "# Detailed Report\n- Point 1\n- Point 2\n");
    const commentFileRes = await runCli(
      ["ticket", "comment", ticketKey, "--file", commentFilePath, "--as", "agent-y"],
      { url: server.url, cwd: repoDir }
    );
    expect(commentFileRes.code).toBe(0);
    expect(commentFileRes.stdout).toBe(`Commented on ${ticketKey}\n`);

    // 4. Ticket show displays comments
    const showRes = await runCli(["ticket", "show", ticketKey], {
      url: server.url,
      cwd: repoDir,
    });
    expect(showRes.code).toBe(0);
    expect(showRes.stdout).toContain("Comments:\n");
    expect(showRes.stdout).toContain(`--- agent-x at `);
    expect(showRes.stdout).toContain("First inline comment from CLI");
    expect(showRes.stdout).toContain(`--- agent-y at `);
    expect(showRes.stdout).toContain("# Detailed Report\n- Point 1\n- Point 2");

    // 5. CLI error cases
    // Missing key
    const resNoKey = await runCli(["ticket", "comment"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(resNoKey.code).toBe(2);

    // Nonexistent file
    const resBadFile = await runCli(
      ["ticket", "comment", ticketKey, "--file", "missing-file.md"],
      { url: server.url, cwd: repoDir }
    );
    expect(resBadFile.code).toBe(1);
    expect(resBadFile.stderr).toContain("Comment file not found");

    // Empty body
    const resEmpty = await runCli(
      ["ticket", "comment", ticketKey, ""],
      { url: server.url, cwd: repoDir }
    );
    expect(resEmpty.code).toBe(1);
    expect(resEmpty.stderr).toContain("between 1 and 20000");
  });

  test("No route for editing or deleting comments exists (PATCH/DELETE return 404)", async () => {
    const createRes = await testApp.request(
      "POST",
      "/api/projects/CMT/tickets",
      { title: "Ticket for 404 check" }
    );
    const ticketKey = createRes.body.key;

    const commentRes = await testApp.request(
      "POST",
      `/api/tickets/${ticketKey}/comments`,
      { body: "Permanent comment" }
    );
    const commentId = commentRes.body.id;

    // PATCH /api/tickets/:ticketKey/comments/:id -> 404
    const patchRes = await testApp.request(
      "PATCH",
      `/api/tickets/${ticketKey}/comments/${commentId}`,
      { body: "Attempted edit" }
    );
    expect(patchRes.status).toBe(404);

    // DELETE /api/tickets/:ticketKey/comments/:id -> 404
    const deleteRes = await testApp.request(
      "DELETE",
      `/api/tickets/${ticketKey}/comments/${commentId}`
    );
    expect(deleteRes.status).toBe(404);

    // PATCH /api/tickets/:ticketKey/comments -> 404
    const patchCollectionRes = await testApp.request(
      "PATCH",
      `/api/tickets/${ticketKey}/comments`,
      { body: "Attempted collection edit" }
    );
    expect(patchCollectionRes.status).toBe(404);

    // DELETE /api/tickets/:ticketKey/comments -> 404
    const deleteCollectionRes = await testApp.request(
      "DELETE",
      `/api/tickets/${ticketKey}/comments`
    );
    expect(deleteCollectionRes.status).toBe(404);
  });
});
