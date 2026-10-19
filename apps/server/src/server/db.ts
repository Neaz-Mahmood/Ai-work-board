export type SqlParam = string | number | boolean | null;

export interface Db {
  exec(sql: string): Promise<void>;
  get<T>(sql: string, ...params: SqlParam[]): Promise<T | undefined>;
  all<T>(sql: string, ...params: SqlParam[]): Promise<T[]>;
  run(sql: string, ...params: SqlParam[]): Promise<{ changes: number }>;
  tx<T>(fn: () => Promise<T>): Promise<T>;
}

export function rewritePlaceholders(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}
