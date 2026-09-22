# Database

Full PostgreSQL — Aurora Serverless v2 (Data API) by default, or an existing
Postgres (Supabase, Neon, RDS) via `fromExisting()`. Raw parameterized SQL, a
type-safe Kysely query builder, transactions, Row Level Security, and generated
CRUD.

**Use it for** multi-table JOINs, ACID transactions, foreign keys, aggregations,
Row Level Security, or adopting an existing Postgres database.

**Don't use it for** key-value lookups (KVStore), NoSQL records with secondary
indexes (DistributedTable — cheaper, no cold start), or serverless SQL without
FK/RLS/triggers and with multi-region writes (DistributedDatabase).

## Contents

- Imports and where each symbol lives
- Minimal example
- `DatabaseOptions`
- Migrations — local vs AWS
- Kysely query builder
- `bb-data pull` — codegen and adopting an existing Postgres
- Connecting to an existing database (TLS)
- Row Level Security and CRUD
- Errors
- What it provisions

## Imports and where each symbol lives

`Database`, `DatabaseErrors`, `fromExisting`, and `sql` are re-exported from the
umbrella package:

```typescript
import { Database, DatabaseErrors, fromExisting, sql } from '@aws-blocks/blocks';
```

`createKyselyAdapter` is **not** re-exported from `@aws-blocks/blocks`. Import it
from the block's own package (or from `@aws-blocks/data-common`):

```typescript
import { createKyselyAdapter } from '@aws-blocks/bb-data';
```

`isBlocksError` (for typed catch blocks) comes from `@aws-blocks/core`.

## Minimal example

```typescript
const db = new Database(scope, 'main', {
  migrationsPath: './aws-blocks/migrations',
});

const users = await db.query<{ id: string; name: string }>(
  sql`SELECT * FROM users WHERE active = ${true}`,
);

const user = await db.queryOne<{ id: string; name: string }>(
  sql`SELECT * FROM users WHERE id = ${userId}`,
);

const { rowCount } = await db.execute(
  sql`INSERT INTO users (id, name, email) VALUES (${id}, ${name}, ${email})`,
);

await db.transaction(async (tx) => {
  await tx.execute(sql`UPDATE accounts SET balance = balance - ${100} WHERE id = ${fromId}`);
  await tx.execute(sql`UPDATE accounts SET balance = balance + ${100} WHERE id = ${toId}`);
});
```

`sql` builds parameterized (injection-safe) queries — always interpolate values
through it, never string-concatenate.

## `DatabaseOptions`

```typescript
interface DatabaseOptions {
  migrationsPath?: string;            // directory of numbered .sql files
  connection?: ExternalDatabaseRef;   // fromExisting() — skip provisioning
  schema?: TableSchema;               // metadata for db.crud()
  databaseName?: string;
  minCapacity?: number;               // Aurora ACUs
  maxCapacity?: number;
  postgresVersion?: string;           // e.g. '16.13' (default '16.13')
  removalPolicy?: 'destroy' | 'retain' | 'snapshot';
  rlsPolicy?: 'enforce';
  logger?: ChildLogger;
}
```

Reach for them by situation:

- **Adopting an existing DB** — `connection: fromExisting({ ... })`. Setting both
  `connection` and `migrationsPath` throws; external-DB migrations run from
  `./migrations` on `npm run sandbox` / `npm run deploy`, not via this option.
- **A pinned engine version** — `postgresVersion: '16.13'` (must be
  `MAJOR.MINOR`, validated at synth).
- **Bigger/smaller Aurora** — `minCapacity` / `maxCapacity` in ACUs.

## Migrations

Numbered `.sql` files in `migrationsPath`. Each file runs once; applied files are
tracked in a `_migrations` table.

```
aws-blocks/migrations/
  001_create_users.sql
  002_create_posts.sql
  003_seed_admin.sql
```

They run in two different places, and this matters for debugging:

- **Local dev** — on the **first query** (PGlite, persisted in `.bb-data/`).
- **AWS** — via a **CustomResource migration Lambda during `cdk deploy`** (not on
  first request). A bad migration surfaces as a failed deploy, not a runtime
  error.

Set `migrationsPath` relative to your project root (`'./aws-blocks/migrations'`);
it is resolved at synth from the directory you run `cdk` / `npm run deploy` in.
Do not use `import.meta.url` to locate it — the backend is bundled to CommonJS in
Lambda where `import.meta` resolves to the bundled output location, not your
source tree.

## Kysely query builder

`createKyselyAdapter` is **safe at module scope**. Creating the adapter is
side-effect free: it does not call the engine — the engine resolves lazily on the
first query. (Its docstring says so explicitly, and `Database.getEngine()` is a
synth guard that `createKyselyAdapter` no longer calls eagerly.) So there is **no
dynamic-import requirement and no lazy-init requirement** — a plain top-level
`const kysely = createKyselyAdapter<Schema>(db)` is correct. What you must not do
is *run a query* at module scope (that hits `getEngine()` during synth).

```typescript
import { Database, createKyselyAdapter } from '@aws-blocks/bb-data';
import type { Kysely } from 'kysely';

interface Schema {
  users: { id: string; email: string; name: string };
  posts: { id: string; user_id: string; title: string };
}

const db = new Database(scope, 'main', { migrationsPath: './aws-blocks/migrations' });
const kysely: Kysely<Schema> = createKyselyAdapter<Schema>(db); // fine at module scope

// Queries run inside a handler:
const posts = await kysely
  .selectFrom('posts')
  .innerJoin('users', 'users.id', 'posts.user_id')
  .select(['posts.title', 'users.name'])
  .execute();

await kysely.transaction().execute(async (trx) => {
  await trx.insertInto('users').values({ id: '1', email: 'a@b.com', name: 'A' }).execute();
  await trx.insertInto('posts').values({ id: '1', user_id: '1', title: 'Hello' }).execute();
});
```

