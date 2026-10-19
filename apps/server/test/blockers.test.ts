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

describe("Blockers - Domain, REST, MCP, and CLI", () => {
  let testApp: TestApp;
  let server: TestServer;
  let tempBase: string;
  let appRepoDir: string;
  let otherRepoDir: string;
  let serverRepoDir: string;

  beforeAll(async () => {
    testApp = await makeTestApp();
    server = await startTestServer();
    tempBase = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "awb-blockers-test-")));
    appRepoDir = path.join(tempBase, "app-repo");
    fs.mkdirSync(appRepoDir, { recursive: true });
    otherRepoDir = path.join(tempBase, "other-repo");
    fs.mkdirSync(otherRepoDir, { recursive: true });
    serverRepoDir = path.join(tempBase, "server-repo");
    fs.mkdirSync(serverRepoDir, { recursive: true });

    // Projects on testApp
    const p1 = await testApp.request("POST", "/api/projects", {
      path: appRepoDir,
      name: "Blockers App Project",
      key: "BLK",
    });
    expect(p1.status).toBe(201);

    const p2 = await testApp.request("POST", "/api/projects", {
      path: otherRepoDir,
      name: "Other Project",
      key: "OTH",
    });
    expect(p2.status).toBe(201);

    // Project on server for CLI
    const p3 = await server.request("POST", "/api/projects", {
      path: serverRepoDir,
      name: "CLI Project",
      key: "CLI",
    });
    expect(p3.status).toBe(201);
  });

  afterAll(async () => {
    await testApp.close();
    await server.close();
    fs.rmSync(tempBase, { recursive: true, force: true });
  });

  test("add and remove blocker via REST with activity and event", async () => {
    const t1 = await testApp.request("POST", "/api/projects/BLK/tickets", {
      title: "Blocked Ticket",
    });
    const t2 = await testApp.request("POST", "/api/projects/BLK/tickets", {
      title: "Blocker Ticket",
    });
    expect(t1.status).toBe(201);
    expect(t2.status).toBe(201);

    // Initial state: not blocked
    expect(t1.body.blocked).toBe(false);
    expect(t1.body.blockers).toEqual([]);
    expect(t2.body.blocks).toEqual([]);

    // Add blocker via REST
    const addRes = await testApp.request(
      "POST",
      `/api/tickets/${t1.body.key}/blockers`,
      { blockerKey: t2.body.key },
      "alice"
    );
    expect(addRes.status).toBe(200);
    expect(addRes.body.key).toBe(t1.body.key);
    expect(addRes.body.blocked).toBe(true);
    expect(addRes.body.blockers).toHaveLength(1);
    expect(addRes.body.blockers[0].key).toBe(t2.body.key);
    expect(addRes.body.blockers[0].title).toBe("Blocker Ticket");
    expect(addRes.body.blockers[0].column).toBe("backlog");

    // Verify activity recorded
    const getT1 = await testApp.request("GET", `/api/tickets/${t1.body.key}`);
    const addedAct = getT1.body.activity.find((a: any) => a.kind === "blocker_added");
    expect(addedAct).toBeDefined();
    expect(addedAct.actor).toBe("alice");
    expect(addedAct.payload).toEqual({ blockerKey: t2.body.key });

    // Verify blocks list on blocker
    const getT2 = await testApp.request("GET", `/api/tickets/${t2.body.key}`);
    expect(getT2.body.blocks).toHaveLength(1);
    expect(getT2.body.blocks[0].key).toBe(t1.body.key);

    // Remove blocker via REST
    const removeRes = await testApp.request(
      "DELETE",
      `/api/tickets/${t1.body.key}/blockers/${t2.body.key}`,
      undefined,
      "bob"
    );
    expect(removeRes.status).toBe(200);
    expect(removeRes.body.blocked).toBe(false);
    expect(removeRes.body.blockers).toEqual([]);

    // Verify remove activity recorded
    const getT1After = await testApp.request("GET", `/api/tickets/${t1.body.key}`);
    const removedAct = getT1After.body.activity.find((a: any) => a.kind === "blocker_removed");
    expect(removedAct).toBeDefined();
    expect(removedAct.actor).toBe("bob");
    expect(removedAct.payload).toEqual({ blockerKey: t2.body.key });

    // Verify blocker's blocks list is now empty
    const getT2After = await testApp.request("GET", `/api/tickets/${t2.body.key}`);
    expect(getT2After.body.blocks).toEqual([]);
  });

  test("add_blocker and remove_blocker via MCP", async () => {
    const t1 = await testApp.request("POST", "/api/projects/BLK/tickets", {
      title: "MCP Target",
    });
    const t2 = await testApp.request("POST", "/api/projects/BLK/tickets", {
      title: "MCP Blocker",
    });

    const client = await connectMcp(testApp.app, "agent-mcp");
    try {
      // Add blocker via MCP
      const addRes = await callTool(client, "add_blocker", {
        ticketKey: t1.body.key,
        blockerKey: t2.body.key,
        actor: "mcp-actor",
      });
      expect(addRes.isError).toBe(false);
      expect(addRes.data.blocked).toBe(true);
      expect(addRes.data.blockers).toHaveLength(1);
      expect(addRes.data.blockers[0].key).toBe(t2.body.key);

      // Verify activity attribution
      const getRes = await testApp.request("GET", `/api/tickets/${t1.body.key}`);
      const act = getRes.body.activity.find((a: any) => a.kind === "blocker_added");
      expect(act.actor).toBe("mcp-actor");

      // Remove blocker via MCP
      const removeRes = await callTool(client, "remove_blocker", {
        ticketKey: t1.body.key,
        blockerKey: t2.body.key,
      });
      expect(removeRes.isError).toBe(false);
      expect(removeRes.data.blocked).toBe(false);
      expect(removeRes.data.blockers).toEqual([]);
    } finally {
      await client.close();
    }
  });

  test("CLI ticket block, unblock, and show lists Blocked by and Blocks", async () => {
    // Create tickets via CLI
    const c1 = await runCli(["ticket", "create", "CLI Ticket One"], {
      url: server.url,
      cwd: serverRepoDir,
    });
    expect(c1.code).toBe(0);
    const key1 = c1.stdout.trim().replace("Created ", "");

    const c2 = await runCli(["ticket", "create", "CLI Ticket Two"], {
      url: server.url,
      cwd: serverRepoDir,
    });
    expect(c2.code).toBe(0);
    const key2 = c2.stdout.trim().replace("Created ", "");

    // Block key1 by key2
    const blockRes = await runCli(["ticket", "block", key1, "--by", key2, "--as", "cli-agent"], {
      url: server.url,
      cwd: serverRepoDir,
    });
    expect(blockRes.code).toBe(0);
    expect(blockRes.stdout).toContain(`Blocked ${key1} by ${key2}`);

    // ticket show key1 lists Blocked by
    const show1 = await runCli(["ticket", "show", key1], {
      url: server.url,
      cwd: serverRepoDir,
    });
    expect(show1.code).toBe(0);
    expect(show1.stdout).toContain("Blocked by:\n");
    expect(show1.stdout).toContain(key2);

    // ticket show key2 lists Blocks
    const show2 = await runCli(["ticket", "show", key2], {
      url: server.url,
      cwd: serverRepoDir,
    });
    expect(show2.code).toBe(0);
    expect(show2.stdout).toContain("Blocks:\n");
    expect(show2.stdout).toContain(key1);

    // Unblock key1 from key2
    const unblockRes = await runCli(["ticket", "unblock", key1, "--by", key2], {
      url: server.url,
      cwd: serverRepoDir,
    });
    expect(unblockRes.code).toBe(0);
    expect(unblockRes.stdout).toContain(`Unblocked ${key1} from ${key2}`);

    // ticket show key1 no longer lists Blocked by
    const show1After = await runCli(["ticket", "show", key1], {
      url: server.url,
      cwd: serverRepoDir,
    });
    expect(show1After.code).toBe(0);
    expect(show1After.stdout).not.toContain("Blocked by:\n");

    // CLI error cases
    const noKey = await runCli(["ticket", "block"], { url: server.url, cwd: serverRepoDir });
    expect(noKey.code).toBe(2);
    expect(noKey.stderr).toContain("key is required");

    const noBy = await runCli(["ticket", "block", key1], { url: server.url, cwd: serverRepoDir });
    expect(noBy.code).toBe(2);
    expect(noBy.stderr).toContain("--by is required");

    const noKeyUnblock = await runCli(["ticket", "unblock"], { url: server.url, cwd: serverRepoDir });
    expect(noKeyUnblock.code).toBe(2);
    expect(noKeyUnblock.stderr).toContain("key is required");
  });

  test("Validation rejections: same-project, self, and cycles (direct A->B->A and longer A->B->C->A)", async () => {
    const tA = await testApp.request("POST", "/api/projects/BLK/tickets", { title: "A" });
    const tB = await testApp.request("POST", "/api/projects/BLK/tickets", { title: "B" });
    const tC = await testApp.request("POST", "/api/projects/BLK/tickets", { title: "C" });
    const tOther = await testApp.request("POST", "/api/projects/OTH/tickets", { title: "Other Project Ticket" });

    const keyA = tA.body.key;
    const keyB = tB.body.key;
    const keyC = tC.body.key;
    const keyOther = tOther.body.key;

    // 1. Cross-project blocker rejected
    const crossRes = await testApp.request("POST", `/api/tickets/${keyA}/blockers`, {
      blockerKey: keyOther,
    });
    expect(crossRes.status).toBe(400);
    expect(crossRes.body.error.code).toBe("VALIDATION");
    expect(crossRes.body.error.message).toBe("Blockers must be in the same project");

    // 2. Self blocker rejected
    const selfRes = await testApp.request("POST", `/api/tickets/${keyA}/blockers`, {
      blockerKey: keyA,
    });
    expect(selfRes.status).toBe(400);
    expect(selfRes.body.error.code).toBe("VALIDATION");

    // 3. Direct cycle A -> B -> A rejected
    // First, A is blocked by B
    const linkAB = await testApp.request("POST", `/api/tickets/${keyA}/blockers`, {
      blockerKey: keyB,
    });
    expect(linkAB.status).toBe(200);

    // Now try making B blocked by A
    const directCycle = await testApp.request("POST", `/api/tickets/${keyB}/blockers`, {
      blockerKey: keyA,
    });
    expect(directCycle.status).toBe(400);
    expect(directCycle.body.error.code).toBe("VALIDATION");
    expect(directCycle.body.error.message).toBe("That would create a blocker cycle");

    // 4. Longer cycle A -> B -> C -> A rejected
    // Remove link AB first to start fresh
    await testApp.request("DELETE", `/api/tickets/${keyA}/blockers/${keyB}`);

    // Build chain: A blocked by B, B blocked by C
    await testApp.request("POST", `/api/tickets/${keyA}/blockers`, { blockerKey: keyB });
    await testApp.request("POST", `/api/tickets/${keyB}/blockers`, { blockerKey: keyC });

    // Now try making C blocked by A
    const longerCycle = await testApp.request("POST", `/api/tickets/${keyC}/blockers`, {
      blockerKey: keyA,
    });
    expect(longerCycle.status).toBe(400);
    expect(longerCycle.body.error.code).toBe("VALIDATION");
    expect(longerCycle.body.error.message).toBe("That would create a blocker cycle");

    // 5. Non-existent ticket or blocker returns 404
    const notFound1 = await testApp.request("POST", `/api/tickets/${keyA}/blockers`, {
      blockerKey: "BLK-9999",
    });
    expect(notFound1.status).toBe(404);

    const notFound2 = await testApp.request("POST", `/api/tickets/BLK-9999/blockers`, {
      blockerKey: keyA,
    });
    expect(notFound2.status).toBe(404);
  });

  test("duplicate add is a no-op; removing missing link is a no-op", async () => {
    const t1 = await testApp.request("POST", "/api/projects/BLK/tickets", { title: "Dup 1" });
    const t2 = await testApp.request("POST", "/api/projects/BLK/tickets", { title: "Dup 2" });
    const key1 = t1.body.key;
    const key2 = t2.body.key;

    // Add blocker once
    const firstAdd = await testApp.request("POST", `/api/tickets/${key1}/blockers`, {
      blockerKey: key2,
    });
    expect(firstAdd.status).toBe(200);

    const beforeActs = (await testApp.request("GET", `/api/tickets/${key1}`)).body.activity;
    const countBefore = beforeActs.filter((a: any) => a.kind === "blocker_added").length;
    expect(countBefore).toBe(1);

    // Add again (duplicate) -> no-op
    const secondAdd = await testApp.request("POST", `/api/tickets/${key1}/blockers`, {
      blockerKey: key2,
    });
    expect(secondAdd.status).toBe(200);

    const afterActs = (await testApp.request("GET", `/api/tickets/${key1}`)).body.activity;
    const countAfter = afterActs.filter((a: any) => a.kind === "blocker_added").length;
    expect(countAfter).toBe(1);

    // Remove missing link -> no-op
    const t3 = await testApp.request("POST", "/api/projects/BLK/tickets", { title: "Dup 3" });
    const removeMissing = await testApp.request(
      "DELETE",
      `/api/tickets/${key1}/blockers/${t3.body.key}`
    );
    expect(removeMissing.status).toBe(200);

    const actsAfterRemove = (await testApp.request("GET", `/api/tickets/${key1}`)).body.activity;
    const removeActs = actsAfterRemove.filter((a: any) => a.kind === "blocker_removed").length;
    expect(removeActs).toBe(0);
  });

  test("blocked true while any Blocker is not Done and false once all are Done", async () => {
    const tTarget = await testApp.request("POST", "/api/projects/BLK/tickets", {
      title: "Target Card",
    });
    const tB1 = await testApp.request("POST", "/api/projects/BLK/tickets", {
      title: "Blocker 1",
    });
    const tB2 = await testApp.request("POST", "/api/projects/BLK/tickets", {
      title: "Blocker 2",
    });

    const targetKey = tTarget.body.key;
    const b1Key = tB1.body.key;
    const b2Key = tB2.body.key;

    await testApp.request("POST", `/api/tickets/${targetKey}/blockers`, { blockerKey: b1Key });
    await testApp.request("POST", `/api/tickets/${targetKey}/blockers`, { blockerKey: b2Key });

    // Both blockers are in backlog -> blocked is true
    const check1 = await testApp.request("GET", `/api/tickets/${targetKey}`);
    expect(check1.body.blocked).toBe(true);

    // Also check listTickets and getBoard SQL computation
    const list1 = await testApp.request("GET", "/api/projects/BLK/tickets");
    const card1 = list1.body.find((c: any) => c.key === targetKey);
    expect(card1.blocked).toBe(true);

    const board1 = await testApp.request("GET", "/api/projects/BLK/board");
    const boardCard1 = board1.body.columns
      .flatMap((col: any) => col.tickets)
      .find((c: any) => c.key === targetKey);
    expect(boardCard1.blocked).toBe(true);

    // Move Blocker 1 to done
    await testApp.request("POST", `/api/tickets/${b1Key}/move`, { column: "done" });

    // Target is still blocked because Blocker 2 is in backlog
    const check2 = await testApp.request("GET", `/api/tickets/${targetKey}`);
    expect(check2.body.blocked).toBe(true);

    // Move Blocker 2 to done
    await testApp.request("POST", `/api/tickets/${b2Key}/move`, { column: "done" });

    // Now all blockers are done -> blocked is false!
    const check3 = await testApp.request("GET", `/api/tickets/${targetKey}`);
    expect(check3.body.blocked).toBe(false);

    const list3 = await testApp.request("GET", "/api/projects/BLK/tickets");
    const card3 = list3.body.find((c: any) => c.key === targetKey);
    expect(card3.blocked).toBe(false);

    // Move Blocker 1 back out of done to in_progress -> target becomes blocked again!
    await testApp.request("POST", `/api/tickets/${b1Key}/move`, { column: "in_progress" });
    const check4 = await testApp.request("GET", `/api/tickets/${targetKey}`);
    expect(check4.body.blocked).toBe(true);
  });

  test("blockers and blocks lists are ordered by number", async () => {
    // Create tickets: parent and 3 blockers
    const tMain = await testApp.request("POST", "/api/projects/BLK/tickets", { title: "Main" });
    const b1 = await testApp.request("POST", "/api/projects/BLK/tickets", { title: "B1" });
    const b2 = await testApp.request("POST", "/api/projects/BLK/tickets", { title: "B2" });
    const b3 = await testApp.request("POST", "/api/projects/BLK/tickets", { title: "B3" });

    // Add blockers in reverse order: b3, then b1, then b2
    await testApp.request("POST", `/api/tickets/${tMain.body.key}/blockers`, { blockerKey: b3.body.key });
    await testApp.request("POST", `/api/tickets/${tMain.body.key}/blockers`, { blockerKey: b1.body.key });
    await testApp.request("POST", `/api/tickets/${tMain.body.key}/blockers`, { blockerKey: b2.body.key });

    const getRes = await testApp.request("GET", `/api/tickets/${tMain.body.key}`);
    expect(getRes.body.blockers).toHaveLength(3);
    // Verified ordered by number ASC: b1, b2, b3
    expect(getRes.body.blockers[0].key).toBe(b1.body.key);
    expect(getRes.body.blockers[1].key).toBe(b2.body.key);
    expect(getRes.body.blockers[2].key).toBe(b3.body.key);
    expect(getRes.body.blockers[0].column).toBeDefined();
    expect(getRes.body.blockers[0].title).toBe("B1");

    // Check blocks list on b1
    const getB1 = await testApp.request("GET", `/api/tickets/${b1.body.key}`);
    expect(getB1.body.blocks).toHaveLength(1);
    expect(getB1.body.blocks[0].key).toBe(tMain.body.key);
  });

  test("blockedBy on create via REST, MCP, and CLI", async () => {
    const b1 = await testApp.request("POST", "/api/projects/BLK/tickets", { title: "Prereq 1" });
    const b2 = await testApp.request("POST", "/api/projects/BLK/tickets", { title: "Prereq 2" });

    // 1. REST create with blockedBy
    const restCreated = await testApp.request("POST", "/api/projects/BLK/tickets", {
      title: "Created with blockedBy",
      blockedBy: [b1.body.key, b2.body.key],
    });
    expect(restCreated.status).toBe(201);
    expect(restCreated.body.blocked).toBe(true);
    expect(restCreated.body.blockers).toHaveLength(2);
    expect(restCreated.body.blockers[0].key).toBe(b1.body.key);
    expect(restCreated.body.blockers[1].key).toBe(b2.body.key);

    // Verify activity has blocker_added for each
    const acts = restCreated.body.activity.filter((a: any) => a.kind === "blocker_added");
    expect(acts).toHaveLength(2);

    // 2. MCP create_ticket with blockedBy
    const client = await connectMcp(testApp.app);
    try {
      const mcpCreated = await callTool(client, "create_ticket", {
        project: "BLK",
        title: "MCP Created with Blockers",
        blockedBy: [b1.body.key],
      });
      expect(mcpCreated.isError).toBe(false);
      expect(mcpCreated.data.blocked).toBe(true);
      expect(mcpCreated.data.blockers).toHaveLength(1);
      expect(mcpCreated.data.blockers[0].key).toBe(b1.body.key);
    } finally {
      await client.close();
    }

    // 3. CLI awb ticket create --blocked-by
    const cliB1 = await runCli(["ticket", "create", "CLI Pre 1"], { url: server.url, cwd: serverRepoDir });
    const cliKey1 = cliB1.stdout.trim().replace("Created ", "");
    const cliB2 = await runCli(["ticket", "create", "CLI Pre 2"], { url: server.url, cwd: serverRepoDir });
    const cliKey2 = cliB2.stdout.trim().replace("Created ", "");

    const cliCreated = await runCli(
      [
        "ticket",
        "create",
        "CLI Ticket with Blockers",
        "--blocked-by",
        cliKey1,
        "--blocked-by",
        cliKey2,
        "--json",
      ],
      { url: server.url, cwd: serverRepoDir }
    );
    expect(cliCreated.code).toBe(0);
    const cliTicket = JSON.parse(cliCreated.stdout);
    expect(cliTicket.blocked).toBe(true);
    expect(cliTicket.blockers).toHaveLength(2);
  });

  test("deleting a Blocker Ticket unblocks dependent tickets", async () => {
    const dep = await testApp.request("POST", "/api/projects/BLK/tickets", { title: "Dependent" });
    const blocker = await testApp.request("POST", "/api/projects/BLK/tickets", { title: "To Delete" });

    await testApp.request("POST", `/api/tickets/${dep.body.key}/blockers`, { blockerKey: blocker.body.key });

    // Verify it is blocked
    const beforeDel = await testApp.request("GET", `/api/tickets/${dep.body.key}`);
    expect(beforeDel.body.blocked).toBe(true);
    expect(beforeDel.body.blockers).toHaveLength(1);

    // Delete blocker ticket
    const delRes = await testApp.request("DELETE", `/api/tickets/${blocker.body.key}`);
    expect(delRes.status).toBe(204);

    // Dependent is now unblocked
    const afterDel = await testApp.request("GET", `/api/tickets/${dep.body.key}`);
    expect(afterDel.body.blocked).toBe(false);
    expect(afterDel.body.blockers).toEqual([]);
  });

  test("manual move of a blocked Ticket is still allowed", async () => {
    const blockedTicket = await testApp.request("POST", "/api/projects/BLK/tickets", {
      title: "Blocked Can Move",
      column: "backlog",
    });
    const blockerTicket = await testApp.request("POST", "/api/projects/BLK/tickets", {
      title: "Active Blocker",
      column: "todo",
    });

    await testApp.request("POST", `/api/tickets/${blockedTicket.body.key}/blockers`, {
      blockerKey: blockerTicket.body.key,
    });

    // Move to todo
    const move1 = await testApp.request("POST", `/api/tickets/${blockedTicket.body.key}/move`, {
      column: "todo",
    });
    expect(move1.status).toBe(200);
    expect(move1.body.column).toBe("todo");
    expect(move1.body.blocked).toBe(true);

    // Move to in_progress
    const move2 = await testApp.request("POST", `/api/tickets/${blockedTicket.body.key}/move`, {
      column: "in_progress",
    });
    expect(move2.status).toBe(200);
    expect(move2.body.column).toBe("in_progress");
    expect(move2.body.blocked).toBe(true);
  });

  test("events emitted for dependents when a Blocker moves to Done", async () => {
    const depTicket = await testApp.request("POST", "/api/projects/BLK/tickets", { title: "Dep For SSE" });
    const blkTicket = await testApp.request("POST", "/api/projects/BLK/tickets", { title: "Blk For SSE" });

    await testApp.request("POST", `/api/tickets/${depTicket.body.key}/blockers`, {
      blockerKey: blkTicket.body.key,
    });

    // Connect to SSE for project BLK
    const sseRes = await testApp.app.request("/api/events?project=BLK");
    expect(sseRes.status).toBe(200);

    // We expect 2 events: ticket.moved for blkTicket, and ticket.updated for depTicket!
    const ssePromise = readSseEvents(sseRes, 2);

    // Move blkTicket to done
    const moveRes = await testApp.request(
      "POST",
      `/api/tickets/${blkTicket.body.key}/move`,
      { column: "done" },
      "mover-agent"
    );
    expect(moveRes.status).toBe(200);

    const events = await ssePromise;
    expect(events).toHaveLength(2);

    const movedEvent = events.find((e) => e.type === "ticket.moved");
    expect(movedEvent).toBeDefined();
    expect(movedEvent?.ticketKey).toBe(blkTicket.body.key);

    const updatedEvent = events.find((e) => e.type === "ticket.updated");
    expect(updatedEvent).toBeDefined();
    expect(updatedEvent?.ticketKey).toBe(depTicket.body.key);
  });
});
