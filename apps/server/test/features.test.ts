import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { makeTestApp, readSseEvents, runCli, startTestServer, type TestApp, type TestServer } from "./helpers.ts";
import { connectMcp, callTool } from "./mcp-helpers.ts";
import { FEATURE_PALETTE } from "../src/domain/features.ts";

describe("Features Backend (Task 14)", () => {
  let testApp: TestApp;
  let tempBase: string;
  let repoA: string;
  let repoB: string;

  beforeAll(async () => {
    testApp = await makeTestApp();
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "awb-features-test-"));
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

  test("1. create with tickets incl. blockedByIndexes and blockedBy (Blockers exist, order and Column correct)", async () => {
    // Create an existing ticket first: PRJA-1
    const baseTicketRes = await testApp.request(
      "POST",
      "/api/projects/PRJA/tickets",
      { title: "Base ticket", column: "backlog" }
    );
    expect(baseTicketRes.status).toBe(201);
    expect(baseTicketRes.body.key).toBe("PRJA-1");

    // Create a feature with 3 tickets
    const res = await testApp.request(
      "POST",
      "/api/projects/PRJA/features",
      {
        name: "User Authentication",
        description: "Everything needed for login",
        tickets: [
          {
            title: "Database schema",
            description: "Users table",
            column: "backlog",
            priority: "high",
            blockedBy: ["PRJA-1"],
          },
          {
            title: "Auth service API",
            description: "JWT issuance",
            column: "backlog",
            priority: "highest",
            blockedByIndexes: [0],
          },
          {
            title: "Login UI page",
            column: "todo",
            blockedByIndexes: [1],
            blockedBy: ["PRJA-1"],
          },
        ],
      },
      "architect"
    );

    expect(res.status).toBe(201);
    expect(res.body.feature).toMatchObject({
      name: "User Authentication",
      description: "Everything needed for login",
      projectKey: "PRJA",
      color: FEATURE_PALETTE[0],
      progress: { done: 0, total: 3 },
    });
    expect(res.body.tickets).toHaveLength(3);

    const [t0, t1, t2] = res.body.tickets;
    expect(t0.key).toBe("PRJA-2");
    expect(t0.column).toBe("backlog");
    expect(t0.rank).toBe(1); // PRJA-1 was rank 0
    expect(t0.priority).toBe("high");
    expect(t0.feature).toEqual({
      id: res.body.feature.id,
      name: "User Authentication",
      color: FEATURE_PALETTE[0],
    });
    expect(t0.blockers).toEqual([
      { key: "PRJA-1", title: "Base ticket", column: "backlog" },
    ]);

    expect(t1.key).toBe("PRJA-3");
    expect(t1.column).toBe("backlog");
    expect(t1.rank).toBe(2); // After PRJA-2
    expect(t1.priority).toBe("highest");
    expect(t1.blockers).toEqual([
      { key: "PRJA-2", title: "Database schema", column: "backlog" },
    ]);

    expect(t2.key).toBe("PRJA-4");
    expect(t2.column).toBe("todo");
    expect(t2.rank).toBe(0); // First in todo
    expect(t2.blockers.map((b: any) => b.key)).toEqual(["PRJA-1", "PRJA-3"]);

    // Verify blocks reverse links
    const getT0 = await testApp.request("GET", `/api/tickets/${t0.key}`);
    expect(getT0.body.blocks.map((b: any) => b.key)).toContain(t1.key);

    const getT1 = await testApp.request("GET", `/api/tickets/${t1.key}`);
    expect(getT1.body.blocks.map((b: any) => b.key)).toContain(t2.key);
  });

  test("2. forward/self index rejected and nothing is created (rollback)", async () => {
    const beforeFeatures = await testApp.ctx.db.all("SELECT * FROM features");
    const beforeTickets = await testApp.ctx.db.all("SELECT * FROM tickets");

    // Self-index on ticket 0
    const resSelf = await testApp.request(
      "POST",
      "/api/projects/PRJA/features",
      {
        name: "Self Index Feature",
        tickets: [
          {
            title: "Self blocking",
            blockedByIndexes: [0],
          },
        ],
      }
    );
    expect(resSelf.status).toBe(400);
    expect(resSelf.body.error.message).toContain(
      "blockedByIndexes must refer to earlier tickets"
    );

    // Forward index on ticket 0 pointing to ticket 1
    const resForward = await testApp.request(
      "POST",
      "/api/projects/PRJA/features",
      {
        name: "Forward Index Feature",
        tickets: [
          {
            title: "Task 1",
            blockedByIndexes: [1],
          },
          {
            title: "Task 2",
          },
        ],
      }
    );
    expect(resForward.status).toBe(400);
    expect(resForward.body.error.message).toContain(
      "blockedByIndexes must refer to earlier tickets"
    );

    // Assert complete rollback
    const afterFeatures = await testApp.ctx.db.all("SELECT * FROM features");
    const afterTickets = await testApp.ctx.db.all("SELECT * FROM tickets");
    expect(afterFeatures.length).toBe(beforeFeatures.length);
    expect(afterTickets.length).toBe(beforeTickets.length);
  });

  test("3. duplicate name (different case) 409", async () => {
    const resDup = await testApp.request(
      "POST",
      "/api/projects/PRJA/features",
      {
        name: "user authentication", // already exists as "User Authentication"
      }
    );
    expect(resDup.status).toBe(409);
    expect(resDup.body.error.code).toBe("CONFLICT");
    expect(resDup.body.error.message).toContain(
      "A feature named user authentication already exists"
    );

    // Same name in PRJB is allowed
    const resOtherProject = await testApp.request(
      "POST",
      "/api/projects/PRJB/features",
      {
        name: "User Authentication",
      }
    );
    expect(resOtherProject.status).toBe(201);
  });

  test("4. colour auto-assigned from the palette and validated", async () => {
    // Count existing features in PRJA: currently 1 ("User Authentication")
    // Palette:
    // 0: #0C66E4 (used by feature 1)
    // 1: #1F845A
    // 2: #E2B203
    // 3: #C9372C
    // 4: #6E5DC6
    // 5: #227D9B
    // 6: #E56910
    // 7: #AE4787
    // 8: #0C66E4 (wraps around)

    const f2 = await testApp.request("POST", "/api/projects/PRJA/features", {
      name: "Feature 2",
    });
    expect(f2.body.feature.color).toBe(FEATURE_PALETTE[1]);

    const f3 = await testApp.request("POST", "/api/projects/PRJA/features", {
      name: "Feature 3",
    });
    expect(f3.body.feature.color).toBe(FEATURE_PALETTE[2]);

    // Create with explicit custom color
    const fCustom = await testApp.request("POST", "/api/projects/PRJA/features", {
      name: "Feature Custom Color",
      color: "#abcdef",
    });
    expect(fCustom.status).toBe(201);
    expect(fCustom.body.feature.color).toBe("#abcdef");

    // Invalid color validation
    const fInvalid = await testApp.request("POST", "/api/projects/PRJA/features", {
      name: "Feature Bad Color",
      color: "blue",
    });
    expect(fInvalid.status).toBe(400);
    expect(fInvalid.body.error.code).toBe("VALIDATION");
  });

  test("5. progress counts", async () => {
    const res = await testApp.request("POST", "/api/projects/PRJA/features", {
      name: "Progress Feature",
      tickets: [
        { title: "T1", column: "backlog" },
        { title: "T2", column: "todo" },
        { title: "T3", column: "done" },
      ],
    });
    expect(res.status).toBe(201);
    const featId = res.body.feature.id;
    expect(res.body.feature.progress).toEqual({ done: 1, total: 3 });

    // Move T2 to done
    const t2Key = res.body.tickets[1].key;
    await testApp.request("POST", `/api/tickets/${t2Key}/move`, { column: "done" });

    // Check getFeature
    const featGet = await testApp.request("GET", `/api/features/${featId}`);
    expect(featGet.status).toBe(200);
    expect(featGet.body.progress).toEqual({ done: 2, total: 3 });
    expect(featGet.body.tickets).toHaveLength(3);

    // List features also shows updated progress
    const listRes = await testApp.request("GET", "/api/projects/PRJA/features");
    const found = listRes.body.find((f: any) => f.id === featId);
    expect(found.progress).toEqual({ done: 2, total: 3 });
  });

  test("6. update feature", async () => {
    const createRes = await testApp.request("POST", "/api/projects/PRJA/features", {
      name: "Editable Feature",
      description: "Initial description",
      color: "#112233",
    });
    const id = createRes.body.feature.id;

    // Duplicate name conflict on update
    const dupRes = await testApp.request("PATCH", `/api/features/${id}`, {
      name: "user authentication",
    });
    expect(dupRes.status).toBe(409);

    // Successful update
    const updateRes = await testApp.request(
      "PATCH",
      `/api/features/${id}`,
      {
        name: "Updated Feature Name",
        description: "New updated description",
        color: "#445566",
      },
      "editor"
    );
    expect(updateRes.status).toBe(200);
    expect(updateRes.body).toMatchObject({
      id,
      name: "Updated Feature Name",
      description: "New updated description",
      color: "#445566",
    });
  });

  test("7. delete keeps Tickets, clears links, records Activity", async () => {
    const createRes = await testApp.request("POST", "/api/projects/PRJA/features", {
      name: "Feature To Delete",
      tickets: [
        { title: "Orphan 1", column: "backlog" },
        { title: "Orphan 2", column: "todo" },
      ],
    });
    const id = createRes.body.feature.id;
    const [t1, t2] = createRes.body.tickets;

    // Delete feature
    const delRes = await testApp.request(
      "DELETE",
      `/api/features/${id}`,
      undefined,
      "admin"
    );
    expect(delRes.status).toBe(204);

    // Feature is gone
    const getFeat = await testApp.request("GET", `/api/features/${id}`);
    expect(getFeat.status).toBe(404);

    // Tickets remain and feature is null
    const getT1 = await testApp.request("GET", `/api/tickets/${t1.key}`);
    expect(getT1.status).toBe(200);
    expect(getT1.body.feature).toBeNull();
    const act1 = getT1.body.activity[getT1.body.activity.length - 1];
    expect(act1).toMatchObject({
      actor: "admin",
      kind: "updated",
      payload: {
        field: "feature",
        from: "Feature To Delete",
        to: null,
      },
    });

    const getT2 = await testApp.request("GET", `/api/tickets/${t2.key}`);
    expect(getT2.status).toBe(200);
    expect(getT2.body.feature).toBeNull();
  });

  test("8. featureId on ticket create/update incl. cross-Project rejection", async () => {
    const featA = await testApp.request("POST", "/api/projects/PRJA/features", {
      name: "Feature A In PRJA",
    });
    const featB = await testApp.request("POST", "/api/projects/PRJB/features", {
      name: "Feature B In PRJB",
    });

    // Cross-project create rejection
    const crossCreate = await testApp.request("POST", "/api/projects/PRJA/tickets", {
      title: "Cross Ticket",
      featureId: featB.body.feature.id,
    });
    expect(crossCreate.status).toBe(400);
    expect(crossCreate.body.error.code).toBe("VALIDATION");
    expect(crossCreate.body.error.message).toContain("same project");

    // Valid create with featureId
    const ticketCreate = await testApp.request("POST", "/api/projects/PRJA/tickets", {
      title: "Ticket in Feat A",
      featureId: featA.body.feature.id,
    });
    expect(ticketCreate.status).toBe(201);
    expect(ticketCreate.body.feature).toEqual({
      id: featA.body.feature.id,
      name: "Feature A In PRJA",
      color: featA.body.feature.color,
    });

    // Cross-project update rejection
    const crossUpdate = await testApp.request(
      "PATCH",
      `/api/tickets/${ticketCreate.body.key}`,
      {
        featureId: featB.body.feature.id,
      }
    );
    expect(crossUpdate.status).toBe(400);

    // Update to null (unlink)
    const unlinkRes = await testApp.request(
      "PATCH",
      `/api/tickets/${ticketCreate.body.key}`,
      { featureId: null },
      "unlinker"
    );
    expect(unlinkRes.status).toBe(200);
    expect(unlinkRes.body.feature).toBeNull();
    const act = unlinkRes.body.activity[unlinkRes.body.activity.length - 1];
    expect(act).toMatchObject({
      actor: "unlinker",
      kind: "updated",
      payload: {
        field: "feature",
        from: "Feature A In PRJA",
        to: null,
      },
    });

    // Re-link
    const relinkRes = await testApp.request(
      "PATCH",
      `/api/tickets/${ticketCreate.body.key}`,
      { featureId: featA.body.feature.id },
      "relinker"
    );
    expect(relinkRes.status).toBe(200);
    expect(relinkRes.body.feature.id).toBe(featA.body.feature.id);
  });

  test("9. filters and getBoard", async () => {
    const feat = await testApp.request("POST", "/api/projects/PRJA/features", {
      name: "Filter Target Feature",
      tickets: [
        { title: "Target Ticket 1" },
        { title: "Target Ticket 2" },
      ],
    });
    const featId = feat.body.feature.id;

    // Filter tickets by feature
    const filteredRes = await testApp.request(
      "GET",
      `/api/projects/PRJA/tickets?feature=${featId}`
    );
    expect(filteredRes.status).toBe(200);
    expect(filteredRes.body).toHaveLength(2);
    expect(filteredRes.body.every((c: any) => c.feature?.id === featId)).toBe(true);

    // Board returns features list
    const boardRes = await testApp.request("GET", "/api/projects/PRJA/board");
    expect(boardRes.status).toBe(200);
    expect(Array.isArray(boardRes.body.features)).toBe(true);
    expect(boardRes.body.features.some((f: any) => f.id === featId)).toBe(true);
  });

  test("10. events for feature lifecycle", async () => {
    // 1. feature.created and ticket.created
    const sseRes1 = await testApp.app.request("/api/events?project=PRJA");
    expect(sseRes1.status).toBe(200);
    const ssePromise1 = readSseEvents(sseRes1, 3); // 1 feature.created + 2 ticket.created

    const createRes = await testApp.request(
      "POST",
      "/api/projects/PRJA/features",
      {
        name: "Events Feature",
        tickets: [{ title: "EvT1" }, { title: "EvT2" }],
      },
      "event-creator"
    );
    const events1 = await ssePromise1;
    expect(events1[0]).toMatchObject({
      event: "feature.created",
      projectKey: "PRJA",
      featureId: createRes.body.feature.id,
      actor: "event-creator",
    });
    expect(events1[1]).toMatchObject({
      event: "ticket.created",
      projectKey: "PRJA",
      ticketKey: createRes.body.tickets[0].key,
    });
    expect(events1[2]).toMatchObject({
      event: "ticket.created",
      projectKey: "PRJA",
      ticketKey: createRes.body.tickets[1].key,
    });

    // 2. feature.updated
    const sseRes2 = await testApp.app.request("/api/events?project=PRJA");
    const ssePromise2 = readSseEvents(sseRes2, 1);
    await testApp.request(
      "PATCH",
      `/api/features/${createRes.body.feature.id}`,
      { name: "Events Feature Renamed" },
      "event-updater"
    );
    const events2 = await ssePromise2;
    expect(events2[0]).toMatchObject({
      event: "feature.updated",
      projectKey: "PRJA",
      featureId: createRes.body.feature.id,
      actor: "event-updater",
    });

    // 3. feature.deleted
    const sseRes3 = await testApp.app.request("/api/events?project=PRJA");
    const ssePromise3 = readSseEvents(sseRes3, 1);
    await testApp.request(
      "DELETE",
      `/api/features/${createRes.body.feature.id}`,
      undefined,
      "event-deleter"
    );
    const events3 = await ssePromise3;
    expect(events3[0]).toMatchObject({
      event: "feature.deleted",
      projectKey: "PRJA",
      featureId: createRes.body.feature.id,
      actor: "event-deleter",
    });
  });

  test("11. MCP tools (and still no delete tool)", async () => {
    const client = await connectMcp(testApp.app);
    try {
      const { tools } = await client.listTools();
      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain("list_features");
      expect(toolNames).toContain("get_feature");
      expect(toolNames).toContain("create_feature");
      expect(toolNames).toContain("update_feature");

      // Verify no delete tool exists
      const hasDelete = toolNames.some((n) => n.toLowerCase().includes("delete"));
      expect(hasDelete).toBe(false);

      // Create feature via MCP
      const createRes = await callTool(client, "create_feature", {
        project: "PRJA",
        name: "MCP Feature",
        tickets: [
          { title: "MCP Ticket 1", column: "backlog" },
          { title: "MCP Ticket 2", column: "backlog", blockedByIndexes: [0] },
        ],
      });
      expect(createRes.isError).toBe(false);
      expect(createRes.data.feature.name).toBe("MCP Feature");
      expect(createRes.data.tickets).toHaveLength(2);
      const featId = createRes.data.feature.id;

      // Get feature via MCP
      const getRes = await callTool(client, "get_feature", { featureId: featId });
      expect(getRes.isError).toBe(false);
      expect(getRes.data.id).toBe(featId);
      expect(getRes.data.tickets).toHaveLength(2);

      // List features via MCP
      const listRes = await callTool(client, "list_features", { project: "PRJA" });
      expect(listRes.isError).toBe(false);
      expect(Array.isArray(listRes.data)).toBe(true);

      // Update feature via MCP
      const updateRes = await callTool(client, "update_feature", {
        featureId: featId,
        name: "MCP Feature Renamed",
      });
      expect(updateRes.isError).toBe(false);
      expect(updateRes.data.name).toBe("MCP Feature Renamed");

      // create_ticket and list_tickets with featureId via MCP
      const createTicketRes = await callTool(client, "create_ticket", {
        project: "PRJA",
        title: "MCP Attached Ticket",
        featureId: featId,
      });
      expect(createTicketRes.isError).toBe(false);
      expect(createTicketRes.data.feature.id).toBe(featId);

      const listTicketRes = await callTool(client, "list_tickets", {
        project: "PRJA",
        featureId: featId,
      });
      expect(listTicketRes.isError).toBe(false);
      expect(listTicketRes.data).toHaveLength(3);
    } finally {
      await client.close();
    }
  });

  describe("12. CLI commands incl. --tickets-file", () => {
    let server: TestServer;
    let cliTempBase: string;
    let cliRepoDir: string;

    beforeAll(async () => {
      server = await startTestServer();
      cliTempBase = fs.mkdtempSync(path.join(os.tmpdir(), "awb-cli-features-test-"));
      cliRepoDir = path.join(cliTempBase, "cli-repo");
      fs.mkdirSync(cliRepoDir, { recursive: true });

      await runCli(["init", "--key", "CLIF", "--name", "CLI Feat Repo"], {
        url: server.url,
        cwd: cliRepoDir,
      });
    });

    afterAll(async () => {
      await server.close();
      fs.rmSync(cliTempBase, { recursive: true, force: true });
    });

    test("CLI feature create, list, show, update and ticket commands", async () => {
      // 1. feature create with --tickets-file
      const ticketsFile = path.join(cliTempBase, "plan.json");
      fs.writeFileSync(
        ticketsFile,
        JSON.stringify([
          { title: "Design DB schema", column: "backlog" },
          { title: "Implement API endpoints", column: "todo", blockedByIndexes: [0] },
        ])
      );

      const createRes = await runCli(
        [
          "feature",
          "create",
          "CLI Feature 1",
          "-d",
          "Feature description",
          "--color",
          "#123456",
          "--tickets-file",
          ticketsFile,
        ],
        { url: server.url, cwd: cliRepoDir }
      );
      expect(createRes.code).toBe(0);
      expect(createRes.stdout).toContain("Created #1");
      expect(createRes.stdout).toContain("CLIF-1");
      expect(createRes.stdout).toContain("CLIF-2");

      // 2. feature list
      const listRes = await runCli(["feature", "list"], {
        url: server.url,
        cwd: cliRepoDir,
      });
      expect(listRes.code).toBe(0);
      expect(listRes.stdout).toContain("#1  CLI Feature 1  0/2");

      // 3. feature show
      const showRes = await runCli(["feature", "show", "1"], {
        url: server.url,
        cwd: cliRepoDir,
      });
      expect(showRes.code).toBe(0);
      expect(showRes.stdout).toContain("#1  CLI Feature 1  0/2");
      expect(showRes.stdout).toContain("Color: #123456");
      expect(showRes.stdout).toContain("Feature description");
      expect(showRes.stdout).toContain("CLIF-1");
      expect(showRes.stdout).toContain("CLIF-2");

      // 4. feature update
      const updateRes = await runCli(
        [
          "feature",
          "update",
          "1",
          "--name",
          "CLI Feature Renamed",
          "--color",
          "#654321",
        ],
        { url: server.url, cwd: cliRepoDir }
      );
      expect(updateRes.code).toBe(0);
      expect(updateRes.stdout).toContain("Updated #1");

      // 5. ticket create with --feature
      const createTicketRes = await runCli(
        [
          "ticket",
          "create",
          "CLI Manual Ticket",
          "--feature",
          "1",
        ],
        { url: server.url, cwd: cliRepoDir }
      );
      expect(createTicketRes.code).toBe(0);
      expect(createTicketRes.stdout).toContain("Created CLIF-3");

      // 6. ticket list with --feature
      const listTicketRes = await runCli(
        [
          "ticket",
          "list",
          "--feature",
          "1",
        ],
        { url: server.url, cwd: cliRepoDir }
      );
      expect(listTicketRes.code).toBe(0);
      expect(listTicketRes.stdout).toContain("CLIF-1");
      expect(listTicketRes.stdout).toContain("CLIF-2");
      expect(listTicketRes.stdout).toContain("CLIF-3");

      // 7. ticket update --feature none
      const updateTicketRes = await runCli(
        [
          "ticket",
          "update",
          "CLIF-3",
          "--feature",
          "none",
        ],
        { url: server.url, cwd: cliRepoDir }
      );
      expect(updateTicketRes.code).toBe(0);
      expect(updateTicketRes.stdout).toContain("Updated CLIF-3");

      // 8. ticket list with --feature 1 should no longer have CLIF-3
      const listAfterRes = await runCli(
        [
          "ticket",
          "list",
          "--feature",
          "1",
        ],
        { url: server.url, cwd: cliRepoDir }
      );
      expect(listAfterRes.code).toBe(0);
      expect(listAfterRes.stdout).not.toContain("CLIF-3");
    });
  });
});
