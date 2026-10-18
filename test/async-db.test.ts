import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { openSqlite, type AsyncDb, type Db } from "../src/server/db.ts";

describe("AsyncDb and SQLite transactions", () => {
  let tmpDir: string;
  let db: Db;
  let adb: AsyncDb;
  let close: () => void;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "awb-adb-"));
    const dbFile = path.join(tmpDir, "test.db");
    const opened = openSqlite(dbFile);
    db = opened.db;
    adb = opened.adb;
    close = opened.close;

    db.exec(`
      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );
    `);
  });

  afterEach(() => {
    close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("adb.get, adb.all, adb.run work (run returns { changes })", async () => {
    const runResult = await adb.run("INSERT INTO items (name) VALUES (?)", "first");
    expect(runResult).toEqual({ changes: 1 });

    const getResult = await adb.get<{ id: number; name: string }>(
      "SELECT id, name FROM items WHERE name = ?",
      "first"
    );
    expect(getResult).toBeDefined();
    expect(getResult?.id).toBe(1);
    expect(getResult?.name).toBe("first");

    await adb.run("INSERT INTO items (name) VALUES (?)", "second");

    const allResult = await adb.all<{ id: number; name: string }>(
      "SELECT id, name FROM items ORDER BY id ASC"
    );
    expect(allResult).toHaveLength(2);
    expect(allResult[0].name).toBe("first");
    expect(allResult[1].name).toBe("second");
  });

  test("INSERT … RETURNING id through adb.get returns the id", async () => {
    const row = await adb.get<{ id: number }>(
      "INSERT INTO items (name) VALUES (?) RETURNING id",
      "returned-item"
    );
    expect(row).toBeDefined();
    expect(typeof row?.id).toBe("number");
    expect(row?.id).toBe(1);
  });

  test("adb.tx commits; adb.tx whose body throws rolls back and rethrows", async () => {
    await adb.tx(async () => {
      await adb.run("INSERT INTO items (name) VALUES (?)", "committed");
    });

    const rowsAfterCommit = await adb.all<{ name: string }>("SELECT name FROM items");
    expect(rowsAfterCommit.map((r) => r.name)).toEqual(["committed"]);

    await expect(
      adb.tx(async () => {
        await adb.run("INSERT INTO items (name) VALUES (?)", "rolled-back");
        throw new Error("intentional error");
      })
    ).rejects.toThrow("intentional error");

    const rowsAfterRollback = await adb.all<{ name: string }>("SELECT name FROM items");
    expect(rowsAfterRollback.map((r) => r.name)).toEqual(["committed"]);
  });

  test("a nested adb.tx joins the outer one (the outer throw rolls back the inner write too)", async () => {
    await expect(
      adb.tx(async () => {
        await adb.run("INSERT INTO items (name) VALUES (?)", "outer-item");
        await adb.tx(async () => {
          await adb.run("INSERT INTO items (name) VALUES (?)", "inner-item");
        });
        throw new Error("outer error");
      })
    ).rejects.toThrow("outer error");

    const rows = await adb.all<{ name: string }>("SELECT name FROM items");
    expect(rows).toHaveLength(0);
  });

  test("a sync db.tx inside adb.tx joins it, and both roll back together on throw", async () => {
    await expect(
      adb.tx(async () => {
        await adb.run("INSERT INTO items (name) VALUES (?)", "outer-item");
        db.tx(() => {
          db.run("INSERT INTO items (name) VALUES (?)", "sync-item");
          throw new Error("sync error inside adb.tx");
        });
      })
    ).rejects.toThrow("sync error inside adb.tx");

    const rows = await adb.all<{ name: string }>("SELECT name FROM items");
    expect(rows).toHaveLength(0);
  });

  test("two concurrent adb.tx calls whose bodies await new Promise(r => setTimeout(r, 20)) never overlap", async () => {
    const events: string[] = [];

    const p1 = adb.tx(async () => {
      events.push("enter1");
      await new Promise((r) => setTimeout(r, 20));
      events.push("exit1");
    });

    const p2 = adb.tx(async () => {
      events.push("enter2");
      await new Promise((r) => setTimeout(r, 20));
      events.push("exit2");
    });

    await Promise.all([p1, p2]);
    expect(events).toEqual(["enter1", "exit1", "enter2", "exit2"]);
  });

  test("a sync db.tx started from outside while an adb.tx is awaiting throws 'Sync transaction started while an async transaction is open', and the async transaction still commits", async () => {
    let adbEntered = false;

    const adbPromise = adb.tx(async () => {
      await adb.run("INSERT INTO items (name) VALUES (?)", "async-item");
      adbEntered = true;
      await new Promise((r) => setTimeout(r, 50));
    });

    while (!adbEntered) {
      await new Promise((r) => setTimeout(r, 5));
    }

    expect(() => {
      db.tx(() => {
        db.run("INSERT INTO items (name) VALUES (?)", "sync-item");
      });
    }).toThrow("Sync transaction started while an async transaction is open");

    await adbPromise;

    const rows = await adb.all<{ name: string }>("SELECT name FROM items");
    expect(rows.map((r) => r.name)).toEqual(["async-item"]);
  });

  test("the write mutex releases after a rejected fn: a later adb.tx still runs", async () => {
    await expect(
      adb.tx(async () => {
        throw new Error("rejected transaction");
      })
    ).rejects.toThrow("rejected transaction");

    const result = await adb.tx(async () => {
      await adb.run("INSERT INTO items (name) VALUES (?)", "subsequent-item");
      return "success";
    });

    expect(result).toBe("success");
    const rows = await adb.all<{ name: string }>("SELECT name FROM items");
    expect(rows.map((r) => r.name)).toEqual(["subsequent-item"]);
  });
});
