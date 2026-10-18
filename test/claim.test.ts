import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { BoardEvent } from "../src/domain/events.ts";
import {
  makeTestApp,
  runCli,
  startTestServer,
  type TestApp,
  type TestServer,
} from "./helpers.ts";
import { callTool, connectMcp } from "./mcp-helpers.ts";

describe("Task 16: Claim", () => {
  describe("Eligibility and selection", () => {
    let testApp: TestApp;
    let projKey: string;

    beforeAll(async () => {
      testApp = await makeTestApp();
      projKey = "CLM";

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "awb-claim-proj-"));
      await testApp.request("POST", "/api/projects", {
        path: tempDir,
        name: "Claim Project",
        key: projKey,
      });
    });

    afterAll(async () => {
      await testApp.close();
    });

    test("skips assigned, flagged, blocked, non-todo tickets and picks top-ranked eligible", async () => {
      // 1. Ticket in backlog (skipped)
      const tBacklog = await testApp.request(
        "POST",
        `/api/projects/${projKey}/tickets`,
        { title: "Backlog ticket", column: "backlog" }
      );

      // 2. Ticket in todo, but assigned (skipped)
      const tAssigned = await testApp.request(
        "POST",
        `/api/projects/${projKey}/tickets`,
        { title: "Assigned ticket", column: "todo", assignee: "agent-1" }
      );

      // 3. Ticket in todo, flagged needs attention (skipped)
      const tFlagged = await testApp.request(
        "POST",
        `/api/projects/${projKey}/tickets`,
        { title: "Flagged ticket", column: "todo" }
      );
      await testApp.request(
        "PUT",
        `/api/tickets/${tFlagged.body.key}/attention`,
        { reason: "Blocked on external decision" }
      );

      // 4. Blocker ticket in in_progress
      const tBlockerInProgress = await testApp.request(
        "POST",
        `/api/projects/${projKey}/tickets`,
        { title: "Blocker in progress", column: "in_progress" }
      );

      // 5. Ticket in todo, blocked by in-progress ticket (skipped)
      const tBlocked = await testApp.request(
        "POST",
        `/api/projects/${projKey}/tickets`,
        {
          title: "Blocked ticket",
          column: "todo",
          blockedBy: [tBlockerInProgress.body.key],
        }
      );

      // 6. Blocker ticket in done
      const tBlockerDone = await testApp.request(
        "POST",
        `/api/projects/${projKey}/tickets`,
        { title: "Blocker done", column: "done" }
      );

      // 7. Eligible ticket #1 (rank 4 among todo tickets)
      const tEligible1 = await testApp.request(
        "POST",
        `/api/projects/${projKey}/tickets`,
        { title: "First eligible ticket", column: "todo" }
      );

      // 8. Eligible ticket #2 (blocked by tBlockerDone, which is done -> eligible! rank 5)
      const tEligibleDoneBlocker = await testApp.request(
        "POST",
        `/api/projects/${projKey}/tickets`,
        {
          title: "Ticket with done blocker",
          column: "todo",
          blockedBy: [tBlockerDone.body.key],
        }
      );

      // 9. Eligible ticket #3 (rank 6)
      const tEligible2 = await testApp.request(
        "POST",
        `/api/projects/${projKey}/tickets`,
        { title: "Second eligible ticket", column: "todo" }
      );

      // Claim next ticket: should pick tEligible1
      const claim1 = await testApp.request(
        "POST",
        `/api/projects/${projKey}/claim`,
        {},
        "claim-agent"
      );
      expect(claim1.status).toBe(200);
      expect(claim1.body.ticket).not.toBeNull();
      expect(claim1.body.ticket.key).toBe(tEligible1.body.key);

      // Next claim should pick tEligibleDoneBlocker
      const claim2 = await testApp.request(
        "POST",
        `/api/projects/${projKey}/claim`,
        {},
        "claim-agent"
      );
      expect(claim2.status).toBe(200);
      expect(claim2.body.ticket).not.toBeNull();
      expect(claim2.body.ticket.key).toBe(tEligibleDoneBlocker.body.key);

      // Next claim should pick tEligible2
      const claim3 = await testApp.request(
        "POST",
        `/api/projects/${projKey}/claim`,
        {},
        "claim-agent"
      );
      expect(claim3.status).toBe(200);
      expect(claim3.body.ticket).not.toBeNull();
      expect(claim3.body.ticket.key).toBe(tEligible2.body.key);

      // Now nothing left eligible in todo (only tAssigned, tFlagged, tBlocked)
      const claimEmpty = await testApp.request(
        "POST",
        `/api/projects/${projKey}/claim`,
        {},
        "claim-agent"
      );
      expect(claimEmpty.status).toBe(200);
      expect(claimEmpty.body.ticket).toBeNull();
    });

    test("skips other features when featureId is given", async () => {
      // Create Feature A and Feature B
      const featA = await testApp.request(
        "POST",
        `/api/projects/${projKey}/features`,
        { name: "Feature Alpha" }
      );
      const featB = await testApp.request(
        "POST",
        `/api/projects/${projKey}/features`,
        { name: "Feature Beta" }
      );

      // Ticket with Feature A
      const tFeatA = await testApp.request(
        "POST",
        `/api/projects/${projKey}/tickets`,
        { title: "Ticket for Alpha", column: "todo", featureId: featA.body.feature.id }
      );

      // Ticket with Feature B
      const tFeatB = await testApp.request(
        "POST",
        `/api/projects/${projKey}/tickets`,
        { title: "Ticket for Beta", column: "todo", featureId: featB.body.feature.id }
      );

      // Ticket with no feature
      const tNoFeat = await testApp.request(
        "POST",
        `/api/projects/${projKey}/tickets`,
        { title: "Ticket with no feature", column: "todo" }
      );

      // Claim limited to Feature B -> should skip tFeatA and pick tFeatB
      const claimBeta = await testApp.request(
        "POST",
        `/api/projects/${projKey}/claim`,
        { featureId: featB.body.feature.id },
        "beta-agent"
      );
      expect(claimBeta.status).toBe(200);
      expect(claimBeta.body.ticket.key).toBe(tFeatB.body.key);
      expect(claimBeta.body.ticket.feature.id).toBe(featB.body.feature.id);

      // Second claim for Feature B -> null (only Alpha and NoFeat left)
      const claimBetaEmpty = await testApp.request(
        "POST",
        `/api/projects/${projKey}/claim`,
        { featureId: featB.body.feature.id },
        "beta-agent"
      );
      expect(claimBetaEmpty.status).toBe(200);
      expect(claimBetaEmpty.body.ticket).toBeNull();

      // Feature ID from another project -> VALIDATION (400)
      const otherProjDir = fs.mkdtempSync(path.join(os.tmpdir(), "awb-other-proj-"));
      await testApp.request("POST", "/api/projects", {
        path: otherProjDir,
        name: "Other Project",
        key: "OTH",
      });
      const otherFeat = await testApp.request("POST", "/api/projects/OTH/features", {
        name: "Other Feature",
      });

      const invalidClaim = await testApp.request(
        "POST",
        `/api/projects/${projKey}/claim`,
        { featureId: otherFeat.body.feature.id },
        "agent-x"
      );
      expect(invalidClaim.status).toBe(400);
      expect(invalidClaim.body.error.code).toBe("VALIDATION");
    });
  });

  describe("Result and side effects", () => {
    let testApp: TestApp;
    let projKey: string;
    let events: BoardEvent[];

    beforeAll(async () => {
      testApp = await makeTestApp();
      projKey = "RES";
      events = [];

      testApp.ctx.events.subscribe((e) => {
        events.push(e);
      });

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "awb-claim-res-"));
      await testApp.request("POST", "/api/projects", {
        path: tempDir,
        name: "Result Project",
        key: projKey,
      });
    });

    afterAll(async () => {
      await testApp.close();
    });

    test("assigns caller, moves to in_progress at bottom, records claimed activity, emits ticket.moved, ranks dense", async () => {
      // Create an existing ticket in in_progress
      const existingInProgress = await testApp.request(
        "POST",
        `/api/projects/${projKey}/tickets`,
        { title: "Already in progress", column: "in_progress" }
      );
      expect(existingInProgress.body.rank).toBe(0);

      // Create 3 tickets in todo
      const t1 = await testApp.request(
        "POST",
        `/api/projects/${projKey}/tickets`,
        { title: "Todo 1", column: "todo", description: "First todo ticket" }
      );
      const t2 = await testApp.request(
        "POST",
        `/api/projects/${projKey}/tickets`,
        { title: "Todo 2", column: "todo", description: "Second todo ticket" }
      );
      const t3 = await testApp.request(
        "POST",
        `/api/projects/${projKey}/tickets`,
        { title: "Todo 3", column: "todo", description: "Third todo ticket" }
      );

      events.length = 0; // reset collected events

      // 1. Claim via REST with X-AWB-Actor: rest-caller
      const claimRes = await testApp.request(
        "POST",
        `/api/projects/${projKey}/claim`,
        {},
        "rest-caller"
      );
      expect(claimRes.status).toBe(200);
      const ticket = claimRes.body.ticket;
      expect(ticket.key).toBe(t1.body.key);
      expect(ticket.assignee).toBe("rest-caller");
      expect(ticket.column).toBe("in_progress");
      expect(ticket.rank).toBe(1); // placed at bottom of in_progress (0 was existingInProgress)

      // Verify activity
      expect(ticket.activity).toBeDefined();
      const claimedAct = ticket.activity.find((a: any) => a.kind === "claimed");
      expect(claimedAct).toBeDefined();
      expect(claimedAct.actor).toBe("rest-caller");
      expect(claimedAct.payload).toEqual({ from: "todo", to: "in_progress" });

      // Verify ticket.moved event
      const movedEvent = events.find((e) => e.type === "ticket.moved" && e.ticketKey === t1.body.key);
      expect(movedEvent).toBeDefined();
      expect(movedEvent?.actor).toBe("rest-caller");
      expect(movedEvent?.projectKey).toBe(projKey);

      // Verify dense ranks in todo (t2 rank 0, t3 rank 1)
      const boardRes = await testApp.request("GET", `/api/projects/${projKey}/board`);
      const todoCol = boardRes.body.columns.find((c: any) => c.id === "todo");
      expect(todoCol.tickets.map((t: any) => ({ key: t.key, rank: t.rank }))).toEqual([
        { key: t2.body.key, rank: 0 },
        { key: t3.body.key, rank: 1 },
      ]);

      // Verify dense ranks in in_progress
      const inProgCol = boardRes.body.columns.find((c: any) => c.id === "in_progress");
      expect(inProgCol.tickets.map((t: any) => ({ key: t.key, rank: t.rank }))).toEqual([
        { key: existingInProgress.body.key, rank: 0 },
        { key: t1.body.key, rank: 1 },
      ]);

      // 2. Claim via MCP: check actor parameter and ?actor= url param
      const mcpClient = await connectMcp(testApp.app, "url-actor");
      try {
        // Claim with explicit actor argument
        const mcpRes1 = await callTool(mcpClient, "claim_next_ticket", {
          project: projKey,
          actor: "explicit-actor",
        });
        expect(mcpRes1.isError).toBe(false);
        expect(mcpRes1.data.ticket.key).toBe(t2.body.key);
        expect(mcpRes1.data.ticket.assignee).toBe("explicit-actor");
        expect(mcpRes1.data.ticket.rank).toBe(2);

        // Claim with urlActor fallback (?actor=url-actor)
        const mcpRes2 = await callTool(mcpClient, "claim_next_ticket", {
          project: projKey,
        });
        expect(mcpRes2.isError).toBe(false);
        expect(mcpRes2.data.ticket.key).toBe(t3.body.key);
        expect(mcpRes2.data.ticket.assignee).toBe("url-actor");
        expect(mcpRes2.data.ticket.rank).toBe(3);

        // Claim when empty
        const mcpEmpty = await callTool(mcpClient, "claim_next_ticket", {
          project: projKey,
        });
        expect(mcpEmpty.isError).toBe(false);
        expect(mcpEmpty.data.ticket).toBeNull();
      } finally {
        await mcpClient.close();
      }
    });
  });

  describe("CLI claim command", () => {
    let server: TestServer;
    let tempBase: string;
    let repoDir: string;

    beforeAll(async () => {
      server = await startTestServer();
      tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "awb-cli-claim-test-"));
      repoDir = path.join(tempBase, "cli-repo");
      fs.mkdirSync(repoDir, { recursive: true });

      const initRes = await runCli(["init", "--key", "CLI", "--name", "CLI Project"], {
        url: server.url,
        cwd: repoDir,
      });
      expect(initRes.code).toBe(0);
    });

    afterAll(async () => {
      await server.close();
      fs.rmSync(tempBase, { recursive: true, force: true });
    });

    test("prints 'Nothing to claim' when empty, with exit 0; --json prints { ticket: null }", async () => {
      const res = await runCli(["claim"], {
        url: server.url,
        cwd: repoDir,
      });
      expect(res.code).toBe(0);
      expect(res.stdout).toBe("Nothing to claim\n");
      expect(res.stderr).toBe("");

      const resJson = await runCli(["claim", "--json"], {
        url: server.url,
        cwd: repoDir,
      });
      expect(resJson.code).toBe(0);
      const parsed = JSON.parse(resJson.stdout);
      expect(parsed).toEqual({ ticket: null });
    });

    test("prints 'Claimed AWB-4: <title>' followed by description; handles --as and --json", async () => {
      // Create a ticket with description in todo
      const createRes = await runCli(
        [
          "ticket",
          "create",
          "Implement feature XYZ",
          "-d",
          "Line 1: Detailed specification\nLine 2: Acceptance criteria",
          "--column",
          "todo",
        ],
        { url: server.url, cwd: repoDir }
      );
      expect(createRes.code).toBe(0);

      // Claim with --as custom-agent
      const claimRes = await runCli(["claim", "--as", "custom-agent"], {
        url: server.url,
        cwd: repoDir,
      });
      expect(claimRes.code).toBe(0);
      expect(claimRes.stdout).toContain("Claimed CLI-1: Implement feature XYZ");
      expect(claimRes.stdout).toContain("Line 1: Detailed specification\nLine 2: Acceptance criteria");

      // Verify it was assigned to custom-agent and is in_progress
      const showRes = await runCli(["ticket", "show", "CLI-1", "--json"], {
        url: server.url,
        cwd: repoDir,
      });
      const ticket = JSON.parse(showRes.stdout);
      expect(ticket.assignee).toBe("custom-agent");
      expect(ticket.column).toBe("in_progress");

      // Create another ticket and claim with --json
      await runCli(
        ["ticket", "create", "JSON Task", "-d", "JSON description", "--column", "todo"],
        { url: server.url, cwd: repoDir }
      );
      const jsonClaim = await runCli(["claim", "--json", "--as", "json-agent"], {
        url: server.url,
        cwd: repoDir,
      });
      expect(jsonClaim.code).toBe(0);
      const jsonParsed = JSON.parse(jsonClaim.stdout);
      expect(jsonParsed.ticket).not.toBeNull();
      expect(jsonParsed.ticket.key).toBe("CLI-2");
      expect(jsonParsed.ticket.assignee).toBe("json-agent");
    });
  });

  describe("Concurrency", () => {
    test("20 parallel claims via Promise.all with different actors on single app -> exactly 5 distinct tickets, 15 nulls", async () => {
      const testApp = await makeTestApp();
      const projKey = "CONA";
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "awb-conc-1-"));

      await testApp.request("POST", "/api/projects", {
        path: tempDir,
        name: "Concurrent Project 1",
        key: projKey,
      });

      // Create 5 eligible tickets in todo
      const createdKeys: string[] = [];
      for (let i = 1; i <= 5; i++) {
        const t = await testApp.request("POST", `/api/projects/${projKey}/tickets`, {
          title: `Concurrent Ticket ${i}`,
          column: "todo",
        });
        createdKeys.push(t.body.key);
      }

      // Fire 20 claims in parallel via Promise.all
      const claims = await Promise.all(
        Array.from({ length: 20 }, (_, idx) =>
          testApp.request(
            "POST",
            `/api/projects/${projKey}/claim`,
            {},
            `agent-${idx}`
          )
        )
      );

      const successfulClaims = claims.filter((c) => c.status === 200 && c.body.ticket !== null);
      const nullClaims = claims.filter((c) => c.status === 200 && c.body.ticket === null);

      expect(successfulClaims.length).toBe(5);
      expect(nullClaims.length).toBe(15);

      const claimedKeys = successfulClaims.map((c) => c.body.ticket.key);
      const uniqueKeys = new Set(claimedKeys);
      expect(uniqueKeys.size).toBe(5);

      for (const k of createdKeys) {
        expect(uniqueKeys.has(k)).toBe(true);
      }

      // Verify each claimed ticket has a distinct assignee matching the claiming actor
      const assignees = new Set(successfulClaims.map((c) => c.body.ticket.assignee));
      expect(assignees.size).toBe(5);

      await testApp.close();
    });
  });
});