Kysely is a peer dependency — install it (`npm install kysely`).

**Schema-interface tip:** columns with a SQL `DEFAULT` should be typed
`number | undefined` (etc.) in the Kysely interface so inserts may omit them;
narrow back with `?? defaultValue` on read.

## `bb-data pull` — codegen and adopting an existing Postgres

`npx bb-data pull` is the normal way to get the Kysely schema type and to adopt an
existing Postgres/Supabase database. It introspects the database read-only (your
DB is not modified) and generates:

- `database.types.ts` — TypeScript interfaces for every table (your Kysely schema)
- `database.meta.ts` — runtime schema metadata that powers `db.crud()`
- `supabase.ts` — the `Database` + `db.crud()` wiring
- `migrations/000_baseline.sql` — a schema baseline for fresh environments
- `MIGRATION_GUIDE.md` — Supabase → Blocks pattern mapping

It does **not** migrate Supabase Auth, Storage, Realtime, or Edge Functions. It
also prompts for the server CA certificate and commits it to
`aws-blocks/database.ca.ts` so TLS is verified by default (see below). After
pulling, manage schema changes with version-controlled migrations in
`./migrations/`.

## Connecting to an existing database (TLS)

```typescript
import { Database, fromExisting } from '@aws-blocks/bb-data';
import { readFileSync } from 'node:fs';

const db = new Database(scope, 'external', {
  connection: fromExisting({
    connectionString: process.env.DATABASE_URL!,
    ssl: { ca: readFileSync('./supabase-ca.crt', 'utf8') }, // PEM contents, not a path
  }),
});
```

The server TLS certificate is **verified by default**. Managed providers
(Supabase, Neon, RDS) use a provider CA not in Node's trust store, so you must pin
it via `ssl.ca` (the PEM contents). `DATABASE_CA_CERT` (inline PEM or a file path)
overrides the committed cert at runtime. If no CA is available, the generated
wiring falls back to `ssl: { rejectUnauthorized: false }` (encrypted but
**unauthenticated**) in local dev only — the **deployed function fails closed** and
refuses to connect unverified. To explicitly opt out of verification, pass
`ssl: { rejectUnauthorized: false }`.

`ExternalDatabaseRef` also accepts a Data-API shape
(`{ host, database, secretArn }`) for wrapping an existing Aurora cluster.

## Row Level Security and CRUD

```typescript
const scoped = await db.withRLS({ userId: 'user-123', role: 'authenticated' });
const myPosts = await scoped.query<Post>(sql`SELECT * FROM posts`);
```

`db.withRLS(...)` is **async** — it returns `Promise<RLSEnabledDatabase>`, so you
must `await` it before running queries. `withRLS`
runs queries in a transaction with `SET LOCAL ROLE` and JWT claims set.
Locally (PGlite), the role must exist or queries fail with
`role "authenticated" does not exist` — create it in a migration
(`CREATE ROLE authenticated;`).

> **`rlsPolicy: 'enforce'` scopes ONLY `db.crud()`.** The generated CRUD methods
> always route through `withRLS()`, but raw `db.query()` / `db.execute()` /
> `db.transaction()` **bypass RLS** and run unscoped unless you explicitly call
> `db.withRLS({ userId })` yourself. Setting `rlsPolicy: 'enforce'` does not add
> row scoping to hand-written queries — it is a metadata/documentation flag, not
> a query-path guard. Hand-write a query without
> `withRLS` and you have a silent tenant-isolation hole.

`db.crud({ tables, auth })` generates flat typed methods per table —
`listUsers()`, `getUser(id)`, `createUser(data)`, `updateUser(id, data)`,
`deleteUser(id)`. `auth` takes no arguments; close over your request context to
resolve the user.

## Errors

Match on `error.name` with `isBlocksError`:

```typescript
import { DatabaseErrors } from '@aws-blocks/bb-data';
import { isBlocksError } from '@aws-blocks/core';

try {
  await db.execute(sql`INSERT INTO users (id, email) VALUES (${id}, ${email})`);
} catch (e: unknown) {
  if (isBlocksError(e, DatabaseErrors.UniqueConstraintViolation)) { /* duplicate key */ }
  throw e;
}
```

| Constant | `error.name` |
|---|---|
| `DatabaseErrors.QueryFailed` | `QueryFailedException` |
| `DatabaseErrors.ConnectionFailed` | `ConnectionFailedException` |
| `DatabaseErrors.TransactionFailed` | `TransactionFailedException` |
| `DatabaseErrors.UniqueConstraintViolation` | `UniqueConstraintViolationException` |
| `DatabaseErrors.SerializationFailure` | `SerializationFailureException` |

<details><summary>PGlite array-column quirk</summary>

PGlite does not auto-convert JS arrays to Postgres array literals. Build the
literal yourself and cast: `const arr = '{"a","b"}'; sql\`... ${arr}::text[]\``.
</details>

## What it provisions

Aurora Serverless v2 (PostgreSQL-compatible, 0.5–128 ACUs, Data API enabled), a
VPC with isolated subnets (no NAT), RDS Proxy for connection pooling, a Secrets
Manager secret with auto-rotated credentials, a CustomResource migration Lambda,
and IAM grants (`rds-data:*`, `secretsmanager:GetSecretValue`) to the app Lambda.
Connecting via `fromExisting()` skips all provisioning.
