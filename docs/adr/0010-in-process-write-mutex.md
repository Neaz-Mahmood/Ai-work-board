---
status: accepted
---
# Writes are serialized by an in-process mutex, not database locks

After the move to Postgres/PGlite (ADR 0005), the domain core keeps its hand-written SQL behind a small async `Db` interface with one PGlite adapter and one Postgres adapter, and keeps its own migrations runner. Every write transaction runs under a single in-process async mutex. This reproduces the whole-database serialization that SQLite's `BEGIN IMMEDIATE` used to give Claim and Rank shifting, without row locks or serializable retries. It is correct only because exactly one backend instance may run (ADR 0006); running several instances would require switching to database-level locking first. We rejected an ORM or query builder (Kysely, Drizzle) because the SQL already exists and only needs translating.
