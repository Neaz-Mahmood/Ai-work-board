// Using better-sqlite3 as the SQLite driver (built and runs successfully on Node 26).
import Database from "better-sqlite3";

export type SqlParam = string | number | null;

export interface Db {
  exec(sql: string): void;
  get<T>(sql: string, ...params: SqlParam[]): T | undefined;
  all<T>(sql: string, ...params: SqlParam[]): T[];
  run(sql: string, ...params: SqlParam[]): { changes: number; lastInsertRowid: number };
  tx<T>(fn: () => T): T; // BEGIN IMMEDIATE … COMMIT, ROLLBACK on throw; nested calls just run fn
  close(): void;
}

export function openDb(file: string): Db {
  const raw = new Database(file);
  raw.pragma("journal_mode = WAL");
  raw.pragma("foreign_keys = ON");
  raw.pragma("busy_timeout = 5000");

  let inTx = false;

  return {
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
      if (inTx) {
        return fn();
      }
      inTx = true;
      raw.exec("BEGIN IMMEDIATE");
      try {
        const result = fn();
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
}
