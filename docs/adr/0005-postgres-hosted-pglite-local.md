---
status: accepted
---
# Postgres when hosted, PGlite locally; supersedes ADR 0003

The board can now run on a remote server with a remote database, while `awb start` with no config still runs fully on one machine. Hosted mode stores data in Postgres (`DATABASE_URL`, any provider). Local mode stores it in PGlite, an embedded Postgres kept in a directory under `~/.ai-work-board`, so both modes share one SQL dialect and one async code path. The cost is turning the synchronous domain core (built on `better-sqlite3`) async.

## Considered Options

- libSQL/Turso: least SQL churn, but hosted mode would depend on one vendor.
- SQLite on the hosted server's disk: no rewrite, but the data would live only on that one machine, which isn't the remote database that was asked for.
- Postgres when hosted plus SQLite locally: two dialects to keep in sync.

## Consequences

Existing data is not migrated. The old `~/.ai-work-board/board.db` is left untouched and unread, and both modes start with an empty store.
