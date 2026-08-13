# KVStore

**When to use:** Simple key-value data — user preferences, session data, caches, feature flags per-user, counters.

**When NOT to use:** Structured records with queries/indexes (use DistributedTable). SQL data (use Database). Large binary objects (use FileBucket).

Simple key-value storage with optional typed schemas.

**Schema validation:** Accepts any `@standard-schema/spec` compatible validator (Zod, Valibot, ArkType) for typed values. Without a schema, stores strings only.

```typescript
const store = new KVStore(scope, "cache", {});

await store.put("key", "value");
const val = await store.get("key"); // string | null
await store.delete("key");

// Conditional write (optimistic locking)
await store.put("key", "newValue", { ifValueEquals: "oldValue" });

// Create-only (fails if key exists)
await store.put("key", "value", { ifNotExists: true });

// Conditional delete
await store.delete("key", { ifExists: true });
await store.delete("key", { ifValueEquals: "expected" });

// Scan all keys (async iterator)
for await (const { key, value } of store.scan()) {
  console.log(key, value);
}
```

**Typed with schema:**
```typescript
const configSchema = z.object({ theme: z.string(), fontSize: z.number() });
const prefs = new KVStore(scope, "prefs", { schema: configSchema });

await prefs.put("user-1", { theme: "dark", fontSize: 14 }); // validated
const p = await prefs.get("user-1"); // { theme: string, fontSize: number } | null
```

**Options:**
- `schema` — StandardSchemaV1 validator for typed values
- `table` — `KVStore.fromExisting('my-table')` to wrap an existing DynamoDB table
- `logger` — `ChildLogger` for internal operations
- `removalPolicy` — `'destroy'` for sandbox/ephemeral stacks (table deleted on `cdk destroy`)

Local mock: JSON files in `.bb-data/`. AWS: DynamoDB single-table.


## TTL (Time-to-Live)

Opt-in per-item expiry backed by DynamoDB TTL:

```typescript
const cache = new KVStore(scope, "session-cache", {
  ttl: true, // enables DynamoDB TTL on the table
});

// Write with expiry
await cache.put("session:abc", data, { ttlSeconds: 3600 }); // expires in 1 hour
await cache.put("token:xyz", data, { expiresAt: Date.now() + 86400000 }); // absolute timestamp

// Reads and scans automatically filter expired items
const val = await cache.get("session:abc"); // null if expired

// Opt out of filtering (e.g. for maintenance sweeps)
const all = await cache.scan({ includeExpired: true });
```

**Note:** DynamoDB deletes expired items asynchronously (up to 48h). The local mock emulates the same expiry semantics (filters on read). Both `ttlSeconds` and `expiresAt` default to no expiry (item lives forever).

## What It Provisions

- DynamoDB table (single-table key-value design)
- IAM policies for table access

## See Also

- [distributed-table](./distributed-table.md) — When you need indexes and structured queries
- [app-setting](./app-setting.md) — Single app-wide config values
- [database](./database.md) — When you need SQL