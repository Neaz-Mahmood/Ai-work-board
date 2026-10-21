import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { makeTestApp, type TestApp } from "./helpers.ts";

describe("Tickets Edit and Move REST API", () => {
  let testApp: TestApp;
  let tempBase: string;
  let repoDir: string;

  beforeAll(async () => {
    testApp = await makeTestApp();
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "awb-tickets-edit-test-"));
    repoDir = path.join(tempBase, "repo-edit");
    fs.mkdirSync(repoDir, { recursive: true });

    await testApp.request("POST", "/api/projects", {
      path: repoDir,
      name: "Edit Project",
      key: "EDIT",
    });
  });

  afterAll(async () => {
    await testApp.close();
    fs.rmSync(tempBase, { recursive: true, force: true });
  });

  test("each field edit records the right Activity with the header Actor", async () => {
    // 1. Create initial ticket
    const createRes = await testApp.request(
      "POST",
      "/api/projects/EDIT/tickets",
      {
        title: "Original Title",
        description: "Original Description",
        priority: "low",
      },
      "creator-agent"
    );
    expect(createRes.status).toBe(201);
    const key = createRes.body.key;

    // 2. Edit title with actor alice
    const titleRes = await testApp.request(
      "PATCH",
      `/api/tickets/${key}`,
      { title: "New Title" },
      "alice"
    );
    expect(titleRes.status).toBe(200);
    expect(titleRes.body.title).toBe("New Title");
    const actTitle = titleRes.body.activity[titleRes.body.activity.length - 1];
    expect(actTitle).toMatchObject({
      actor: "alice",
      kind: "updated",
      payload: {
        field: "title",
        from: "Original Title",
        to: "New Title",
      },
    });

    // 3. Edit description with actor bob
    const descRes = await testApp.request(
      "PATCH",
      `/api/tickets/${key}`,
      { description: "New Description" },
      "bob"
    );
    expect(descRes.status).toBe(200);
    expect(descRes.body.description).toBe("New Description");
    const actDesc = descRes.body.activity[descRes.body.activity.length - 1];
    expect(actDesc).toMatchObject({
      actor: "bob",
      kind: "updated",
      payload: {
        field: "description",
        from: "Original Description",
        to: "New Description",
      },
    });

    // 4. Edit priority with actor carol
    const prioRes = await testApp.request(
      "PATCH",
      `/api/tickets/${key}`,
      { priority: "high" },
      "carol"
    );
    expect(prioRes.status).toBe(200);
    expect(prioRes.body.priority).toBe("high");
    const actPrio = prioRes.body.activity[prioRes.body.activity.length - 1];
    expect(actPrio).toMatchObject({
      actor: "carol",
      kind: "updated",
      payload: {
        field: "priority",
        from: "low",
        to: "high",
      },
    });

    // 5. Edit assignee with actor dave
    const assignRes = await testApp.request(
      "PATCH",
      `/api/tickets/${key}`,
      { assignee: "dave" },
      "eve"
    );
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.assignee).toBe("dave");
    const actAssign = assignRes.body.activity[assignRes.body.activity.length - 1];
    expect(actAssign).toMatchObject({
      actor: "eve",
      kind: "assigned",
      payload: {
        from: null,
        to: "dave",
      },
    });
  });

  test("no-op edit records nothing and does not bump updated_at", async () => {
    const createRes = await testApp.request(
      "POST",
      "/api/projects/EDIT/tickets",
      {
        title: "Noop Ticket",
        description: "Static Desc",
        priority: "medium",
      }
    );
    const key = createRes.body.key;
    const initialUpdatedAt = createRes.body.updatedAt;
    const initialActivityCount = createRes.body.activity.length;

    // 1. Same title
    const resSameTitle = await testApp.request(
      "PATCH",
      `/api/tickets/${key}`,
      { title: "Noop Ticket" }
    );
    expect(resSameTitle.status).toBe(200);
    expect(resSameTitle.body.updatedAt).toBe(initialUpdatedAt);
    expect(resSameTitle.body.activity).toHaveLength(initialActivityCount);

    // 2. Empty patch
    const resEmpty = await testApp.request(
      "PATCH",
      `/api/tickets/${key}`,
      {}
    );
    expect(resEmpty.status).toBe(200);
    expect(resEmpty.body.updatedAt).toBe(initialUpdatedAt);
    expect(resEmpty.body.activity).toHaveLength(initialActivityCount);

    // 3. Trimmed title identical
    const resTrimmed = await testApp.request(
      "PATCH",
      `/api/tickets/${key}`,
      { title: "   Noop Ticket   " }
    );
    expect(resTrimmed.status).toBe(200);
    expect(resTrimmed.body.updatedAt).toBe(initialUpdatedAt);
    expect(resTrimmed.body.activity).toHaveLength(initialActivityCount);
  });

  test("assignee set/unset and actor registration", async () => {
    const createRes = await testApp.request(
      "POST",
      "/api/projects/EDIT/tickets",
      { title: "Assignee Ticket" }
    );
    const key = createRes.body.key;
    expect(createRes.body.assignee).toBeNull();

    // Set assignee to "agent-alpha"
    const setRes1 = await testApp.request(
      "PATCH",
      `/api/tickets/${key}`,
      { assignee: "agent-alpha" },
      "lead-agent"
    );
    expect(setRes1.status).toBe(200);
    expect(setRes1.body.assignee).toBe("agent-alpha");
    expect(setRes1.body.activity[setRes1.body.activity.length - 1]).toMatchObject({
      actor: "lead-agent",
      kind: "assigned",
      payload: { from: null, to: "agent-alpha" },
    });

    // Verify agent-alpha is registered in actors
    const actorsRes = await testApp.request("GET", "/api/actors");
    const actorNames = actorsRes.body.map((a: any) => a.name);
    expect(actorNames).toContain("agent-alpha");

    // Change assignee to "agent-beta"
    const setRes2 = await testApp.request(
      "PATCH",
      `/api/tickets/${key}`,
      { assignee: "agent-beta" },
      "lead-agent"
    );
    expect(setRes2.status).toBe(200);
    expect(setRes2.body.assignee).toBe("agent-beta");
    expect(setRes2.body.activity[setRes2.body.activity.length - 1]).toMatchObject({
      actor: "lead-agent",
      kind: "assigned",
      payload: { from: "agent-alpha", to: "agent-beta" },
    });

    // Unset assignee using null
    const unsetRes = await testApp.request(
      "PATCH",
      `/api/tickets/${key}`,
      { assignee: null },
      "lead-agent"
    );
    expect(unsetRes.status).toBe(200);
    expect(unsetRes.body.assignee).toBeNull();
    expect(unsetRes.body.activity[unsetRes.body.activity.length - 1]).toMatchObject({
      actor: "lead-agent",
      kind: "assigned",
      payload: { from: "agent-beta", to: null },
    });
  });

  test("validation errors on PATCH and move", async () => {
    const createRes = await testApp.request(
      "POST",
      "/api/projects/EDIT/tickets",
      { title: "Validation Target" }
    );
    const key = createRes.body.key;

    // PATCH: empty title
    const resEmptyTitle = await testApp.request("PATCH", `/api/tickets/${key}`, {
      title: "   ",
    });
    expect(resEmptyTitle.status).toBe(400);
    expect(resEmptyTitle.body.error.code).toBe("VALIDATION");

    // PATCH: title too long (> 200)
    const resLongTitle = await testApp.request("PATCH", `/api/tickets/${key}`, {
      title: "a".repeat(201),
    });
    expect(resLongTitle.status).toBe(400);
    expect(resLongTitle.body.error.code).toBe("VALIDATION");

    // PATCH: description too long (> 50000)
    const resLongDesc = await testApp.request("PATCH", `/api/tickets/${key}`, {
      description: "a".repeat(50001),
    });
    expect(resLongDesc.status).toBe(400);
    expect(resLongDesc.body.error.code).toBe("VALIDATION");

    // PATCH: invalid priority
    const resBadPrio = await testApp.request("PATCH", `/api/tickets/${key}`, {
      priority: "super-urgent",
    });
    expect(resBadPrio.status).toBe(400);
    expect(resBadPrio.body.error.code).toBe("VALIDATION");

    // PATCH: invalid assignee
    const resBadAssignee = await testApp.request("PATCH", `/api/tickets/${key}`, {
      assignee: "invalid assignee with spaces",
    });
    expect(resBadAssignee.status).toBe(400);
    expect(resBadAssignee.body.error.code).toBe("VALIDATION");

    // PATCH: unknown field
    const resUnknown = await testApp.request("PATCH", `/api/tickets/${key}`, {
      unknownField: "foo",
    });
    expect(resUnknown.status).toBe(400);
    expect(resUnknown.body.error.code).toBe("VALIDATION");

    // PATCH: non-existent ticket
    const resNotFnd = await testApp.request("PATCH", "/api/tickets/EDIT-9999", {
      title: "Foo",
    });
    expect(resNotFnd.status).toBe(404);
    expect(resNotFnd.body.error.code).toBe("NOT_FOUND");

    // Move: non-existent ticket
    const resMoveNotFnd = await testApp.request(
      "POST",
      "/api/tickets/EDIT-9999/move",
      { column: "todo" }
    );
    expect(resMoveNotFnd.status).toBe(404);
    expect(resMoveNotFnd.body.error.code).toBe("NOT_FOUND");

    // Move: invalid column
    const resBadCol = await testApp.request(
      "POST",
      `/api/tickets/${key}/move`,
      { column: "non_existent_column" }
    );
    expect(resBadCol.status).toBe(400);
    expect(resBadCol.body.error.code).toBe("VALIDATION");

    // Move: non-integer position
    const resBadPos = await testApp.request(
      "POST",
      `/api/tickets/${key}/move`,
      { column: "todo", position: 1.5 }
    );
    expect(resBadPos.status).toBe(400);
    expect(resBadPos.body.error.code).toBe("VALIDATION");

    // Move: unknown field
    const resMoveUnknown = await testApp.request(
      "POST",
      `/api/tickets/${key}/move`,
      { column: "todo", extra: 42 }
    );
    expect(resMoveUnknown.status).toBe(400);
    expect(resMoveUnknown.body.error.code).toBe("VALIDATION");
  });

  test("move across Columns with and without position", async () => {
    // Fresh ticket in backlog
    const res1 = await testApp.request(
      "POST",
      "/api/projects/EDIT/tickets",
      { title: "Move Across 1" }
    );
    const key1 = res1.body.key;
    expect(res1.body.column).toBe("backlog");

    // Move key1 to todo without position -> bottom of todo (rank 0 since todo has no other tickets)
    const moveRes1 = await testApp.request(
      "POST",
      `/api/tickets/${key1}/move`,
      { column: "todo" },
      "mover-agent"
    );
    expect(moveRes1.status).toBe(200);
    expect(moveRes1.body.column).toBe("todo");
    expect(moveRes1.body.rank).toBe(0);
    expect(moveRes1.body.activity[moveRes1.body.activity.length - 1]).toMatchObject({
      actor: "mover-agent",
      kind: "moved",
      payload: { from: "backlog", to: "todo" },
    });

    // Create another ticket directly in todo
    const res2 = await testApp.request(
      "POST",
      "/api/projects/EDIT/tickets",
      { title: "Move Across 2", column: "todo" }
    );
    const key2 = res2.body.key;
    expect(res2.body.column).toBe("todo");
    expect(res2.body.rank).toBe(1);

    // Create a 3rd ticket in backlog
    const res3 = await testApp.request(
      "POST",
      "/api/projects/EDIT/tickets",
      { title: "Move Across 3", column: "backlog" }
    );
    const key3 = res3.body.key;

    // Move key3 into todo at position 0 (top)
    const moveRes3 = await testApp.request(
      "POST",
      `/api/tickets/${key3}/move`,
      { column: "todo", position: 0 },
      "alice"
    );
    expect(moveRes3.status).toBe(200);
    expect(moveRes3.body.column).toBe("todo");
    expect(moveRes3.body.rank).toBe(0);
    expect(moveRes3.body.activity[moveRes3.body.activity.length - 1]).toMatchObject({
      actor: "alice",
      kind: "moved",
      payload: { from: "backlog", to: "todo" },
    });

    // Check that key1 was shifted to 1, and key2 was shifted to 2
    const get1 = await testApp.request("GET", `/api/tickets/${key1}`);
    const get2 = await testApp.request("GET", `/api/tickets/${key2}`);
    expect(get1.body.rank).toBe(1);
    expect(get2.body.rank).toBe(2);
  });

  test("reorder within a Column", async () => {
    // Create Project REORDER to test dense reordering cleanly
    const reorderDir = path.join(tempBase, "repo-reorder");
    fs.mkdirSync(reorderDir, { recursive: true });
    await testApp.request("POST", "/api/projects", {
      path: reorderDir,
      name: "Reorder Project",
      key: "RORD",
    });

    // Create 3 tickets in in_progress: A, B, C (ranks 0, 1, 2)
    const tA = await testApp.request("POST", "/api/projects/RORD/tickets", {
      title: "Card A",
      column: "in_progress",
    });
    const tB = await testApp.request("POST", "/api/projects/RORD/tickets", {
      title: "Card B",
      column: "in_progress",
    });
    const tC = await testApp.request("POST", "/api/projects/RORD/tickets", {
      title: "Card C",
      column: "in_progress",
    });

    const keyA = tA.body.key;
    const keyB = tB.body.key;
    const keyC = tC.body.key;

    expect(tA.body.rank).toBe(0);
    expect(tB.body.rank).toBe(1);
    expect(tC.body.rank).toBe(2);

    // Reorder Card C to position 0 (top)
    const moveC = await testApp.request(
      "POST",
      `/api/tickets/${keyC}/move`,
      { column: "in_progress", position: 0 },
      "bob"
    );
    expect(moveC.status).toBe(200);
    expect(moveC.body.rank).toBe(0);
    expect(moveC.body.activity[moveC.body.activity.length - 1]).toMatchObject({
      actor: "bob",
      kind: "reranked",
      payload: { from: 2, to: 0 },
    });

    // Verify new ranks: C:0, A:1, B:2
    const getA1 = await testApp.request("GET", `/api/tickets/${keyA}`);
    const getB1 = await testApp.request("GET", `/api/tickets/${keyB}`);
    const getC1 = await testApp.request("GET", `/api/tickets/${keyC}`);
    expect(getC1.body.rank).toBe(0);
    expect(getA1.body.rank).toBe(1);
    expect(getB1.body.rank).toBe(2);

    // Move C to position 0 again -> no-op! Same position, no activity entry, updatedAt unchanged
    const updatedAtBefore = getC1.body.updatedAt;
    const actCountBefore = getC1.body.activity.length;
    const moveCNoop = await testApp.request(
      "POST",
      `/api/tickets/${keyC}/move`,
      { column: "in_progress", position: 0 },
      "bob"
    );
    expect(moveCNoop.status).toBe(200);
    expect(moveCNoop.body.updatedAt).toBe(updatedAtBefore);
    expect(moveCNoop.body.activity).toHaveLength(actCountBefore);
  });

  test("out-of-range positions are rejected rather than clamped", async () => {
    // Project CLMP
    const clampDir = path.join(tempBase, "repo-clamp");
    fs.mkdirSync(clampDir, { recursive: true });
    await testApp.request("POST", "/api/projects", {
      path: clampDir,
      name: "Clamp Project",
      key: "CLMP",
    });

    const t1 = await testApp.request("POST", "/api/projects/CLMP/tickets", {
      title: "Clamp 1",
      column: "todo",
    });
    const t2 = await testApp.request("POST", "/api/projects/CLMP/tickets", {
      title: "Clamp 2",
      column: "todo",
    });
    const key1 = t1.body.key;
    const key2 = t2.body.key;

    // Out-of-range positions are rejected, not clamped.
    const resNeg = await testApp.request(
      "POST",
      `/api/tickets/${key2}/move`,
      { column: "todo", position: -5 }
    );
    expect(resNeg.status).toBe(400);
    expect(resNeg.body.error.code).toBe("VALIDATION");

    // A rejected move must leave the ordering untouched.
    const getAfterNeg = await testApp.request("GET", `/api/tickets/${key1}`);
    expect(getAfterNeg.body.rank).toBe(0);
    const getKey2AfterNeg = await testApp.request("GET", `/api/tickets/${key2}`);
    expect(getKey2AfterNeg.body.rank).toBe(1);

    const resHuge = await testApp.request(
      "POST",
      `/api/tickets/${key2}/move`,
      { column: "todo", position: 999 }
    );
    expect(resHuge.status).toBe(400);
    expect(resHuge.body.error.code).toBe("VALIDATION");

    // A fractional position is rejected as well.
    const resFractional = await testApp.request(
      "POST",
      `/api/tickets/${key2}/move`,
      { column: "todo", position: 0.5 }
    );
    expect(resFractional.status).toBe(400);
    expect(resFractional.body.error.code).toBe("VALIDATION");

    // Ordering is still untouched after all three rejections.
    const get1Again = await testApp.request("GET", `/api/tickets/${key1}`);
    expect(get1Again.body.rank).toBe(0);
    const get2Again = await testApp.request("GET", `/api/tickets/${key2}`);
    expect(get2Again.body.rank).toBe(1);

    // An in-range position still moves the ticket.
    const resValid = await testApp.request(
      "POST",
      `/api/tickets/${key2}/move`,
      { column: "todo", position: 0 }
    );
    expect(resValid.status).toBe(200);
    expect(resValid.body.rank).toBe(0);
  });

  test("ranks stay dense 0..n-1 in both Columns after a sequence of moves", async () => {
    const denseDir = path.join(tempBase, "repo-dense");
    fs.mkdirSync(denseDir, { recursive: true });
    await testApp.request("POST", "/api/projects", {
      path: denseDir,
      name: "Dense Project",
      key: "DENS",
    });

    // Create 4 tickets in backlog and 3 tickets in in_progress
    const b0 = (await testApp.request("POST", "/api/projects/DENS/tickets", { title: "B0", column: "backlog" })).body.key;
    const b1 = (await testApp.request("POST", "/api/projects/DENS/tickets", { title: "B1", column: "backlog" })).body.key;
    const b2 = (await testApp.request("POST", "/api/projects/DENS/tickets", { title: "B2", column: "backlog" })).body.key;
    const b3 = (await testApp.request("POST", "/api/projects/DENS/tickets", { title: "B3", column: "backlog" })).body.key;

    const p0 = (await testApp.request("POST", "/api/projects/DENS/tickets", { title: "P0", column: "in_progress" })).body.key;
    const p1 = (await testApp.request("POST", "/api/projects/DENS/tickets", { title: "P1", column: "in_progress" })).body.key;
    const p2 = (await testApp.request("POST", "/api/projects/DENS/tickets", { title: "P2", column: "in_progress" })).body.key;

    // Sequence of moves
    // 1. Move B1 to in_progress at position 1
    await testApp.request("POST", `/api/tickets/${b1}/move`, { column: "in_progress", position: 1 });
    // 2. Move P2 to backlog without position (bottom)
    await testApp.request("POST", `/api/tickets/${p2}/move`, { column: "backlog" });
    // 3. Move B3 to in_progress at position 0 (top)
    await testApp.request("POST", `/api/tickets/${b3}/move`, { column: "in_progress", position: 0 });
    // 4. Reorder within in_progress: move B1 to position 99 (bottom clamp)
    await testApp.request("POST", `/api/tickets/${b1}/move`, { column: "in_progress", position: 99 });
    // 5. Move P0 from in_progress to backlog at position 0
    await testApp.request("POST", `/api/tickets/${p0}/move`, { column: "backlog", position: 0 });

    // Verify the board dense ranks
    const boardRes = await testApp.request("GET", "/api/projects/DENS/board");
    expect(boardRes.status).toBe(200);

    const backlogTickets = boardRes.body.columns.find((c: any) => c.id === "backlog").tickets;
    const inProgressTickets = boardRes.body.columns.find((c: any) => c.id === "in_progress").tickets;

    // Verify backlog ranks
    expect(backlogTickets.length).toBeGreaterThan(0);
    const backlogRanks = backlogTickets.map((t: any) => t.rank);
    const expectedBacklogRanks = Array.from({ length: backlogTickets.length }, (_, i) => i);
    expect(backlogRanks).toEqual(expectedBacklogRanks);

    // Verify in_progress ranks
    expect(inProgressTickets.length).toBeGreaterThan(0);
    const inProgressRanks = inProgressTickets.map((t: any) => t.rank);
    const expectedInProgressRanks = Array.from({ length: inProgressTickets.length }, (_, i) => i);
    expect(inProgressRanks).toEqual(expectedInProgressRanks);
  });

  test("any Column -> any Column allowed (e.g. Backlog -> Done, Done -> Backlog)", async () => {
    const res = await testApp.request(
      "POST",
      "/api/projects/EDIT/tickets",
      { title: "Any Column Move", column: "backlog" }
    );
    const key = res.body.key;

    // Move from backlog to done
    const toDone = await testApp.request(
      "POST",
      `/api/tickets/${key}/move`,
      { column: "done" },
      "closer"
    );
    expect(toDone.status).toBe(200);
    expect(toDone.body.column).toBe("done");
    expect(toDone.body.activity[toDone.body.activity.length - 1]).toMatchObject({
      actor: "closer",
      kind: "moved",
      payload: { from: "backlog", to: "done" },
    });

    // Move from done straight to backlog
    const toBacklog = await testApp.request(
      "POST",
      `/api/tickets/${key}/move`,
      { column: "backlog" },
      "reopener"
    );
    expect(toBacklog.status).toBe(200);
    expect(toBacklog.body.column).toBe("backlog");
    expect(toBacklog.body.activity[toBacklog.body.activity.length - 1]).toMatchObject({
      actor: "reopener",
      kind: "moved",
      payload: { from: "done", to: "backlog" },
    });
  });

  test("last write wins (two PATCHes, second value stays, both in Activity)", async () => {
    const res = await testApp.request(
      "POST",
      "/api/projects/EDIT/tickets",
      { title: "Initial Title" }
    );
    const key = res.body.key;

    // First PATCH
    const patch1 = await testApp.request(
      "PATCH",
      `/api/tickets/${key}`,
      { title: "First Writer" },
      "writer-1"
    );
    expect(patch1.status).toBe(200);
    expect(patch1.body.title).toBe("First Writer");

    // Second PATCH
    const patch2 = await testApp.request(
      "PATCH",
      `/api/tickets/${key}`,
      { title: "Second Writer" },
      "writer-2"
    );
    expect(patch2.status).toBe(200);
    expect(patch2.body.title).toBe("Second Writer");

    // Second value stays
    const current = await testApp.request("GET", `/api/tickets/${key}`);
    expect(current.body.title).toBe("Second Writer");

    // Both writes recorded in Activity
    const acts = current.body.activity;
    const write1 = acts.find((a: any) => a.actor === "writer-1");
    const write2 = acts.find((a: any) => a.actor === "writer-2");
    expect(write1).toMatchObject({
      actor: "writer-1",
      kind: "updated",
      payload: { field: "title", from: "Initial Title", to: "First Writer" },
    });
    expect(write2).toMatchObject({
      actor: "writer-2",
      kind: "updated",
      payload: { field: "title", from: "First Writer", to: "Second Writer" },
    });
  });
});
