# DistributedDatabase

Serverless SQL backed by **Amazon Aurora DSQL** — a strict PostgreSQL *subset*.
Zero-ops, instant provisioning, scale-to-zero, IAM-token auth (no VPC, no
secrets, no security groups), and optional multi-region active-active writes.

**Use it for** SQL apps that must scale with no ops overhead, need zero idle cost,
or need multi-region active-active writes, and that don't need FK/RLS/triggers.

**Don't use it for** foreign keys, Row Level Security, triggers, views, stored
procedures, or transactions that must not fail at commit under contention — use
Database (Aurora) for those. For NoSQL access patterns, use DistributedTable.

DSQL is **not** CockroachDB and **not** Aurora Serverless v2 — those are different
engines. It is its own PostgreSQL-compatible service with the limitations below.

## Contents

- Imports and where each symbol lives
- Minimal example
- Transactions — OCC and the retry pattern
- `DistributedDatabaseOptions` / `TransactionOptions`
- Migrations
- Rejected SQL (validated locally)
- Transaction limits
- Kysely
- Errors
- What it provisions

## Imports and where each symbol lives

`DistributedDatabase`, `DistributedDatabaseErrors`, and `sql` are re-exported from
the umbrella package:

```typescript
import { DistributedDatabase, DistributedDatabaseErrors, sql } from '@aws-blocks/blocks';
```

`createKyselyAdapter` is **not** on `@aws-blocks/blocks` — import it from the
block's own package: `import { createKyselyAdapter } from '@aws-blocks/bb-distributed-data';`.
`isBlocksError` comes from `@aws-blocks/core`.

## Minimal example

```typescript
const db = new DistributedDatabase(scope, 'main', {
  migrationsPath: './aws-blocks/dsql-migrations',
});

const users = await db.query<{ id: string; name: string }>(
  sql`SELECT * FROM users WHERE active = ${true}`,
);
const user = await db.queryOne<{ id: string }>(sql`SELECT * FROM users WHERE id = ${userId}`);
const { rowCount } = await db.execute(
  sql`INSERT INTO users (id, name) VALUES (${id}, ${name})`,
);
```

Same query API as Database (`query` / `queryOne` / `execute` / `transaction`).
Basic JOINs work. The **3,000 limit is rows *mutated* per transaction**, not a
read or JOIN ceiling.

## Transactions — OCC and the retry pattern

DSQL uses **optimistic concurrency control**: a transaction can fail at commit if
another transaction changed the same rows, raising
`SerializationFailureException` (Postgres code `40001`). The callback runs exactly
once unless you opt into retry.

```typescript
// Default: no retry — throws SerializationFailureException on conflict.
await db.transaction(async (tx) => {
  await tx.execute(sql`UPDATE accounts SET balance = balance - ${100} WHERE id = ${fromId}`);
  await tx.execute(sql`UPDATE accounts SET balance = balance + ${100} WHERE id = ${toId}`);
});

// Opt-in retry keyed on SerializationFailure/40001 — callback may run multiple times.
await db.transaction(async (tx) => {
  await tx.execute(sql`UPDATE accounts SET balance = balance - ${100} WHERE id = ${fromId}`);
  await tx.execute(sql`UPDATE accounts SET balance = balance + ${100} WHERE id = ${toId}`);
}, { retryOnConflict: true, maxRetries: 3 });
```

Because the callback may re-run under `retryOnConflict`, put **no external side
effects** (HTTP calls, emails, queue sends) inside it.

## `DistributedDatabaseOptions` / `TransactionOptions`

```typescript
interface DistributedDatabaseOptions {
  migrationsPath?: string;
  removalPolicy?: 'destroy' | 'retain';   // default 'retain'
  logger?: ChildLogger;
}

interface TransactionOptions {
  retryOnConflict?: boolean;   // default false
  maxRetries?: number;         // default 3, only when retryOnConflict is true
}
```

There is no `withRLS()`, `fromExisting()`, or `crud()` here — those are
Database-only.

## Migrations

One DDL statement per file; DML in its own file (this mirrors DSQL's transaction
constraints). Validated at dev time, so unsupported features are caught before
deploy. Set `migrationsPath` relative to your project root; don't use
`import.meta.url` (the Lambda bundle resolves it to the bundled output location,
not your source).

```
aws-blocks/dsql-migrations/
  001_create_users.sql     ← single DDL
  002_create_index.sql     ← CREATE INDEX ASYNC (non-blocking)
  003_seed_admin.sql       ← DML only
```

Use `gen_random_uuid()` for ids (no SERIAL) and `CREATE INDEX ASYNC` for indexes.

## Rejected SQL (validated locally)

The local mock (PGlite + a DSQL validation layer) rejects, at query time,
everything DSQL rejects — so code that runs locally runs in production. Errors are
thrown with `name: 'DsqlValidationError'`.

