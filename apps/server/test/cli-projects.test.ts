import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { runCli, startTestServer, type TestServer } from "./helpers.ts";

describe("CLI Projects commands", () => {
  let server: TestServer;
  let tempBase: string;

  beforeAll(async () => {
    server = await startTestServer();
    tempBase = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "awb-cli-test-")));
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tempBase, { recursive: true, force: true });
  });

  test("awb init in a temp dir then awb projects lists it", async () => {
    const repoDir = path.join(tempBase, "my-repo");
    fs.mkdirSync(repoDir, { recursive: true });

    // 1. Run awb init in repoDir
    const initRes = await runCli(["init"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(initRes.code).toBe(0);
    const realRepoDir = fs.realpathSync(repoDir);
    expect(initRes.stdout).toBe(`Registered MR (my-repo) at ${realRepoDir}\n`);
    expect(initRes.stderr).toBe("");

    // 2. Run awb projects
    const listRes = await runCli(["projects"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(listRes.code).toBe(0);
    expect(listRes.stdout).toContain(`MR  my-repo  ${realRepoDir}`);
    expect(listRes.stderr).toBe("");
  });

  test("--json output parses for init and projects", async () => {
    const jsonRepoDir = path.join(tempBase, "json-repo");
    fs.mkdirSync(jsonRepoDir, { recursive: true });

    // init with --json
    const initJsonRes = await runCli(["init", "--json"], {
      url: server.url,
      cwd: jsonRepoDir,
    });
    expect(initJsonRes.code).toBe(0);
    expect(initJsonRes.stderr).toBe("");

    const parsedProject = JSON.parse(initJsonRes.stdout);
    expect(parsedProject.key).toBe("JR");
    expect(parsedProject.name).toBe("json-repo");
    expect(parsedProject.path).toBe(fs.realpathSync(jsonRepoDir));
    expect(typeof parsedProject.createdAt).toBe("string");
    expect(typeof parsedProject.updatedAt).toBe("string");

    // projects with --json
    const listJsonRes = await runCli(["projects", "--json"], {
      url: server.url,
      cwd: jsonRepoDir,
    });
    expect(listJsonRes.code).toBe(0);
    expect(listJsonRes.stderr).toBe("");

    const parsedList = JSON.parse(listJsonRes.stdout);
    expect(Array.isArray(parsedList)).toBe(true);
    const found = parsedList.find((p: any) => p.key === "JR");
    expect(found).toBeDefined();
    expect(found.name).toBe("json-repo");
  });

  test("--as you is refused with exit 2", async () => {
    const repoDir = path.join(tempBase, "actor-repo");
    fs.mkdirSync(repoDir, { recursive: true });

    // Via --as flag
    const flagRes = await runCli(["init", "--as", "you"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(flagRes.code).toBe(2);
    expect(flagRes.stderr).toContain("The actor name 'you' is reserved for the board UI.");

    // Via AWB_ACTOR env var
    const envRes = await runCli(["init"], {
      url: server.url,
      cwd: repoDir,
      env: { AWB_ACTOR: "you" },
    });
    expect(envRes.code).toBe(2);
    expect(envRes.stderr).toContain("The actor name 'you' is reserved for the board UI.");
  });

  test("closed port (--url http://127.0.0.1:1) returns exit 3 with Run `awb start` message", async () => {
    const res = await runCli(["projects", "--url", "http://127.0.0.1:1"], {
      url: server.url,
      cwd: tempBase,
    });
    expect(res.code).toBe(3);
    expect(res.stderr).toBe("AI Work Board server is not running at http://127.0.0.1:1. Run `awb start`.\n");
  });

  test("duplicate init returns exit 1 with error message", async () => {
    const repoDir = path.join(tempBase, "dup-repo");
    fs.mkdirSync(repoDir, { recursive: true });

    const first = await runCli(["init"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(first.code).toBe(0);

    const dup = await runCli(["init"], {
      url: server.url,
      cwd: repoDir,
    });
    expect(dup.code).toBe(1);
    expect(dup.stderr).toContain("error: Path already registered as");
  });

  test("init with explicit --key, --name, and --path", async () => {
    const targetDir = path.join(tempBase, "custom-target");
    fs.mkdirSync(targetDir, { recursive: true });

    const res = await runCli(
      ["init", "--key", "CUST", "--name", "Custom Project", "--path", targetDir],
      {
        url: server.url,
        cwd: tempBase,
      }
    );
    expect(res.code).toBe(0);
    const realTargetDir = fs.realpathSync(targetDir);
    expect(res.stdout).toBe(`Registered CUST (Custom Project) at ${realTargetDir}\n`);

    const listRes = await runCli(["projects"], {
      url: server.url,
      cwd: tempBase,
    });
    expect(listRes.stdout).toContain(`CUST  Custom Project  ${realTargetDir}`);
  });

  test("awb init in a directory reached through a symlink registers the real path", async () => {
    const realDir = path.join(tempBase, "symlink-target-repo");
    fs.mkdirSync(realDir, { recursive: true });
    const symlinkDir = path.join(tempBase, "symlink-alias-repo");
    fs.symlinkSync(realDir, symlinkDir);

    const initRes = await runCli(["init", "--key", "SYM", "--name", "Symlink Repo"], {
      url: server.url,
      cwd: symlinkDir,
    });
    expect(initRes.code).toBe(0);
    const realCanonical = fs.realpathSync(realDir);
    expect(initRes.stdout).toBe(`Registered SYM (Symlink Repo) at ${realCanonical}\n`);

    // Verify projects list has the real path, not the symlink path
    const listRes = await runCli(["projects", "--json"], {
      url: server.url,
      cwd: tempBase,
    });
    const parsedList = JSON.parse(listRes.stdout);
    const symProj = parsedList.find((p: any) => p.key === "SYM");
    expect(symProj).toBeDefined();
    expect(symProj.path).toBe(realCanonical);
  });

  test("awb init on a missing directory exits 2 with an error", async () => {
    const missingDir = path.join(tempBase, "completely-missing-dir");
    const res = await runCli(["init", "--path", missingDir], {
      url: server.url,
      cwd: tempBase,
    });
    expect(res.code).toBe(2);
    expect(res.stderr).toContain("Path does not exist");
  });

  test("awb init on a file exits 2 with an error", async () => {
    const filePath = path.join(tempBase, "file-not-dir.txt");
    fs.writeFileSync(filePath, "test");
    const res = await runCli(["init", "--path", filePath], {
      url: server.url,
      cwd: tempBase,
    });
    expect(res.code).toBe(2);
    expect(res.stderr).toContain("Path is not a directory");
  });
});
