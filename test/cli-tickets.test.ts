import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { runCli, startTestServer, type TestServer } from "./helpers.ts";
import { parseColumn } from "../src/cli/columns.ts";

describe("CLI Tickets commands", () => {
  let server: TestServer;
  let tempBase: string;
  let repoDir: string;

  beforeAll(async () => {
    server = await startTestServer();
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "awb-cli-tickets-test-"));
    repoDir = path.join(tempBase, "cli-repo");
    fs.mkdirSync(repoDir, { recursive: true });

    // Initialize project
    const initRes = await runCli(["init", "--key", "CLI", "--name", "CLI Repo"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(initRes.code).toBe(0);
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tempBase, { recursive: true, force: true });
  });

  test("column parsing unit cases", () => {
    expect(parseColumn("backlog")).toBe("backlog");
    expect(parseColumn("BACKLOG")).toBe("backlog");
    expect(parseColumn("todo")).toBe("todo");
    expect(parseColumn("to-do")).toBe("todo");
    expect(parseColumn("to_do")).toBe("todo");
    expect(parseColumn("TODO")).toBe("todo");
    expect(parseColumn("in-progress")).toBe("in_progress");
    expect(parseColumn("in_progress")).toBe("in_progress");
    expect(parseColumn("IN-PROGRESS")).toBe("in_progress");
    expect(parseColumn("in-review")).toBe("in_review");
    expect(parseColumn("in_review")).toBe("in_review");
    expect(parseColumn("IN_REVIEW")).toBe("in_review");
    expect(parseColumn("done")).toBe("done");
    expect(parseColumn("DONE")).toBe("done");

    expect(() => parseColumn("invalid-column")).toThrowError(/Invalid column/);
  });

  test("awb ticket create: default, flags, description file, and json", async () => {
    // 1. Simple create with title
    const res1 = await runCli(["ticket", "create", "First CLI Ticket"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(res1.code).toBe(0);
    expect(res1.stdout).toBe("Created CLI-1\n");
    expect(res1.stderr).toBe("");

    // 2. Create with -d, --column, --priority, --assignee
    const res2 = await runCli(
      [
        "ticket",
        "create",
        "Second CLI Ticket",
        "-d",
        "Short description here",
        "--column",
        "to-do",
        "--priority",
        "high",
        "--assignee",
        "agent-smith",
      ],
      {
        url: server.url,
        cwd: repoDir,
      }
    );
    expect(res2.code).toBe(0);
    expect(res2.stdout).toBe("Created CLI-2\n");

    // 3. Create with --description-file
    const descFile = path.join(tempBase, "task-desc.md");
    fs.writeFileSync(descFile, "## Detailed Markdown\n\n- point 1\n- point 2");
    const res3 = await runCli(
      [
        "ticket",
        "create",
        "Third CLI Ticket",
        "--description-file",
        descFile,
        "--column",
        "in-progress",
      ],
      {
        url: server.url,
        cwd: repoDir,
      }
    );
    expect(res3.code).toBe(0);
    expect(res3.stdout).toBe("Created CLI-3\n");

    // 4. Create with --json
    const resJson = await runCli(
      ["ticket", "create", "JSON CLI Ticket", "--json"],
      {
        url: server.url,
        cwd: repoDir,
      }
    );
    expect(resJson.code).toBe(0);
    const parsed = JSON.parse(resJson.stdout);
    expect(parsed.key).toBe("CLI-4");
    expect(parsed.title).toBe("JSON CLI Ticket");
    expect(parsed.column).toBe("backlog");
    expect(parsed.priority).toBe("medium");
  });

  test("awb ticket show: formatted and json", async () => {
    // 1. Formatted show for CLI-2
    const resShow = await runCli(["ticket", "show", "CLI-2"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(resShow.code).toBe(0);
    expect(resShow.stdout).toContain("CLI-2: Second CLI Ticket");
    expect(resShow.stdout).toContain("Column: todo");
    expect(resShow.stdout).toContain("Priority: high");
    expect(resShow.stdout).toContain("Assignee: agent-smith");
    expect(resShow.stdout).toContain("Short description here");
    expect(resShow.stdout).toContain("Activity:");
    expect(resShow.stdout).toContain("created");

    // 2. JSON show
    const resShowJson = await runCli(["ticket", "show", "CLI-2", "--json"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(resShowJson.code).toBe(0);
    const parsed = JSON.parse(resShowJson.stdout);
    expect(parsed.key).toBe("CLI-2");
    expect(parsed.title).toBe("Second CLI Ticket");
    expect(parsed.assignee).toBe("agent-smith");

    // 3. Missing key
    const resMissing = await runCli(["ticket", "show"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(resMissing.code).toBe(2);
    expect(resMissing.stderr).toContain("Error: Ticket key is required");

    // 4. Non-existent ticket
    const resNotFound = await runCli(["ticket", "show", "CLI-999"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(resNotFound.code).toBe(1);
    expect(resNotFound.stderr).toContain("not found");
  });

  test("awb ticket list: all, filters, and json", async () => {
    // 1. List all
    const resAll = await runCli(["ticket", "list"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(resAll.code).toBe(0);
    expect(resAll.stdout).toContain("CLI-1");
    expect(resAll.stdout).toContain("CLI-2");
    expect(resAll.stdout).toContain("CLI-3");
    expect(resAll.stdout).toContain("CLI-4");
    expect(resAll.stdout).toContain("@agent-smith");

    // 2. Filter by column (case-insensitive with hyphen)
    const resCol = await runCli(["ticket", "list", "--column", "in-progress"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(resCol.code).toBe(0);
    expect(resCol.stdout).toContain("CLI-3");
    expect(resCol.stdout).not.toContain("CLI-1");
    expect(resCol.stdout).not.toContain("CLI-2");

    // 3. Filter by assignee
    const resAssignee = await runCli(
      ["ticket", "list", "--assignee", "agent-smith"],
      {
        url: server.url,
        cwd: repoDir,
      }
    );
    expect(resAssignee.code).toBe(0);
    expect(resAssignee.stdout).toContain("CLI-2");
    expect(resAssignee.stdout).not.toContain("CLI-1");

    // 4. Filter by query
    const resQuery = await runCli(["ticket", "list", "--query", "Third"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(resQuery.code).toBe(0);
    expect(resQuery.stdout).toContain("CLI-3");
    expect(resQuery.stdout).not.toContain("CLI-1");

    // 5. JSON list
    const resJson = await runCli(["ticket", "list", "--json"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(resJson.code).toBe(0);
    const parsed = JSON.parse(resJson.stdout);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThanOrEqual(4);
  });

  test("awb board: columns with counts, card lines, and json", async () => {
    // 1. Text output
    const resBoard = await runCli(["board"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(resBoard.code).toBe(0);
    expect(resBoard.stdout).toContain("== Backlog (2) ==");
    expect(resBoard.stdout).toContain("== To Do (1) ==");
    expect(resBoard.stdout).toContain("== In Progress (1) ==");
    expect(resBoard.stdout).toContain("== In Review (0) ==");
    expect(resBoard.stdout).toContain("== Done (0) ==");
    expect(resBoard.stdout).toContain("CLI-2  [high]  Second CLI Ticket  @agent-smith");

    // 2. JSON output
    const resBoardJson = await runCli(["board", "--json"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(resBoardJson.code).toBe(0);
    const parsed = JSON.parse(resBoardJson.stdout);
    expect(parsed.project.key).toBe("CLI");
    expect(parsed.columns).toHaveLength(5);
    expect(parsed.columns[0].id).toBe("backlog");
    expect(parsed.columns[0].tickets).toHaveLength(2);
    expect(parsed.columns[1].id).toBe("todo");
    expect(parsed.columns[1].tickets).toHaveLength(1);
    expect(parsed.columns[2].id).toBe("in_progress");
    expect(parsed.columns[2].tickets).toHaveLength(1);
  });

  test("awb board and ticket commands support explicit --project flag", async () => {
    const otherDir = path.join(tempBase, "other-dir");
    fs.mkdirSync(otherDir, { recursive: true });

    // Explicit project flag works even from unregistered directory
    const resBoard = await runCli(["board", "--project", "CLI"], {
      url: server.url,
      cwd: otherDir,
    });
    expect(resBoard.code).toBe(0);
    expect(resBoard.stdout).toContain("== Backlog (2) ==");

    const resList = await runCli(["ticket", "list", "--project", "CLI"], {
      url: server.url,
      cwd: otherDir,
    });
    expect(resList.code).toBe(0);
    expect(resList.stdout).toContain("CLI-1");
  });

  test("invalid column in CLI commands exits with code 1", async () => {
    const res = await runCli(["ticket", "list", "--column", "not-a-column"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("Invalid column");
  });
});