| Rejected | Alternative |
|---|---|
| Foreign keys (`FOREIGN KEY` / `REFERENCES`) | Application-layer validation |
| `CREATE TRIGGER` | Event-driven logic (EventBridge, Lambda) |
| `CREATE VIEW` | CTEs or app-layer composition |
| PL/pgSQL (`LANGUAGE plpgsql`) | `LANGUAGE SQL` functions or app logic |
| `SERIAL` / `BIGSERIAL` / `CREATE SEQUENCE` | UUIDs (`gen_random_uuid()`) |
| `TRUNCATE` | `DELETE FROM` |
| `LISTEN` / `NOTIFY` | AppSync Events, EventBridge, polling |
| `CREATE EXTENSION` | Not available |
| `ALTER TABLE ... ADD COLUMN ... DEFAULT` | Add the column without a default; handle nulls in app |
| `ALTER TABLE ... DROP COLUMN` (and bare `DROP ...`) | Leave the column and stop using it, or rebuild (create new → `INSERT INTO ... SELECT` → `DROP` → `RENAME TO`) |
| `ALTER DEFAULT PRIVILEGES` | Grant explicitly |
| Row Level Security (`CREATE POLICY`, `ENABLE ROW LEVEL SECURITY`) | WHERE-clause filtering in app code |
| Temporary tables (`CREATE TEMP/TEMPORARY TABLE`) | CTEs or subqueries |
| `SET TRANSACTION ISOLATION LEVEL` | Isolation is fixed at **Repeatable Read** — cannot be changed |
| `COLLATE` (non-C) | DSQL supports only C collation |
| `JSONB` columns | `JSON` columns (`::jsonb` is allowed as a query-runtime cast) |
| Sort order (`ASC`/`DESC`) on index keys | Omit it; order with `ORDER BY` (`NULLS FIRST/LAST` is allowed) |

Allowed `ALTER TABLE` forms are the `DROP DEFAULT`, `DROP NOT NULL`,
`DROP EXPRESSION`, `DROP IDENTITY`, and `DROP CONSTRAINT` variants. A warning (not
an error) fires for JSONB containment operators (`@>`, `<@`, `?|`, `?&` — no GIN
acceleration) and for `CREATE INDEX` without `ASYNC`.

## Transaction limits

| Constraint | Limit |
|---|---|
| Concurrency model | OCC (may conflict at commit) |
| Isolation level | Fixed **Repeatable Read** |
| DDL per transaction | 1 statement max |
| DDL + DML mixing | Not allowed |
| Rows **mutated** per transaction | ≤ 3,000 |
| Data per transaction | ≤ 10 MiB |
| Transaction duration | ≤ 5 minutes |

The mock enforces the DDL-count, DDL/DML-mixing, and 3,000-row limits locally.

## Kysely

```typescript
import { createKyselyAdapter } from '@aws-blocks/bb-distributed-data';

interface Schema { users: { id: string; email: string; name: string }; }
const kysely = createKyselyAdapter<Schema>(db); // safe at module scope

const users = await kysely.selectFrom('users').where('email', '=', 'x@y.com').selectAll().execute();
```

Do not call `.addForeignKeyConstraint()` — DSQL rejects it.

## Errors

```typescript
import { DistributedDatabaseErrors } from '@aws-blocks/bb-distributed-data';
import { isBlocksError } from '@aws-blocks/core';

try {
  await db.transaction(async (tx) => { /* ... */ });
} catch (e: unknown) {
  if (isBlocksError(e, DistributedDatabaseErrors.SerializationFailure)) {
    // OCC conflict — NOT committed, safe to retry
  }
  throw e;
}
```

| Constant | `error.name` |
|---|---|
| `DistributedDatabaseErrors.QueryFailed` | `QueryFailedException` |
| `DistributedDatabaseErrors.ConnectionFailed` | `ConnectionFailedException` |
| `DistributedDatabaseErrors.TransactionFailed` | `TransactionFailedException` |
| `DistributedDatabaseErrors.UniqueConstraintViolation` | `UniqueConstraintViolationException` |
| `DistributedDatabaseErrors.SerializationFailure` | `SerializationFailureException` |
| `DistributedDatabaseErrors.TransactionRowLimitExceeded` | `TransactionRowLimitExceededException` |

## What it provisions

An Aurora DSQL cluster (serverless, public endpoint, **no VPC**), a
CustomResource migration Lambda that runs `.sql` files on deploy with retry, IAM
grants (`dsql:DbConnect` for the app Lambda — DML only; `dsql:DbConnectAdmin` for
the migration Lambda — DDL), and env vars `BLOCKS_{name}_ENDPOINT`,
`BLOCKS_{name}_REGION`. No secrets, no security groups, no proxy — DSQL uses IAM
token authentication.

Local dev stores data in `.bb-data/{fullId}/` and persists across restarts.
