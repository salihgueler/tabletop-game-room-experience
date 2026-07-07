# DistributedDatabase

Globally distributed SQL database with CockroachDB-compatible semantics. Supports migrations, Kysely, and serializable transactions with OCC retry.

```typescript
const db = new DistributedDatabase(scope, "mydb", {
  migrationsPath: "./migrations",
});

// Raw SQL (same API as Database)
const users = await db.query<{ id: string; name: string }>(
  sql`SELECT * FROM users`,
);

// Kysely query builder (same lazy-init pattern as Database)
const kysely = await getKysely(); // same pattern as Database block

// Transactions with OCC retry
await db.transaction(async (tx) => {
  const balance = await tx.query(sql`SELECT amount FROM accounts WHERE id = 'a1'`);
  await tx.query(sql`UPDATE accounts SET amount = ${balance[0].amount - 100} WHERE id = 'a1'`);
  await tx.query(sql`UPDATE accounts SET amount = amount + 100 WHERE id = 'a2'`);
}, { retryOnConflict: true, maxRetries: 3 });
```

**Key methods:**

- `query<T>(sql)` — execute SQL, return typed rows
- `transaction(fn, opts?)` — serializable transaction with optional OCC retry
- Kysely adapter via `createKyselyAdapter(db)` (same pattern as Database)

**TransactionOptions:**
- `retryOnConflict` — auto-retry on OCC conflict (error 40001). Default: `false`
- `maxRetries` — max retry attempts. Default: `3`

⚠️ Transaction callbacks may execute multiple times on retry. Do NOT include external side effects.

Local mock: PGlite (WASM Postgres) in `.bb-data/`. AWS: Aurora Serverless v2 (multi-region).

⚠️ **DSQL limitation:** Index key sort order (`ASC`/`DESC`) is not supported by Aurora DSQL. Index definitions that specify sort order will be rejected at deploy time. Omit sort order from index column definitions.
