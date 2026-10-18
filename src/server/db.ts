// Using better-sqlite3 as the SQLite driver (built and runs successfully on Node 26).
import { AsyncLocalStorage } from "node:async_hooks";
import Database from "better-sqlite3";
import { createWriteMutex, type WriteMutex } from "./writeMutex.ts";

export type SqlParam = string | number | null;

export interface Db {
  exec(sql: string): void;
  get<T>(sql: string, ...params: SqlParam[]): T | undefined;
  all<T>(sql: string, ...params: SqlParam[]): T[];
  run(sql: string, ...params: SqlParam[]): { changes: number; lastInsertRowid: number };
  tx<T>(fn: () => T): T; // BEGIN IMMEDIATE … COMMIT, ROLLBACK on throw; nested calls just run fn
  close(): void;
}

export interface AsyncDb {
  get<T>(sql: string, ...params: SqlParam[]): Promise<T | undefined>;
  all<T>(sql: string, ...params: SqlParam[]): Promise<T[]>;
  run(sql: string, ...params: SqlParam[]): Promise<{ changes: number }>;
  tx<T>(fn: () => Promise<T>): Promise<T>;
}

export function openSqlite(
  file: string,
  mutex?: WriteMutex
): { db: Db; adb: AsyncDb; close(): void } {
  const raw = new Database(file);
  raw.pragma("journal_mode = WAL");
  raw.pragma("foreign_keys = ON");
  raw.pragma("busy_timeout = 5000");

  const writeMutex = mutex ?? createWriteMutex();
  const txStorage = new AsyncLocalStorage<boolean>();
  let inTx = false;

  const db: Db = {
    exec(sql: string): void {
      raw.exec(sql);
    },
    get<T>(sql: string, ...params: SqlParam[]): T | undefined {
      return raw.prepare(sql).get(...params) as T | undefined;
    },
    all<T>(sql: string, ...params: SqlParam[]): T[] {
      return raw.prepare(sql).all(...params) as T[];
    },
    run(sql: string, ...params: SqlParam[]): { changes: number; lastInsertRowid: number } {
      const info = raw.prepare(sql).run(...params);
      return {
        changes: info.changes,
        lastInsertRowid: Number(info.lastInsertRowid),
      };
    },
    tx<T>(fn: () => T): T {
      if (txStorage.getStore()) {
        return fn();
      }
      if (inTx) {
        throw new Error("Sync transaction started while an async transaction is open");
      }
      inTx = true;
      raw.exec("BEGIN IMMEDIATE");
      try {
        const result = txStorage.run(true, fn);
        raw.exec("COMMIT");
        return result;
      } catch (err) {
        try {
          raw.exec("ROLLBACK");
        } catch {
          // ignore rollback failure if transaction already aborted
        }
        throw err;
      } finally {
        inTx = false;
      }
    },
    close(): void {
      raw.close();
    },
  };

  const adb: AsyncDb = {
    async get<T>(sql: string, ...params: SqlParam[]): Promise<T | undefined> {
      return raw.prepare(sql).get(...params) as T | undefined;
    },
    async all<T>(sql: string, ...params: SqlParam[]): Promise<T[]> {
      return raw.prepare(sql).all(...params) as T[];
    },
    async run(sql: string, ...params: SqlParam[]): Promise<{ changes: number }> {
      const info = raw.prepare(sql).run(...params);
      return {
        changes: info.changes,
      };
    },
    async tx<T>(fn: () => Promise<T>): Promise<T> {
      if (txStorage.getStore()) {
        return fn();
      }
      return writeMutex.run(async () => {
        if (inTx) {
          return txStorage.run(true, fn);
        }
        inTx = true;
        raw.exec("BEGIN IMMEDIATE");
        try {
          const result = await txStorage.run(true, fn);
          raw.exec("COMMIT");
          return result;
        } catch (err) {
          try {
            raw.exec("ROLLBACK");
          } catch {
            // ignore rollback failure if transaction already aborted
          }
          throw err;
        } finally {
          inTx = false;
        }
      });
    },
  };

  const close = (): void => {
    raw.close();
  };

  return {
    db,
    adb,
    close,
  };
}

export function openDb(file: string): Db {
  return openSqlite(file).db;
}
