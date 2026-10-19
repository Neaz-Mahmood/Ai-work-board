import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { makeTestApp, type TestApp } from "./helpers.ts";

describe("Board and Tickets search and quick filters", () => {
  let testApp: TestApp;
  let tempBase: string;
  let repoPath: string;
  let featAlphaId: number;
  let featBetaId: number;

  beforeAll(async () => {
    testApp = await makeTestApp();
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "awb-board-filters-test-"));
    repoPath = path.join(tempBase, "repo-bf");
    fs.mkdirSync(repoPath, { recursive: true });

    // Create Project
    await testApp.request("POST", "/api/projects", {
      path: repoPath,
      name: "Board Filters Project",
      key: "BF",
    });

    // Create Features
    const featAlphaRes = await testApp.request("POST", "/api/projects/BF/features", {
      name: "Feature Alpha",
      description: "First feature",
    });
    featAlphaId = featAlphaRes.body.feature.id;

    const featBetaRes = await testApp.request("POST", "/api/projects/BF/features", {
      name: "Feature Beta",
      description: "Second feature",
    });
    featBetaId = featBetaRes.body.feature.id;

    // Create Tickets:
    // T1: BF-1, backlog, alice, Feature Alpha
    await testApp.request("POST", "/api/projects/BF/tickets", {
      title: "Fix login auth redirect",
      description: "Users cannot log in via SSO",
      column: "backlog",
      assignee: "alice",
      featureId: featAlphaId,
    });

    // T2: BF-2, todo, bob, Feature Beta
    await testApp.request("POST", "/api/projects/BF/tickets", {
      title: "Add dark mode toggle",
      description: "Settings page needs theme switch",
      column: "todo",
      assignee: "bob",
      featureId: featBetaId,
    });

    // T3: BF-3, in_progress, alice, No feature
    await testApp.request("POST", "/api/projects/BF/tickets", {
      title: "Update billing checkout",
      description: "Stripe webhook handling for cards",
      column: "in_progress",
      assignee: "alice",
    });

    // T4: BF-4, in_review, unassigned, Feature Alpha
    await testApp.request("POST", "/api/projects/BF/tickets", {
      title: "Database index optimization",
      description: "Slow query on tickets table",
      column: "in_review",
      featureId: featAlphaId,
    });

    // T5: BF-5, done, unassigned, No feature
    await testApp.request("POST", "/api/projects/BF/tickets", {
      title: "Documentation for API v2",
      description: "Document REST endpoints and filters",
      column: "done",
    });
  });

  afterAll(async () => {
    await testApp.close();
    fs.rmSync(tempBase, { recursive: true, force: true });
  });

  test("unfiltered board returns all tickets and counts", async () => {
    const res = await testApp.request("GET", "/api/projects/BF/board");
    expect(res.status).toBe(200);

    const totalTickets = res.body.columns.reduce(
      (sum: number, c: any) => sum + c.tickets.length,
      0
    );
    expect(totalTickets).toBe(5);
    expect(res.body.project.counts).toEqual({
      backlog: 1,
      todo: 1,
      in_progress: 1,
      in_review: 1,
      done: 1,
    });
    expect(res.body.features).toHaveLength(2);
    expect(res.body.actors.length).toBeGreaterThanOrEqual(2);
  });

  describe("Board 'q' parameter: case-insensitive substring match on key, title, and description", () => {
    test("q matches ticket key case-insensitively", async () => {
      const resUpper = await testApp.request("GET", "/api/projects/BF/board?q=BF-1");
      expect(resUpper.status).toBe(200);
      const ticketsUpper = resUpper.body.columns.flatMap((c: any) => c.tickets);
      expect(ticketsUpper).toHaveLength(1);
      expect(ticketsUpper[0].key).toBe("BF-1");

      const resLower = await testApp.request("GET", "/api/projects/BF/board?q=bf-1");
      expect(resLower.status).toBe(200);
      const ticketsLower = resLower.body.columns.flatMap((c: any) => c.tickets);
      expect(ticketsLower).toHaveLength(1);
      expect(ticketsLower[0].key).toBe("BF-1");
    });

    test("q matches title substring case-insensitively", async () => {
      const res = await testApp.request("GET", "/api/projects/BF/board?q=AUTH");
      expect(res.status).toBe(200);
      const tickets = res.body.columns.flatMap((c: any) => c.tickets);
      expect(tickets).toHaveLength(1);
      expect(tickets[0].title).toBe("Fix login auth redirect");
      expect(res.body.project.counts.backlog).toBe(1);
      expect(res.body.project.counts.todo).toBe(0);
    });

    test("q matches description substring case-insensitively", async () => {
      const res = await testApp.request("GET", "/api/projects/BF/board?q=theme");
      expect(res.status).toBe(200);
      const tickets = res.body.columns.flatMap((c: any) => c.tickets);
      expect(tickets).toHaveLength(1);
      expect(tickets[0].title).toBe("Add dark mode toggle");
      expect(res.body.project.counts.todo).toBe(1);
      expect(res.body.project.counts.backlog).toBe(0);
    });

    test("q with no matches returns empty columns and 0 counts", async () => {
      const res = await testApp.request("GET", "/api/projects/BF/board?q=nonexistent_xyz");
      expect(res.status).toBe(200);
      const tickets = res.body.columns.flatMap((c: any) => c.tickets);
      expect(tickets).toHaveLength(0);
      for (const col of res.body.columns) {
        expect(col.tickets).toHaveLength(0);
      }
      expect(res.body.project.counts).toEqual({
        backlog: 0,
        todo: 0,
        in_progress: 0,
        in_review: 0,
        done: 0,
      });
    });
  });

  describe("Board 'feature' parameter: single, multiple, and 'none'", () => {
    test("single feature id", async () => {
      const res = await testApp.request("GET", `/api/projects/BF/board?feature=${featAlphaId}`);
      expect(res.status).toBe(200);
      const tickets = res.body.columns.flatMap((c: any) => c.tickets);
      expect(tickets.map((t: any) => t.key).sort()).toEqual(["BF-1", "BF-4"].sort());
      expect(res.body.project.counts.backlog).toBe(1);
      expect(res.body.project.counts.in_review).toBe(1);
      expect(res.body.project.counts.todo).toBe(0);
    });

    test("multiple feature ids (comma-separated)", async () => {
      const res = await testApp.request(
        "GET",
        `/api/projects/BF/board?feature=${featAlphaId},${featBetaId}`
      );
      expect(res.status).toBe(200);
      const tickets = res.body.columns.flatMap((c: any) => c.tickets);
      expect(tickets.map((t: any) => t.key).sort()).toEqual(["BF-1", "BF-2", "BF-4"].sort());
      expect(res.body.project.counts.backlog).toBe(1);
      expect(res.body.project.counts.todo).toBe(1);
      expect(res.body.project.counts.in_review).toBe(1);
      expect(res.body.project.counts.in_progress).toBe(0);
    });

    test("feature='none' matches cards without a feature", async () => {
      const res = await testApp.request("GET", "/api/projects/BF/board?feature=none");
      expect(res.status).toBe(200);
      const tickets = res.body.columns.flatMap((c: any) => c.tickets);
      expect(tickets.map((t: any) => t.key).sort()).toEqual(["BF-3", "BF-5"].sort());
      expect(res.body.project.counts.in_progress).toBe(1);
      expect(res.body.project.counts.done).toBe(1);
      expect(res.body.project.counts.backlog).toBe(0);
    });

    test("feature combining id and 'none'", async () => {
      const res = await testApp.request("GET", `/api/projects/BF/board?feature=${featBetaId},none`);
      expect(res.status).toBe(200);
      const tickets = res.body.columns.flatMap((c: any) => c.tickets);
      expect(tickets.map((t: any) => t.key).sort()).toEqual(["BF-2", "BF-3", "BF-5"].sort());
    });
  });

  describe("Board 'assignee' parameter: single, multiple, and 'none'", () => {
    test("single assignee", async () => {
      const res = await testApp.request("GET", "/api/projects/BF/board?assignee=alice");
      expect(res.status).toBe(200);
      const tickets = res.body.columns.flatMap((c: any) => c.tickets);
      expect(tickets.map((t: any) => t.key).sort()).toEqual(["BF-1", "BF-3"].sort());
      expect(res.body.project.counts.backlog).toBe(1);
      expect(res.body.project.counts.in_progress).toBe(1);
      expect(res.body.project.counts.todo).toBe(0);
    });

    test("multiple assignees (comma-separated)", async () => {
      const res = await testApp.request("GET", "/api/projects/BF/board?assignee=alice,bob");
      expect(res.status).toBe(200);
      const tickets = res.body.columns.flatMap((c: any) => c.tickets);
      expect(tickets.map((t: any) => t.key).sort()).toEqual(["BF-1", "BF-2", "BF-3"].sort());
    });

    test("assignee='none' matches unassigned cards", async () => {
      const res = await testApp.request("GET", "/api/projects/BF/board?assignee=none");
      expect(res.status).toBe(200);
      const tickets = res.body.columns.flatMap((c: any) => c.tickets);
      expect(tickets.map((t: any) => t.key).sort()).toEqual(["BF-4", "BF-5"].sort());
      expect(res.body.project.counts.in_review).toBe(1);
      expect(res.body.project.counts.done).toBe(1);
    });

    test("assignee combining actor name and 'none'", async () => {
      const res = await testApp.request("GET", "/api/projects/BF/board?assignee=bob,none");
      expect(res.status).toBe(200);
      const tickets = res.body.columns.flatMap((c: any) => c.tickets);
      expect(tickets.map((t: any) => t.key).sort()).toEqual(["BF-2", "BF-4", "BF-5"].sort());
    });
  });

  describe("Combinations with AND", () => {
    test("combining feature and assignee", async () => {
      // Feature Alpha + alice -> BF-1 only (BF-4 has Feature Alpha but is unassigned)
      const res = await testApp.request(
        "GET",
        `/api/projects/BF/board?feature=${featAlphaId}&assignee=alice`
      );
      expect(res.status).toBe(200);
      const tickets = res.body.columns.flatMap((c: any) => c.tickets);
      expect(tickets).toHaveLength(1);
      expect(tickets[0].key).toBe("BF-1");
    });

    test("combining feature=none and assignee=none", async () => {
      // BF-5 is both unassigned and without a feature
      const res = await testApp.request(
        "GET",
        "/api/projects/BF/board?feature=none&assignee=none"
      );
      expect(res.status).toBe(200);
      const tickets = res.body.columns.flatMap((c: any) => c.tickets);
      expect(tickets).toHaveLength(1);
      expect(tickets[0].key).toBe("BF-5");
    });

    test("combining q, feature, and assignee", async () => {
      // q=stripe & feature=none & assignee=alice -> BF-3
      const res = await testApp.request(
        "GET",
        "/api/projects/BF/board?q=stripe&feature=none&assignee=alice"
      );
      expect(res.status).toBe(200);
      const tickets = res.body.columns.flatMap((c: any) => c.tickets);
      expect(tickets).toHaveLength(1);
      expect(tickets[0].key).toBe("BF-3");
    });
  });

  describe("Board.features and Board.actors remain unfiltered", () => {
    test("features and actors are always unfiltered even when board is heavily filtered", async () => {
      const res = await testApp.request(
        "GET",
        `/api/projects/BF/board?feature=${featAlphaId}&assignee=alice`
      );
      expect(res.status).toBe(200);

      // Features list contains all features of the project
      expect(res.body.features).toHaveLength(2);
      expect(res.body.features.map((f: any) => f.name).sort()).toEqual(
        ["Feature Alpha", "Feature Beta"].sort()
      );

      // Actors list contains all known actors
      const actorNames = res.body.actors.map((a: any) => a.name);
      expect(actorNames).toContain("alice");
      expect(actorNames).toContain("bob");
    });
  });

  describe("Tickets list endpoint (GET /api/projects/:key/tickets) accepts the same parameters", () => {
    test("tickets endpoint with q", async () => {
      const res = await testApp.request("GET", "/api/projects/BF/tickets?q=auth");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].key).toBe("BF-1");
    });

    test("tickets endpoint with single, multiple, and 'none' feature", async () => {
      const resSingle = await testApp.request(
        "GET",
        `/api/projects/BF/tickets?feature=${featBetaId}`
      );
      expect(resSingle.status).toBe(200);
      expect(resSingle.body).toHaveLength(1);
      expect(resSingle.body[0].key).toBe("BF-2");

      const resMulti = await testApp.request(
        "GET",
        `/api/projects/BF/tickets?feature=${featAlphaId},${featBetaId}`
      );
      expect(resMulti.status).toBe(200);
      expect(resMulti.body.map((t: any) => t.key).sort()).toEqual(["BF-1", "BF-2", "BF-4"].sort());

      const resNone = await testApp.request("GET", "/api/projects/BF/tickets?feature=none");
      expect(resNone.status).toBe(200);
      expect(resNone.body.map((t: any) => t.key).sort()).toEqual(["BF-3", "BF-5"].sort());
    });

    test("tickets endpoint with single, multiple, and 'none' assignee", async () => {
      const resSingle = await testApp.request("GET", "/api/projects/BF/tickets?assignee=bob");
      expect(resSingle.status).toBe(200);
      expect(resSingle.body).toHaveLength(1);
      expect(resSingle.body[0].key).toBe("BF-2");

      const resMulti = await testApp.request("GET", "/api/projects/BF/tickets?assignee=alice,bob");
      expect(resMulti.status).toBe(200);
      expect(resMulti.body.map((t: any) => t.key).sort()).toEqual(["BF-1", "BF-2", "BF-3"].sort());

      const resNone = await testApp.request("GET", "/api/projects/BF/tickets?assignee=none");
      expect(resNone.status).toBe(200);
      expect(resNone.body.map((t: any) => t.key).sort()).toEqual(["BF-4", "BF-5"].sort());
    });

    test("tickets endpoint with combined filters", async () => {
      const res = await testApp.request(
        "GET",
        `/api/projects/BF/tickets?feature=${featAlphaId}&assignee=alice&q=login`
      );
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].key).toBe("BF-1");
    });
  });
});
