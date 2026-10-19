import { AsyncLocalStorage } from "node:async_hooks";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import type { Db, SqlParam } from "./db.ts";
import { rewritePlaceholders } from "./db.ts";
import { createWriteMutex } from "./writeMutex.ts";

export async function openPglite(dir?: string): Promise<Db & { close(): Promise<void> }> {
  const pglite = dir ? new PGlite(dir) : new PGlite();
  await pglite.waitReady;

  const writeMutex = createWriteMutex();
  const txStorage = new AsyncLocalStorage<Transaction>();

  const db: Db & { close(): Promise<void> } = {
    async exec(sql: string): Promise<void> {
      const currentTx = txStorage.getStore();
      if (currentTx) {
        await currentTx.exec(sql);
        return;
      }
      return writeMutex.run(async () => {
        await pglite.exec(sql);
      });
    },

    async get<T>(sql: string, ...params: SqlParam[]): Promise<T | undefined> {
      const currentTx = txStorage.getStore();
      const rewritten = rewritePlaceholders(sql);
      if (currentTx) {
        const res = await currentTx.query<T>(rewritten, params);
        return res.rows[0];
      }
      return writeMutex.run(async () => {
        const res = await pglite.query<T>(rewritten, params);
        return res.rows[0];
      });
    },

    async all<T>(sql: string, ...params: SqlParam[]): Promise<T[]> {
      const currentTx = txStorage.getStore();
      const rewritten = rewritePlaceholders(sql);
      if (currentTx) {
        const res = await currentTx.query<T>(rewritten, params);
        return res.rows;
      }
      return writeMutex.run(async () => {
        const res = await pglite.query<T>(rewritten, params);
        return res.rows;
      });
    },

    async run(sql: string, ...params: SqlParam[]): Promise<{ changes: number }> {
      const currentTx = txStorage.getStore();
      const rewritten = rewritePlaceholders(sql);
      if (currentTx) {
        const res = await currentTx.query(rewritten, params);
        return { changes: res.affectedRows ?? res.rowCount ?? 0 };
      }
      return writeMutex.run(async () => {
        const res = await pglite.query(rewritten, params);
        return { changes: res.affectedRows ?? res.rowCount ?? 0 };
      });
    },

    async tx<T>(fn: () => Promise<T>): Promise<T> {
      const currentTx = txStorage.getStore();
      if (currentTx) {
        return fn();
      }
      return writeMutex.run(async () => {
        return pglite.transaction(async (txHandle) => {
          return txStorage.run(txHandle, fn);
        });
      });
    },

    async close(): Promise<void> {
      await pglite.close();
    },
  };

  return db;
}
