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
- Backups and encryption (`bb-data@0.4.0`)
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
  storageEncryptionKeyArn?: string;   // customer-managed KMS key — bb-data@0.4.0
  pointInTimeRecovery?: boolean | { retentionDays: number }; // bb-data@0.4.0
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

### Backups and encryption (`bb-data@0.4.0`)

**`pointInTimeRecovery`** controls automated backups, which are also the
point-in-time-recovery window. One knob, since the recovery window only means
anything when backups are on:

- `true` — enable backups with the standard **15-day** window.
- `{ retentionDays: n }` — pin the window. Aurora requires an integer **1–35**;
  out of range warns at synth and falls back to 15.
- `false` — Aurora **cannot** disable automated backups (cluster minimum is 1
  day), so this clamps to 1 day rather than turning them off.

Omitted, it follows `defaults.pointInTimeRecovery` (on under `production`, off
under `sandbox` — and a `false` default lands on the 1-day minimum per the
clamp). A per-block value always wins. The PostgreSQL engine log is also
exported to CloudWatch Logs, with retention from `defaults.logRetention`.

**Storage encryption at rest is opt-in**, via the
`@aws-blocks/bb-data:encryptStorageByDefault` context flag — which
`create-blocks-app` now sets in every template's `cdk.json`, so a newly
scaffolded project encrypts by default with the AWS-managed `aws/rds` key.
`storageEncryptionKeyArn` (the ARN of a customer-managed key) turns encryption
on regardless of the flag and also encrypts the cluster's auto-generated
credentials secret. With neither set, the `StorageEncrypted` property is left
**unset** and a synth warning explains how to opt in.

The key is referenced by ARN rather than a `kms.IKey` because `Database`
resolves to a runtime entry point that must not import `aws-cdk-lib`. Blocks
*imports* the key and cannot modify its policy, so the key must already allow:
`kms:CreateGrant` + `kms:DescribeKey` for the deploying principal (RDS grants
against it to encrypt the volume), and `kms:Decrypt` for the principal reading
the credentials secret over the Data API. Same account and region as the
cluster.

> ⚠️ **Turning encryption on for an already-deployed unencrypted cluster
> replaces it, destructively.** RDS cannot encrypt a cluster in place, so
> CloudFormation creates a **new, empty** encrypted cluster and repoints the
> stack. The migration CustomResource does **not** re-run on a cluster swap (its
> only properties are the service token and the migrations hash, neither of
> which changes), so the new cluster comes up with **no schema**. Under
> `production` (RETAIN) the old cluster is orphaned; under `sandbox` (DESTROY)
> it and its data are deleted. The reverse — dropping the flag from a project
> that already deployed encrypted — replaces it symmetrically. The only safe
> route is snapshot, restore with encryption enabled, then cut over. Review the
> diff and snapshot first.

Backup-retention and log-export changes alter synthesized cluster properties, so
upgrading an existing stack to `bb-data@0.4.0` shows a CloudFormation diff.
`iamAuthentication` stays intentionally off — access is exclusively via the RDS
Data API.

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
  `bb-data@0.3.1` ships PGlite 0.5.8 (Postgres 18); a `.bb-data` folder made by
  an older version must be deleted once (see TROUBLESHOOTING.md).
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

**PostgreSQL 16+ (including Aurora) needs a role grant** (`bb-data@0.5.0`). The
database user must be a member of each RLS role, so add this to a migration
after creating the roles:

```sql
GRANT authenticated TO CURRENT_USER;
GRANT anon TO CURRENT_USER;
```

Without it the role switch is refused and `withRLS()` fails with a 500
`QueryFailed`; the server log names the missing grant.

**`claims` can't override `sub` or `role`** (breaking in `bb-data@0.5.0`). In
`withRLS({ userId, role, claims })`, `request.jwt.claims.sub` always comes from
`userId` and `role` always from `role`, so a policy reading either claim sees the
server-derived value. Other claims still pass through. If you relied on
`claims.sub` or `claims.role`, pass the value as `userId` / `role` or use a
different claim name.

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
| `DatabaseErrors.PermissionDenied` | `PermissionDeniedException` (403) |
| `DatabaseErrors.CheckViolation` | `CheckViolationException` (400) |
| `DatabaseErrors.NotNullViolation` | `NotNullViolationException` (400) |
| `DatabaseErrors.ForeignKeyViolation` | `ForeignKeyViolationException` (409) |

**Named 4xx errors (breaking in `bb-data@0.5.0` / `@aws-blocks/blocks@0.9.0`).**
These Postgres failures used to surface as a generic 500 `QueryFailed`. On every
engine (local PGlite, `pg`, Data API) they now map to:

| Postgres error | SQLSTATE | Error | HTTP |
|---|---|---|---|
| RLS rejection, or no grant for the role | `42501` | `PermissionDenied` | 403 |
| Check constraint | `23514` | `CheckViolation` | 400 |
| Not-null constraint | `23502` | `NotNullViolation` | 400 |
| Foreign key | `23503` | `ForeignKeyViolation` | 409 |

Each carries a fixed message (the driver text stays server-side as `cause`) and
none is retriable. They cross the wire, so the client can match them with
`isBlocksError` too. Code that matched these with `DatabaseErrors.QueryFailed`,
or treated them as 500s, must match the new names.

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

**VPC placement (`0.9.0`).** A `Database` joins only a VPC you pass as
`defaults.vpc.network`. It never joins the shared VPC Blocks derives when you add
a container `Compute`, because moving an existing Aurora cluster into a new VPC
is a CloudFormation replacement that destroys the database. With no customer VPC
it keeps building its own, as before. See [compute](compute.md).

A script that imports the backend under local dev (seed script, one-off CLI,
test) now exits when it finishes; before `0.9.0` the local engine held the
process open.
