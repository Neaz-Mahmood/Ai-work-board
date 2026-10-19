import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { makeTestApp, type TestApp } from "./helpers.ts";

describe("Concurrency", () => {
  let testApp: TestApp;
  let tempDir: string;

  beforeAll(async () => {
    testApp = await makeTestApp();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "awb-concurrency-test-"));
  });

  afterAll(async () => {
    await testApp.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("10 concurrent claims against 5 eligible todo tickets -> 5 claimed, 5 null", async () => {
    const projKey = "CCLM";
    const projDir = path.join(tempDir, "claim-proj");
    fs.mkdirSync(projDir, { recursive: true });

    await testApp.request("POST", "/api/projects", {
      path: projDir,
      name: "Concurrent Claim Project",
      key: projKey,
    });

    const createdKeys: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const res = await testApp.request("POST", `/api/projects/${projKey}/tickets`, {
        title: `Eligible Ticket ${i}`,
        column: "todo",
      });
      createdKeys.push(res.body.key);
    }

    const claims = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        testApp.request("POST", `/api/projects/${projKey}/claim`, {}, `claim-actor-${i}`)
      )
    );

    const claimed = claims.filter((c) => c.status === 200 && c.body.ticket !== null);
    const empty = claims.filter((c) => c.status === 200 && c.body.ticket === null);

    expect(claimed.length).toBe(5);
    expect(empty.length).toBe(5);

    const claimedKeys = new Set(claimed.map((c) => c.body.ticket.key));
    expect(claimedKeys.size).toBe(5);
    for (const key of createdKeys) {
      expect(claimedKeys.has(key)).toBe(true);
    }

    const assignees = new Set(claimed.map((c) => c.body.ticket.assignee));
    expect(assignees.size).toBe(5);
  });

  test("10 concurrent moves within one column -> ranks are exactly 0..n-1", async () => {
    const projKey = "CMOV";
    const projDir = path.join(tempDir, "move-proj");
    fs.mkdirSync(projDir, { recursive: true });

    await testApp.request("POST", "/api/projects", {
      path: projDir,
      name: "Concurrent Move Project",
      key: projKey,
    });

    const createdTickets: { key: string; rank: number }[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await testApp.request("POST", `/api/projects/${projKey}/tickets`, {
        title: `Move Ticket ${i}`,
        column: "todo",
      });
      createdTickets.push({ key: res.body.key, rank: res.body.rank });
    }

    // Move all 10 tickets concurrently within the todo column to different target positions
    const moveResults = await Promise.all(
      createdTickets.map((t, idx) =>
        testApp.request(
          "POST",
          `/api/tickets/${t.key}/move`,
          {
            column: "todo",
            position: (idx * 3 + 1) % 10,
          },
          `mover-${idx}`
        )
      )
    );

    for (const res of moveResults) {
      expect(res.status).toBe(200);
    }

    const boardRes = await testApp.request("GET", `/api/projects/${projKey}/board`);
    expect(boardRes.status).toBe(200);
    const todoColumn = boardRes.body.columns.find((c: any) => c.id === "todo");
    expect(todoColumn).toBeDefined();
    expect(todoColumn.tickets.length).toBe(10);

    const ranks = todoColumn.tickets.map((t: any) => t.rank).sort((a: number, b: number) => a - b);
    expect(ranks).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
