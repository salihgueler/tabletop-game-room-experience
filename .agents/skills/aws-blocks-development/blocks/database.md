# Database

**When to use:** Full PostgreSQL — when you need JOINs, foreign keys, transactions, views, triggers, row-level security, or integration with existing Postgres tools.

**When NOT to use:** Simple key-value lookups (use KVStore). Document-style records without JOINs (use DistributedTable — cheaper, no cold start). Multi-region needs (use DistributedDatabase).

SQL with Kysely query builder. Requires `migrations/` folder with numbered `.sql` files.

```typescript
const db = new Database(scope, "mydb", { migrationsPath: "./migrations" });

// Raw SQL
const users = await db.query<{ id: string; name: string }>(
  sql`SELECT * FROM users`,
);

// Kysely — MUST be lazy-initialized (not top-level)
// The `createKyselyAdapter` import MUST be dynamic (`await import(...)`) because
// it's not available under the CDK module condition. A static import will crash
// during `npm run deploy`.
import type { Kysely } from "kysely";

interface MySchema {
  users: { id: string; email: string; name: string };
  posts: { id: string; user_id: string; title: string };
}

let _kysely: Kysely<MySchema> | null = null;
async function getKysely() {
  if (!_kysely) {
    const { createKyselyAdapter } = await import("@aws-blocks/blocks");
    _kysely = createKyselyAdapter<MySchema>(db);
  }
  return _kysely;
}

// Usage: (await getKysely()).selectFrom(...)
const posts = await (await getKysely())
  .selectFrom("posts")
  .innerJoin("users", "users.id", "posts.user_id")
  .select(["posts.title", "users.name"])
  .execute();

// Connect to existing database
import { fromExisting } from "@aws-blocks/blocks";
const extDb = new Database(scope, "ext", {
  ...fromExisting({
    connectionString: "postgresql://user:pass@host:5432/db",
    ssl: { ca: process.env.DATABASE_CA_CERT }, // TLS verified by default
    // ssl: { rejectUnauthorized: false } // opt out of verification explicitly
  }),
});
```

**Kysely table interfaces:** Columns with SQL defaults (e.g., `DEFAULT 1200`) must be `number | undefined` in the TypeScript interface so Kysely allows inserts without those columns. Map back to concrete types with `?? defaultValue` when reading.

**PGlite array columns:** PGlite doesn't auto-convert JS arrays to PostgreSQL array literals. Use `{"val1","val2"}` format with `::text[]` cast. See TROUBLESHOOTING.md.

Migration files: `migrations/001_create_users.sql`, `migrations/002_create_posts.sql`, etc. Migrations run automatically on first DB access.

Local mock: PGlite (WASM Postgres) in `.bb-data/`. AWS: Aurora Serverless v2.

**External database TLS:**
- `fromExisting()` now verifies server TLS certificate by default
- Pass `ssl: { ca: '...' }` to pin your provider's CA cert
- `bb-data pull` prompts for the CA and commits it to `aws-blocks/database.ca.ts`
- `DATABASE_CA_CERT` env var overrides the committed cert at runtime
- Deployed Lambda and CI **fail closed** (no unverified connections) — local dev warns but allows unverified for self-signed DBs

**Engine version:**
- Default Aurora PostgreSQL engine: `16.13` (previously `16.4`, which was retired by AWS)
- New option: `postgresVersion` on `DatabaseOptions` — override the engine version (e.g. `postgresVersion: '16.13'`)
- Must be `MAJOR.MINOR` format (e.g. `'16.13'`) — validated at synth time


## Common Mistakes

❌ ``createKyselyAdapter(db)` at module top level`
✅ `Lazy-init: `let _k = null; function getKysely() { if (!_k) _k = createKyselyAdapter(db); return _k; }``
_Deploy fails — "Missing environment variables BLOCKS*undefined*" during code gen_

❌ `JS arrays in PGlite TEXT[] columns`
✅ `Use PostgreSQL array literal: `const arr = '{"a","b"}'; sql`...${arr}::text[]```
_PGlite "malformed array literal" error_

❌ `"relation does not exist"`
✅ `Check `migrations/` folder — files need numeric prefixes (e.g., `001_create_users.sql`)`
_Migrations haven't run or table name is wrong_


## What It Provisions

- Aurora Serverless v2 PostgreSQL cluster
- RDS Data API for Lambda connectivity
- Secrets Manager secret (credentials)
- VPC + security groups (optional)
- Migration Lambda for schema management

## See Also

- [distributed-database](./distributed-database.md) — Multi-region SQL without Aurora's idle cost
- [distributed-table](./distributed-table.md) — NoSQL alternative — cheaper, no cold start
- [kv-store](./kv-store.md) — Simple key-value when SQL is overkill