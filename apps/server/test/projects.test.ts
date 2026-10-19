import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { makeTestApp, type TestApp } from "./helpers.ts";

describe("Projects REST API", () => {
  let testApp: TestApp;
  let tempBase: string;

  beforeAll(async () => {
    testApp = await makeTestApp();
    tempBase = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "awb-projects-test-")));
  });

  afterAll(async () => {
    await testApp.close();
    fs.rmSync(tempBase, { recursive: true, force: true });
  });

  test("create, list, get, rename, delete project lifecycle", async () => {
    const projDir = path.join(tempBase, "lifecycle-proj");
    fs.mkdirSync(projDir, { recursive: true });

    // Create
    const createRes = await testApp.request("POST", "/api/projects", {
      path: projDir,
      name: "Lifecycle Project",
      key: "LIFE",
    });
    expect(createRes.status).toBe(201);
    expect(createRes.body).toEqual({
      key: "LIFE",
      name: "Lifecycle Project",
      path: fs.realpathSync(projDir),
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    // List
    const listRes = await testApp.request("GET", "/api/projects");
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    const found = listRes.body.find((p: any) => p.key === "LIFE");
    expect(found).toBeDefined();
    expect(found.name).toBe("Lifecycle Project");

    // Get
    const getRes = await testApp.request("GET", "/api/projects/LIFE");
    expect(getRes.status).toBe(200);
    expect(getRes.body.key).toBe("LIFE");
    expect(getRes.body.name).toBe("Lifecycle Project");

    // Rename
    const renameRes = await testApp.request("PATCH", "/api/projects/LIFE", {
      name: "Renamed Lifecycle",
    });
    expect(renameRes.status).toBe(200);
    expect(renameRes.body.name).toBe("Renamed Lifecycle");
    expect(renameRes.body.key).toBe("LIFE");

    // Verify rename reflected in get
    const getAfterRename = await testApp.request("GET", "/api/projects/LIFE");
    expect(getAfterRename.body.name).toBe("Renamed Lifecycle");

    // Delete
    const deleteRes = await testApp.request("DELETE", "/api/projects/LIFE");
    expect(deleteRes.status).toBe(204);

    // Verify deleted
    const getAfterDelete = await testApp.request("GET", "/api/projects/LIFE");
    expect(getAfterDelete.status).toBe(404);
    expect(getAfterDelete.body).toEqual({
      error: { code: "NOT_FOUND", message: "Project LIFE not found" },
    });
  });

  test("key derivation examples from spec", async () => {
    // 1. ai-work-board -> AWB
    const dirAWB = path.join(tempBase, "ai-work-board");
    fs.mkdirSync(dirAWB, { recursive: true });
    const resAWB = await testApp.request("POST", "/api/projects", { path: dirAWB });
    expect(resAWB.status).toBe(201);
    expect(resAWB.body.key).toBe("AWB");
    expect(resAWB.body.name).toBe("ai-work-board");

    // 2. myCoolApp -> MCA
    const dirMCA = path.join(tempBase, "myCoolApp");
    fs.mkdirSync(dirMCA, { recursive: true });
    const resMCA = await testApp.request("POST", "/api/projects", { path: dirMCA });
    expect(resMCA.status).toBe(201);
    expect(resMCA.body.key).toBe("MCA");

    // 3. backend -> BAC
    const dirBAC = path.join(tempBase, "backend");
    fs.mkdirSync(dirBAC, { recursive: true });
    const resBAC = await testApp.request("POST", "/api/projects", { path: dirBAC });
    expect(resBAC.status).toBe(201);
    expect(resBAC.body.key).toBe("BAC");

    // 4. a-b-c-d-e-f-g -> ABCDE
    const dirABCDE = path.join(tempBase, "a-b-c-d-e-f-g");
    fs.mkdirSync(dirABCDE, { recursive: true });
    const resABCDE = await testApp.request("POST", "/api/projects", { path: dirABCDE });
    expect(resABCDE.status).toBe(201);
    expect(resABCDE.body.key).toBe("ABCDE");

    // 5. AWB taken -> AWB2
    const dirAWBCollision = path.join(tempBase, "sub1", "ai-work-board");
    fs.mkdirSync(dirAWBCollision, { recursive: true });
    const resAWB2 = await testApp.request("POST", "/api/projects", { path: dirAWBCollision });
    expect(resAWB2.status).toBe(201);
    expect(resAWB2.body.key).toBe("AWB2");

    // 6. ABCDE taken -> ABCD2
    const dirABCDECollision = path.join(tempBase, "sub2", "a-b-c-d-e-f-g");
    fs.mkdirSync(dirABCDECollision, { recursive: true });
    const resABCD2 = await testApp.request("POST", "/api/projects", { path: dirABCDECollision });
    expect(resABCD2.status).toBe(201);
    expect(resABCD2.body.key).toBe("ABCD2");
  });

  test("derived key collision handles further sequences", async () => {
    const dirAWB3 = path.join(tempBase, "sub3", "ai-work-board");
    fs.mkdirSync(dirAWB3, { recursive: true });
    const resAWB3 = await testApp.request("POST", "/api/projects", { path: dirAWB3 });
    expect(resAWB3.status).toBe(201);
    expect(resAWB3.body.key).toBe("AWB3");
  });

  test("chosen-key collision returns 409 CONFLICT", async () => {
    const dir1 = path.join(tempBase, "chosen-dir1");
    const dir2 = path.join(tempBase, "chosen-dir2");
    fs.mkdirSync(dir1, { recursive: true });
    fs.mkdirSync(dir2, { recursive: true });

    const res1 = await testApp.request("POST", "/api/projects", {
      path: dir1,
      key: "CHOSN",
    });
    expect(res1.status).toBe(201);

    const res2 = await testApp.request("POST", "/api/projects", {
      path: dir2,
      key: "CHOSN",
    });
    expect(res2.status).toBe(409);
    expect(res2.body).toEqual({
      error: { code: "CONFLICT", message: "Project key CHOSN is already in use" },
    });
  });

  test("invalid key returns 400 VALIDATION", async () => {
    const dir = path.join(tempBase, "invalid-key-dir");
    fs.mkdirSync(dir, { recursive: true });

    // Too short (< 2)
    const resShort = await testApp.request("POST", "/api/projects", {
      path: dir,
      key: "A",
    });
    expect(resShort.status).toBe(400);
    expect(resShort.body.error.code).toBe("VALIDATION");

    // Too long (> 5)
    const resLong = await testApp.request("POST", "/api/projects", {
      path: dir,
      key: "TOOLONG",
    });
    expect(resLong.status).toBe(400);
    expect(resLong.body.error.code).toBe("VALIDATION");

    // Invalid chars
    const resChars = await testApp.request("POST", "/api/projects", {
      path: dir,
      key: "A-B",
    });
    expect(resChars.status).toBe(400);
    expect(resChars.body.error.code).toBe("VALIDATION");

    // Numbers in chosen key
    const resNums = await testApp.request("POST", "/api/projects", {
      path: dir,
      key: "AB1",
    });
    expect(resNums.status).toBe(400);
    expect(resNums.body.error.code).toBe("VALIDATION");
  });

  test("relative path is rejected with 400 VALIDATION", async () => {
    const resRel = await testApp.request("POST", "/api/projects", {
      path: "./some/relative/path",
    });
    expect(resRel.status).toBe(400);
    expect(resRel.body).toEqual({
      error: { code: "VALIDATION", message: "Project path must be absolute" },
    });
  });

  test("server accepts a path that does not exist on disk", async () => {
    const missingDir = path.join(tempBase, "does-not-exist-on-disk");
    const res = await testApp.request("POST", "/api/projects", {
      path: missingDir,
      name: "Nonexistent Project",
      key: "NOEXT",
    });
    expect(res.status).toBe(201);
    expect(res.body.key).toBe("NOEXT");
    expect(res.body.path).toBe(missingDir);
  });

  test("trailing slashes are normalized and duplicate normalized paths are rejected with 409 CONFLICT", async () => {
    const trailDir = path.join(tempBase, "slash-test");
    const resTrailing = await testApp.request("POST", "/api/projects", {
      path: trailDir + "///",
      name: "Slash Project",
      key: "SLASH",
    });
    expect(resTrailing.status).toBe(201);
    expect(resTrailing.body.path).toBe(trailDir);

    // Duplicate path without trailing slash
    const resDup = await testApp.request("POST", "/api/projects", {
      path: trailDir,
    });
    expect(resDup.status).toBe(409);
    expect(resDup.body).toEqual({
      error: { code: "CONFLICT", message: "Path already registered as SLASH" },
    });

    // Duplicate path with trailing slash
    const resDupTrailing = await testApp.request("POST", "/api/projects", {
      path: trailDir + "/",
    });
    expect(resDupTrailing.status).toBe(409);
    expect(resDupTrailing.body).toEqual({
      error: { code: "CONFLICT", message: "Path already registered as SLASH" },
    });
  });


  test("resolve: exact path, subdirectory, deepest of nested Projects, explicit key wins, no match", async () => {
    const parentDir = path.join(tempBase, "nest-parent");
    const childDir = path.join(parentDir, "nest-child");
    const subChildDir = path.join(childDir, "sub-dir");
    fs.mkdirSync(subChildDir, { recursive: true });

    // Register parent project
    const resP = await testApp.request("POST", "/api/projects", {
      path: parentDir,
      key: "PARNT",
      name: "Parent Project",
    });
    expect(resP.status).toBe(201);

    // Register child project
    const resC = await testApp.request("POST", "/api/projects", {
      path: childDir,
      key: "CHLD",
      name: "Child Project",
    });
    expect(resC.status).toBe(201);

    // 1. Exact path
    const resExact = await testApp.request("GET", `/api/projects/resolve?cwd=${encodeURIComponent(parentDir)}`);
    expect(resExact.status).toBe(200);
    expect(resExact.body.key).toBe("PARNT");

    // 2. Subdirectory of parent (outside child)
    const parentSub = path.join(parentDir, "other-sub");
    fs.mkdirSync(parentSub, { recursive: true });
    const resSub = await testApp.request("GET", `/api/projects/resolve?cwd=${encodeURIComponent(parentSub)}`);
    expect(resSub.status).toBe(200);
    expect(resSub.body.key).toBe("PARNT");

    // 3. Deepest of nested projects (inside child's subtree)
    const resDeepest = await testApp.request("GET", `/api/projects/resolve?cwd=${encodeURIComponent(subChildDir)}`);
    expect(resDeepest.status).toBe(200);
    expect(resDeepest.body.key).toBe("CHLD");

    // 4. Explicit key wins (even if cwd is inside child)
    const resKeyWins = await testApp.request(
      "GET",
      `/api/projects/resolve?key=PARNT&cwd=${encodeURIComponent(subChildDir)}`
    );
    expect(resKeyWins.status).toBe(200);
    expect(resKeyWins.body.key).toBe("PARNT");

    // 5. No match returns 404 NO_PROJECT with awb init message
    const unregistered = path.join(tempBase, "unregistered");
    fs.mkdirSync(unregistered, { recursive: true });
    const resNoMatch = await testApp.request(
      "GET",
      `/api/projects/resolve?cwd=${encodeURIComponent(unregistered)}`
    );
    expect(resNoMatch.status).toBe(404);
    expect(resNoMatch.body).toEqual({
      error: {
        code: "NO_PROJECT",
        message: `No project registered for ${unregistered}. Run \`awb init\` in the repository root.`,
      },
    });

    // 6. Neither key nor cwd returns 400 VALIDATION
    const resNeither = await testApp.request("GET", "/api/projects/resolve");
    expect(resNeither.status).toBe(400);
    expect(resNeither.body.error.code).toBe("VALIDATION");
  });

  test("invalid JSON or wrong field types return 400 VALIDATION", async () => {
    // Malformed JSON on create
    const resBadJson = await testApp.app.request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json at all",
    });
    expect(resBadJson.status).toBe(400);
    const badJsonBody = await resBadJson.json();
    expect(badJsonBody.error.code).toBe("VALIDATION");

    // Non-string path
    const resBadPath = await testApp.request("POST", "/api/projects", {
      path: 12345,
    });
    expect(resBadPath.status).toBe(400);
    expect(resBadPath.body.error.code).toBe("VALIDATION");

    // Non-string name
    const validDir = path.join(tempBase, "type-dir");
    fs.mkdirSync(validDir, { recursive: true });
    const resBadName = await testApp.request("POST", "/api/projects", {
      path: validDir,
      name: 123,
    });
    expect(resBadName.status).toBe(400);
    expect(resBadName.body.error.code).toBe("VALIDATION");

    // Non-string rename
    const resBadRename = await testApp.request("PATCH", "/api/projects/PARNT", {
      name: 456,
    });
    expect(resBadRename.status).toBe(400);
    expect(resBadRename.body.error.code).toBe("VALIDATION");

    // Empty rename
    const resEmptyRename = await testApp.request("PATCH", "/api/projects/PARNT", {
      name: "   ",
    });
    expect(resEmptyRename.status).toBe(400);
    expect(resEmptyRename.body.error.code).toBe("VALIDATION");
  });
});
