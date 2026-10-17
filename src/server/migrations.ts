import type { Db } from "./db.ts";

export const migrations: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: "init",
    sql: `CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );`,
  },
  {
    id: 2,
    name: "projects",
    sql: `CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      next_ticket_number INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
  },
  {
    id: 3,
    name: "tickets",
    sql: `CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      number INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      column_id TEXT NOT NULL CHECK (column_id IN ('backlog','todo','in_progress','in_review','done')),
      rank INTEGER NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('highest','high','medium','low','lowest')),
      assignee TEXT,
      attention_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(project_id, number)
    );
    CREATE TABLE IF NOT EXISTS actors (
      name TEXT PRIMARY KEY,
      color TEXT NOT NULL,
      first_seen_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      actor TEXT NOT NULL,
      at TEXT NOT NULL,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL
    );`,
  },
  {
    id: 4,
    name: "comments",
    sql: `CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      actor TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );`,
  },
  {
    id: 5,
    name: "blockers",
    sql: `CREATE TABLE IF NOT EXISTS ticket_blockers (
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      blocker_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      PRIMARY KEY (ticket_id, blocker_id)
    );`,
  },
  {
    id: 6,
    name: "features",
    sql: `CREATE TABLE IF NOT EXISTS features (
      id INTEGER PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      name_lower TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(project_id, name_lower)
    );
    ALTER TABLE tickets ADD COLUMN feature_id INTEGER REFERENCES features(id) ON DELETE SET NULL;`,
  },
];

export function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db.all<{ id: number }>("SELECT id FROM schema_version");
  const appliedIds = new Set(appliedRows.map((r) => r.id));

  const sortedMigrations = [...migrations].sort((a, b) => a.id - b.id);

  for (const migration of sortedMigrations) {
    if (!appliedIds.has(migration.id)) {
      db.tx(() => {
        db.exec(migration.sql);
        db.run(
          "INSERT INTO schema_version (id, name, applied_at) VALUES (?, ?, ?)",
          migration.id,
          migration.name,
          new Date().toISOString()
        );
      });
    }
  }
}
