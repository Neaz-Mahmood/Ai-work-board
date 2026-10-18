import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { makeTestApp, type TestApp } from "./helpers.ts";

describe("Tickets REST API", () => {
  let testApp: TestApp;
  let tempBase: string;
  let repoA: string;
  let repoB: string;

  beforeAll(async () => {
    testApp = await makeTestApp();
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "awb-tickets-test-"));
    repoA = path.join(tempBase, "repo-a");
    repoB = path.join(tempBase, "repo-b");
    fs.mkdirSync(repoA, { recursive: true });
    fs.mkdirSync(repoB, { recursive: true });

    await testApp.request("POST", "/api/projects", {
      path: repoA,
      name: "Project A",
      key: "PRJA",
    });

    await testApp.request("POST", "/api/projects", {
      path: repoB,
      name: "Project B",
      key: "PRJB",
    });
  });

  afterAll(async () => {
    await testApp.close();
    fs.rmSync(tempBase, { recursive: true, force: true });
  });

  test("ticket creation with defaults", async () => {
    const res = await testApp.request(
      "POST",
      "/api/projects/PRJA/tickets",
      {
        title: "First default ticket",
      }
    );

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      key: "PRJA-1",
      title: "First default ticket",
      description: "",
      column: "backlog",
      rank: 0,
      priority: "medium",
      feature: null,
      assignee: null,
      blocked: false,
      needsAttention: null,
      projectKey: "PRJA",
      number: 1,
      blockers: [],
      blocks: [],
      comments: [],
    });
    expect(res.body.createdAt).toBeDefined();
    expect(res.body.updatedAt).toBeDefined();
    expect(res.body.activity).toHaveLength(1);
    expect(res.body.activity[0]).toMatchObject({
      actor: "agent",
      kind: "created",
      payload: { column: "backlog" },
    });
  });

  test("keys increase per Project and are independent between Projects", async () => {
    // PRJA already has PRJA-1
    const resA2 = await testApp.request(
      "POST",
      "/api/projects/PRJA/tickets",
      { title: "Second ticket in A" }
    );
    expect(resA2.status).toBe(201);
    expect(resA2.body.key).toBe("PRJA-2");
    expect(resA2.body.number).toBe(2);

    // PRJB starts from 1
    const resB1 = await testApp.request(
      "POST",
      "/api/projects/PRJB/tickets",
      { title: "First ticket in B" }
    );
    expect(resB1.status).toBe(201);
    expect(resB1.body.key).toBe("PRJB-1");
    expect(resB1.body.number).toBe(1);

    const resB2 = await testApp.request(
      "POST",
      "/api/projects/PRJB/tickets",
      { title: "Second ticket in B" }
    );
    expect(resB2.status).toBe(201);
    expect(resB2.body.key).toBe("PRJB-2");
    expect(resB2.body.number).toBe(2);
  });

  test("numbers are not reused after a Ticket is deleted directly from DB", async () => {
    const prjBRow = testApp.ctx.db.get<{ id: number }>(
      "SELECT id FROM projects WHERE key = 'PRJB'"
    );
    expect(prjBRow).toBeDefined();

    // Delete ticket 2 directly from DB
    testApp.ctx.db.run(
      "DELETE FROM tickets WHERE project_id = ? AND number = ?",
      prjBRow!.id,
      2
    );

    // Next created ticket should get number 3, NOT 2
    const resB3 = await testApp.request(
      "POST",
      "/api/projects/PRJB/tickets",
      { title: "Third ticket in B after delete" }
    );
    expect(resB3.status).toBe(201);
    expect(resB3.body.key).toBe("PRJB-3");
    expect(resB3.body.number).toBe(3);
  });

  test("new Tickets go to the bottom of their Column (rank)", async () => {
    const repoC = path.join(tempBase, "repo-c");
    fs.mkdirSync(repoC, { recursive: true });
    await testApp.request("POST", "/api/projects", {
      path: repoC,
      name: "Project C",
      key: "PRJC",
    });

    // 1. First ticket in backlog -> rank 0
    const t1 = await testApp.request("POST", "/api/projects/PRJC/tickets", {
      title: "Backlog 1",
      column: "backlog",
    });
    expect(t1.body.rank).toBe(0);

    // 2. Second ticket in backlog -> rank 1
    const t2 = await testApp.request("POST", "/api/projects/PRJC/tickets", {
      title: "Backlog 2",
      column: "backlog",
    });
    expect(t2.body.rank).toBe(1);

    // 3. First ticket in todo -> rank 0
    const t3 = await testApp.request("POST", "/api/projects/PRJC/tickets", {
      title: "Todo 1",
      column: "todo",
    });
    expect(t3.body.rank).toBe(0);

    // 4. Third ticket in backlog -> rank 2
    const t4 = await testApp.request("POST", "/api/projects/PRJC/tickets", {
      title: "Backlog 3",
      column: "backlog",
    });
    expect(t4.body.rank).toBe(2);

    // 5. Second ticket in todo -> rank 1
    const t5 = await testApp.request("POST", "/api/projects/PRJC/tickets", {
      title: "Todo 2",
      column: "todo",
    });
    expect(t5.body.rank).toBe(1);
  });

  test("validation errors on ticket create and get", async () => {
    // Missing/empty title
    const resEmptyTitle = await testApp.request(
      "POST",
      "/api/projects/PRJA/tickets",
      { title: "   " }
    );
    expect(resEmptyTitle.status).toBe(400);
    expect(resEmptyTitle.body.error.code).toBe("VALIDATION");

    // Title too long (> 200)
    const resLongTitle = await testApp.request(
      "POST",
      "/api/projects/PRJA/tickets",
      { title: "a".repeat(201) }
    );
    expect(resLongTitle.status).toBe(400);
    expect(resLongTitle.body.error.code).toBe("VALIDATION");

    // Description too long (> 50000)
    const resLongDesc = await testApp.request(
      "POST",
      "/api/projects/PRJA/tickets",
      { title: "Valid title", description: "x".repeat(50001) }
    );
    expect(resLongDesc.status).toBe(400);
    expect(resLongDesc.body.error.code).toBe("VALIDATION");

    // Invalid column
    const resBadCol = await testApp.request(
      "POST",
      "/api/projects/PRJA/tickets",
      { title: "Valid title", column: "invalid_col" }
    );
    expect(resBadCol.status).toBe(400);
    expect(resBadCol.body.error.code).toBe("VALIDATION");

    // Invalid priority
    const resBadPri = await testApp.request(
      "POST",
      "/api/projects/PRJA/tickets",
      { title: "Valid title", priority: "critical" }
    );
    expect(resBadPri.status).toBe(400);
    expect(resBadPri.body.error.code).toBe("VALIDATION");

    // Invalid assignee name
    const resBadAssignee = await testApp.request(
      "POST",
      "/api/projects/PRJA/tickets",
      { title: "Valid title", assignee: "invalid actor with space!" }
    );
    expect(resBadAssignee.status).toBe(400);
    expect(resBadAssignee.body.error.code).toBe("VALIDATION");

    // Project not found on create
    const resNoProject = await testApp.request(
      "POST",
      "/api/projects/NONEXIST/tickets",
      { title: "Valid title" }
    );
    expect(resNoProject.status).toBe(404);
    expect(resNoProject.body.error.code).toBe("NOT_FOUND");

    // Ticket not found on get
    const resNoTicket = await testApp.request(
      "GET",
      "/api/tickets/PRJA-9999"
    );
    expect(resNoTicket.status).toBe(404);
    expect(resNoTicket.body.error.code).toBe("NOT_FOUND");

    // Malformed ticket key on get
    const resBadKey = await testApp.request(
      "GET",
      "/api/tickets/MALFORMED"
    );
    expect(resBadKey.status).toBe(404);
    expect(resBadKey.body.error.code).toBe("NOT_FOUND");
  });

  test("get ticket with activity and case-insensitive project key", async () => {
    const created = await testApp.request(
      "POST",
      "/api/projects/PRJA/tickets",
      {
        title: "Activity test ticket",
        description: "Ticket with markdown description",
        priority: "high",
        column: "todo",
        assignee: "alice",
      },
      "agent-creator"
    );
    expect(created.status).toBe(201);
    const key = created.body.key;

    // Retrieve using lower case project key in ticket key
    const resLower = await testApp.request("GET", `/api/tickets/${key.toLowerCase()}`);
    expect(resLower.status).toBe(200);
    expect(resLower.body.key).toBe(key);
    expect(resLower.body.title).toBe("Activity test ticket");
    expect(resLower.body.description).toBe("Ticket with markdown description");
    expect(resLower.body.priority).toBe("high");
    expect(resLower.body.column).toBe("todo");
    expect(resLower.body.assignee).toBe("alice");
    expect(resLower.body.activity).toHaveLength(1);
    expect(resLower.body.activity[0].actor).toBe("agent-creator");
    expect(resLower.body.activity[0].kind).toBe("created");
    expect(resLower.body.activity[0].payload).toEqual({ column: "todo" });
  });

  test("board shape has all five Columns in order, counts, and actors", async () => {
    const res = await testApp.request("GET", "/api/projects/PRJC/board");
    expect(res.status).toBe(200);

    const board = res.body;
    expect(board.project.key).toBe("PRJC");
    expect(board.features).toEqual([]);
    expect(Array.isArray(board.actors)).toBe(true);

    expect(board.columns).toHaveLength(5);
    expect(board.columns.map((c: any) => c.id)).toEqual([
      "backlog",
      "todo",
      "in_progress",
      "in_review",
      "done",
    ]);
    expect(board.columns.map((c: any) => c.name)).toEqual([
      "Backlog",
      "To Do",
      "In Progress",
      "In Review",
      "Done",
    ]);

    // PRJC has 3 backlog, 2 todo, 0 in_progress, 0 in_review, 0 done
    const backlogCol = board.columns.find((c: any) => c.id === "backlog");
    expect(backlogCol.tickets).toHaveLength(3);
    expect(backlogCol.tickets[0].rank).toBe(0);
    expect(backlogCol.tickets[1].rank).toBe(1);
    expect(backlogCol.tickets[2].rank).toBe(2);

    const todoCol = board.columns.find((c: any) => c.id === "todo");
    expect(todoCol.tickets).toHaveLength(2);
    expect(todoCol.tickets[0].rank).toBe(0);
    expect(todoCol.tickets[1].rank).toBe(1);

    const inProgressCol = board.columns.find((c: any) => c.id === "in_progress");
    expect(inProgressCol.tickets).toEqual([]);

    const doneCol = board.columns.find((c: any) => c.id === "done");
    expect(doneCol.tickets).toEqual([]);
  });

  test("project counts on list and get responses", async () => {
    // Get single project
    const getRes = await testApp.request("GET", "/api/projects/PRJC");
    expect(getRes.status).toBe(200);
    expect(getRes.body.counts).toEqual({
      backlog: 3,
      todo: 2,
      in_progress: 0,
      in_review: 0,
      done: 0,
    });

    // List projects
    const listRes = await testApp.request("GET", "/api/projects");
    expect(listRes.status).toBe(200);
    const prjCInList = listRes.body.find((p: any) => p.key === "PRJC");
    expect(prjCInList).toBeDefined();
    expect(prjCInList.counts).toEqual({
      backlog: 3,
      todo: 2,
      in_progress: 0,
      in_review: 0,
      done: 0,
    });
  });

  test("listTickets with q, column, and assignee filters", async () => {
    const repoFilter = path.join(tempBase, "repo-filter");
    fs.mkdirSync(repoFilter, { recursive: true });
    await testApp.request("POST", "/api/projects", {
      path: repoFilter,
      name: "Filter Project",
      key: "FILT",
    });

    await testApp.request("POST", "/api/projects/FILT/tickets", {
      title: "Apple authentication bug",
      description: "OAuth with apple fails",
      column: "backlog",
      assignee: "alice",
    });

    await testApp.request("POST", "/api/projects/FILT/tickets", {
      title: "Banana payment processing",
      description: "Stripe webhook handling",
      column: "todo",
      assignee: "bob",
    });

    await testApp.request("POST", "/api/projects/FILT/tickets", {
      title: "Cherry dashboard view",
      description: "User dashboard graphs",
      column: "in_progress",
      assignee: "alice",
    });

    // 1. No filter -> all 3
    const all = await testApp.request("GET", "/api/projects/FILT/tickets");
    expect(all.status).toBe(200);
    expect(all.body).toHaveLength(3);

    // 2. Filter by column=todo -> only Banana
    const colTodo = await testApp.request("GET", "/api/projects/FILT/tickets?column=todo");
    expect(colTodo.status).toBe(200);
    expect(colTodo.body).toHaveLength(1);
    expect(colTodo.body[0].title).toBe("Banana payment processing");

    // 3. Filter by assignee=alice -> Apple and Cherry
    const byAlice = await testApp.request("GET", "/api/projects/FILT/tickets?assignee=alice");
    expect(byAlice.status).toBe(200);
    expect(byAlice.body).toHaveLength(2);
    expect(byAlice.body.map((c: any) => c.title)).toEqual([
      "Apple authentication bug",
      "Cherry dashboard view",
    ]);

    // 4. Query matching title substring case-insensitively
    const qTitle = await testApp.request("GET", "/api/projects/FILT/tickets?q=BANANA");
    expect(qTitle.status).toBe(200);
    expect(qTitle.body).toHaveLength(1);
    expect(qTitle.body[0].title).toBe("Banana payment processing");

    // 5. Query matching description substring case-insensitively
    const qDesc = await testApp.request("GET", "/api/projects/FILT/tickets?q=oauth");
    expect(qDesc.status).toBe(200);
    expect(qDesc.body).toHaveLength(1);
    expect(qDesc.body[0].title).toBe("Apple authentication bug");

    // 6. Query matching key substring
    const qKey = await testApp.request("GET", "/api/projects/FILT/tickets?q=FILT-3");
    expect(qKey.status).toBe(200);
    expect(qKey.body).toHaveLength(1);
    expect(qKey.body[0].title).toBe("Cherry dashboard view");
  });

  test("Actor handling: header, agent fallback, you allowed in UI REST, actor colors", async () => {
    // Creator with header
    const resWithHeader = await testApp.request(
      "POST",
      "/api/projects/PRJA/tickets",
      { title: "Header actor ticket" },
      "custom-bot"
    );
    expect(resWithHeader.status).toBe(201);
    expect(resWithHeader.body.activity[0].actor).toBe("custom-bot");

    // Creator without header -> fallback to agent
    const resNoHeader = await testApp.request(
      "POST",
      "/api/projects/PRJA/tickets",
      { title: "No header ticket" }
    );
    expect(resNoHeader.status).toBe(201);
    expect(resNoHeader.body.activity[0].actor).toBe("agent");

    // Creator with 'you' header -> allowed in REST API
    const resYou = await testApp.request(
      "POST",
      "/api/projects/PRJA/tickets",
      { title: "UI user ticket" },
      "you"
    );
    expect(resYou.status).toBe(201);
    expect(resYou.body.activity[0].actor).toBe("you");

    // Invalid actor in header -> 400 VALIDATION
    const resBadHeader = await testApp.request(
      "POST",
      "/api/projects/PRJA/tickets",
      { title: "Bad actor ticket" },
      "invalid actor name!"
    );
    expect(resBadHeader.status).toBe(400);
    expect(resBadHeader.body.error.code).toBe("VALIDATION");

    // List actors
    const actorsRes = await testApp.request("GET", "/api/actors");
    expect(actorsRes.status).toBe(200);
    const actors = actorsRes.body;
    expect(Array.isArray(actors)).toBe(true);

    const youActor = actors.find((a: any) => a.name === "you");
    expect(youActor).toBeDefined();
    expect(youActor.color).toBe("#0052CC");

    const botActor = actors.find((a: any) => a.name === "custom-bot");
    expect(botActor).toBeDefined();
    expect(botActor.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});
