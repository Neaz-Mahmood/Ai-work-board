import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { runCli, startTestServer, type TestServer } from "./helpers.ts";

describe("CLI Ticket Update and Move commands", () => {
  let server: TestServer;
  let tempBase: string;
  let repoDir: string;

  beforeAll(async () => {
    server = await startTestServer();
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "awb-cli-edit-test-"));
    repoDir = path.join(tempBase, "cli-edit-repo");
    fs.mkdirSync(repoDir, { recursive: true });

    // Initialize project
    const initRes = await runCli(["init", "--key", "CLED", "--name", "CLI Edit Repo"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(initRes.code).toBe(0);
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tempBase, { recursive: true, force: true });
  });

  test("awb ticket update with title, description, priority, assignee", async () => {
    // 1. Create a ticket
    const createRes = await runCli(["ticket", "create", "Original CLI Ticket"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(createRes.code).toBe(0);
    expect(createRes.stdout).toBe("Created CLED-1\n");

    // 2. Update title
    const updateTitleRes = await runCli(
      ["ticket", "update", "CLED-1", "--title", "Updated CLI Title"],
      { url: server.url, cwd: repoDir }
    );
    expect(updateTitleRes.code).toBe(0);
    expect(updateTitleRes.stdout).toBe("Updated CLED-1\n");

    // 3. Update description with -d
    const updateDescRes = await runCli(
      ["ticket", "update", "CLED-1", "-d", "Updated description via -d"],
      { url: server.url, cwd: repoDir }
    );
    expect(updateDescRes.code).toBe(0);
    expect(updateDescRes.stdout).toBe("Updated CLED-1\n");

    // 4. Update description with --description-file
    const descFile = path.join(tempBase, "update-desc.md");
    fs.writeFileSync(descFile, "# File Based Description\nContent goes here");
    const updateDescFileRes = await runCli(
      ["ticket", "update", "CLED-1", "--description-file", descFile],
      { url: server.url, cwd: repoDir }
    );
    expect(updateDescFileRes.code).toBe(0);
    expect(updateDescFileRes.stdout).toBe("Updated CLED-1\n");

    // 5. Update priority
    const updatePrioRes = await runCli(
      ["ticket", "update", "CLED-1", "--priority", "highest"],
      { url: server.url, cwd: repoDir }
    );
    expect(updatePrioRes.code).toBe(0);
    expect(updatePrioRes.stdout).toBe("Updated CLED-1\n");

    // 6. Update assignee
    const updateAssignRes = await runCli(
      ["ticket", "update", "CLED-1", "--assignee", "agent-bond"],
      { url: server.url, cwd: repoDir }
    );
    expect(updateAssignRes.code).toBe(0);
    expect(updateAssignRes.stdout).toBe("Updated CLED-1\n");

    // Verify state with ticket show --json
    const showRes = await runCli(["ticket", "show", "CLED-1", "--json"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(showRes.code).toBe(0);
    const ticket = JSON.parse(showRes.stdout);
    expect(ticket.title).toBe("Updated CLI Title");
    expect(ticket.description).toBe("# File Based Description\nContent goes here");
    expect(ticket.priority).toBe("highest");
    expect(ticket.assignee).toBe("agent-bond");

    // 7. Unset assignee with --assignee none
    const unsetAssignRes = await runCli(
      ["ticket", "update", "CLED-1", "--assignee", "none"],
      { url: server.url, cwd: repoDir }
    );
    expect(unsetAssignRes.code).toBe(0);
    expect(unsetAssignRes.stdout).toBe("Updated CLED-1\n");

    const showAfterUnset = await runCli(["ticket", "show", "CLED-1", "--json"], {
      url: server.url,
      cwd: repoDir,
    });
    const ticketAfterUnset = JSON.parse(showAfterUnset.stdout);
    expect(ticketAfterUnset.assignee).toBeNull();
  });

  test("awb ticket update with --json and --as actor attribution", async () => {
    const res = await runCli(
      [
        "ticket",
        "update",
        "CLED-1",
        "--title",
        "JSON Title",
        "--as",
        "operator-x",
        "--json",
      ],
      { url: server.url, cwd: repoDir }
    );
    expect(res.code).toBe(0);
    const ticket = JSON.parse(res.stdout);
    expect(ticket.title).toBe("JSON Title");
    const lastAct = ticket.activity[ticket.activity.length - 1];
    expect(lastAct.actor).toBe("operator-x");
  });

  test("awb ticket update error cases", async () => {
    // Missing key
    const resNoKey = await runCli(["ticket", "update"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(resNoKey.code).toBe(2);
    expect(resNoKey.stderr).toContain("key is required");

    // Actor 'you' rejected
    const resYou = await runCli(
      ["ticket", "update", "CLED-1", "--as", "you", "--title", "Forbidden"],
      { url: server.url, cwd: repoDir }
    );
    expect(resYou.code).toBe(2);
    expect(resYou.stderr).toContain("reserved");

    // Missing description file
    const resBadFile = await runCli(
      ["ticket", "update", "CLED-1", "--description-file", "nonexistent-file.md"],
      { url: server.url, cwd: repoDir }
    );
    expect(resBadFile.code).toBe(1);
    expect(resBadFile.stderr).toContain("Description file not found");
  });

  test("awb ticket move with columns, position, and formatting", async () => {
    // Create second ticket
    const c2 = await runCli(["ticket", "create", "Second Ticket For Move"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(c2.code).toBe(0);
    expect(c2.stdout).toBe("Created CLED-2\n");

    // 1. Move to in-review
    const move1 = await runCli(["ticket", "move", "CLED-1", "in-review"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(move1.code).toBe(0);
    expect(move1.stdout).toBe("Moved CLED-1 to In Review\n");

    // 2. Move to to-do with --position 0
    const move2 = await runCli(
      ["ticket", "move", "CLED-2", "to-do", "--position", "0"],
      { url: server.url, cwd: repoDir }
    );
    expect(move2.code).toBe(0);
    expect(move2.stdout).toBe("Moved CLED-2 to To Do\n");

    // 3. Move with uppercase and hyphen/underscore parsing
    const move3 = await runCli(["ticket", "move", "CLED-1", "IN_PROGRESS"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(move3.code).toBe(0);
    expect(move3.stdout).toBe("Moved CLED-1 to In Progress\n");

    // 4. Move to done with --json
    const moveDoneJson = await runCli(
      ["ticket", "move", "CLED-1", "done", "--json"],
      { url: server.url, cwd: repoDir }
    );
    expect(moveDoneJson.code).toBe(0);
    const movedTicket = JSON.parse(moveDoneJson.stdout);
    expect(movedTicket.column).toBe("done");
  });

  test("awb ticket move error cases", async () => {
    // Missing key
    const resNoKey = await runCli(["ticket", "move"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(resNoKey.code).toBe(2);
    expect(resNoKey.stderr).toContain("key is required");

    // Missing column
    const resNoCol = await runCli(["ticket", "move", "CLED-1"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(resNoCol.code).toBe(2);
    expect(resNoCol.stderr).toContain("Column is required");

    // Invalid column
    const resBadCol = await runCli(["ticket", "move", "CLED-1", "invalid_column"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(resBadCol.code).toBe(1);
    expect(resBadCol.stderr).toContain("Invalid column");

    // Invalid position
    const resBadPos = await runCli(
      ["ticket", "move", "CLED-1", "todo", "--position", "not-a-number"],
      { url: server.url, cwd: repoDir }
    );
    expect(resBadPos.code).toBe(1);
    expect(resBadPos.stderr).toContain("Position must be a number");
  });
});
