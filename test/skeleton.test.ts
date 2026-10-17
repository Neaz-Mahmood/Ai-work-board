import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { describe, expect, test } from "vitest";
import { createApp } from "../src/server/app.ts";
import { main, type CliIo } from "../src/cli/main.ts";
import { makeTestApp } from "./helpers.ts";
import { DomainError, validation, notFound, conflict } from "../src/server/errors.ts";

describe("Walking skeleton", () => {
  test("GET /api/health returns ok and version", async () => {
    const testApp = makeTestApp();
    try {
      const res = await testApp.request("GET", "/api/health");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, version: "0.1.0" });
    } finally {
      testApp.close();
    }
  });

  test("fresh data dir gets board.db and schema_version contains migrations", () => {
    const testApp = makeTestApp();
    try {
      const dbFile = path.join(testApp.dataDir, "board.db");
      expect(fs.existsSync(dbFile)).toBe(true);

      const rows = testApp.ctx.db.all<{ id: number; name: string; applied_at: string }>(
        "SELECT id, name, applied_at FROM schema_version ORDER BY id ASC"
      );
      expect(rows.length).toBe(6);
      expect(rows[0].id).toBe(1);
      expect(rows[0].name).toBe("init");
      expect(rows[1].id).toBe(2);
      expect(rows[1].name).toBe("projects");
      expect(rows[2].id).toBe(3);
      expect(rows[2].name).toBe("tickets");
      expect(rows[3].id).toBe(4);
      expect(rows[3].name).toBe("comments");
      expect(rows[4].id).toBe(5);
      expect(rows[4].name).toBe("blockers");
      expect(rows[5].id).toBe(6);
      expect(rows[5].name).toBe("features");
      expect(typeof rows[0].applied_at).toBe("string");
      expect(typeof rows[1].applied_at).toBe("string");
      expect(typeof rows[2].applied_at).toBe("string");
      expect(typeof rows[3].applied_at).toBe("string");
      expect(typeof rows[4].applied_at).toBe("string");
      expect(typeof rows[5].applied_at).toBe("string");

      const meta = testApp.ctx.db.all("SELECT * FROM app_meta");
      expect(meta).toEqual([]);
    } finally {
      testApp.close();
    }
  });

  test("running createApp twice on the same dir does not reapply migrations", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "awb-test-reapply-"));
    try {
      const app1 = createApp({ dataDir });
      const count1 = app1.ctx.db.all("SELECT * FROM schema_version").length;
      expect(count1).toBe(6);
      app1.close();

      const app2 = createApp({ dataDir });
      const count2 = app2.ctx.db.all("SELECT * FROM schema_version").length;
      expect(count2).toBe(6);
      app2.close();
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("main returns 1 with 'in use' message when port is busy", async () => {
    const server = net.createServer();
    const busyPort = await new Promise<number>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as net.AddressInfo;
        resolve(addr.port);
      });
    });

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "awb-cli-busy-"));
    let stdoutOutput = "";
    let stderrOutput = "";

    const io: CliIo = {
      env: {},
      cwd: tempDir,
      stdout(s: string) {
        stdoutOutput += s;
      },
      stderr(s: string) {
        stderrOutput += s;
      },
    };

    try {
      const exitCode = await main(["start", "--port", String(busyPort), "--data-dir", tempDir], io);
      expect(exitCode).toBe(1);
      expect(stderrOutput).toContain(`Port ${busyPort} is in use. Use --port or AWB_PORT.`);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("DomainError helpers and app.onError formatting", async () => {
    const errVal = validation("invalid input");
    expect(errVal.code).toBe("VALIDATION");
    expect(errVal.status).toBe(400);

    const errNotFound = notFound("missing ticket");
    expect(errNotFound.code).toBe("NOT_FOUND");
    expect(errNotFound.status).toBe(404);

    const errConflict = conflict("ticket key collision");
    expect(errConflict.code).toBe("CONFLICT");
    expect(errConflict.status).toBe(409);

    const testApp = makeTestApp();
    try {
      testApp.app.get("/api/test-domain-error", () => {
        throw validation("bad payload");
      });
      testApp.app.get("/api/test-internal-error", () => {
        throw new Error("unexpected explosion");
      });

      const resDomain = await testApp.request("GET", "/api/test-domain-error");
      expect(resDomain.status).toBe(400);
      expect(resDomain.body).toEqual({
        error: { code: "VALIDATION", message: "bad payload" },
      });

      const resInternal = await testApp.request("GET", "/api/test-internal-error");
      expect(resInternal.status).toBe(500);
      expect(resInternal.body).toEqual({
        error: { code: "INTERNAL", message: "unexpected explosion" },
      });
    } finally {
      testApp.close();
    }
  });

  test("serves static files and falls back to index.html for SPA", async () => {
    const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), "awb-static-"));
    fs.writeFileSync(path.join(staticDir, "index.html"), "<html>SPA</html>");
    fs.writeFileSync(path.join(staticDir, "style.css"), "body { color: red; }");

    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "awb-data-"));
    const created = createApp({ dataDir, staticDir });
    try {
      const resFile = await created.app.request("/style.css");
      expect(resFile.status).toBe(200);
      expect(await resFile.text()).toBe("body { color: red; }");

      const resSpa = await created.app.request("/projects/AWB");
      expect(resSpa.status).toBe(200);
      expect(await resSpa.text()).toBe("<html>SPA</html>");

      const resApiNotFound = await created.app.request("/api/unknown");
      expect(resApiNotFound.status).toBe(404);
    } finally {
      created.close();
      fs.rmSync(staticDir, { recursive: true, force: true });
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
