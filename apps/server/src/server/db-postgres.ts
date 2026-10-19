import { AsyncLocalStorage } from "node:async_hooks";
import postgres from "postgres";
import type { Db, SqlParam } from "./db.ts";
import { rewritePlaceholders } from "./db.ts";
import { createWriteMutex } from "./writeMutex.ts";

export async function openPostgres(
  url: string,
  opts?: { schema?: string }
): Promise<Db & { close(): Promise<void> }> {
  const schema = opts?.schema;
  const sql = postgres(url, {
    // Migrations use IF NOT EXISTS; don't print the resulting NOTICEs on every start.
    onnotice: () => {},
    ...(schema ? { connection: { search_path: schema } } : {}),
  });

  if (schema) {
    const escapedSchema = schema.replace(/"/g, '""');
    await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS "${escapedSchema}"`);
  }

  const writeMutex = createWriteMutex();
  const txStorage = new AsyncLocalStorage<postgres.TransactionSql>();

  const db: Db & { close(): Promise<void> } = {
    async exec(sqlString: string): Promise<void> {
      const currentTx = txStorage.getStore();
      if (currentTx) {
        await currentTx.unsafe(sqlString);
        return;
      }
      return writeMutex.run(async () => {
        await sql.unsafe(sqlString);
      });
    },

    async get<T>(sqlString: string, ...params: SqlParam[]): Promise<T | undefined> {
      const currentTx = txStorage.getStore();
      const client = currentTx ?? sql;
      const rewritten = rewritePlaceholders(sqlString);
      const res = await client.unsafe<T[]>(rewritten, params as any[]);
      return res[0];
    },

    async all<T>(sqlString: string, ...params: SqlParam[]): Promise<T[]> {
      const currentTx = txStorage.getStore();
      const client = currentTx ?? sql;
      const rewritten = rewritePlaceholders(sqlString);
      const res = await client.unsafe<T[]>(rewritten, params as any[]);
      return res;
    },

    async run(sqlString: string, ...params: SqlParam[]): Promise<{ changes: number }> {
      const currentTx = txStorage.getStore();
      const rewritten = rewritePlaceholders(sqlString);
      if (currentTx) {
        const res = await currentTx.unsafe(rewritten, params as any[]);
        return { changes: res.count };
      }
      return writeMutex.run(async () => {
        const res = await sql.unsafe(rewritten, params as any[]);
        return { changes: res.count };
      });
    },

    async tx<T>(fn: () => Promise<T>): Promise<T> {
      const currentTx = txStorage.getStore();
      if (currentTx) {
        return fn();
      }
      return writeMutex.run(async () => {
        const res = await sql.begin(async (txSql) => {
          return txStorage.run(txSql, fn);
        });
        return res as T;
      });
    },

    async close(): Promise<void> {
      await sql.end();
    },
  };

  return db;
}
