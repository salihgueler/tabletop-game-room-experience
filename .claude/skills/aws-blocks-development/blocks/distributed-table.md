# DistributedTable

**When to use:** Structured records with indexes and queries — the **default choice** for most app data. User profiles, posts, orders, any entity with known access patterns.

**When NOT to use:** Complex JOINs or transactions across entities (use Database/DistributedDatabase). Simple single-value storage (use KVStore). Binary files (use FileBucket).

Structured data with partition/sort keys and secondary indexes.

**Schema validation:** Accepts any `@standard-schema/spec` compatible validator (Zod, Valibot, ArkType). Examples below use Zod.

## Quick Start

```typescript
import { DistributedTable } from '@aws-blocks/blocks';
import { z } from 'zod';

const schema = z.object({
  userId: z.string(),
  taskId: z.string(),
  title: z.string(),
  done: z.boolean(),
  createdAt: z.number(),
});

const tasks = new DistributedTable(scope, 'tasks', {
  schema,
  key: { partitionKey: 'userId', sortKey: 'taskId' },
  indexes: {
    byCreated: { partitionKey: 'userId', sortKey: 'createdAt' },
  },
});
```

## Options

```typescript
interface DistributedTableOptions<T> {
  schema: StandardSchema<T>;                      // Zod, Valibot, or ArkType schema
  key: {
    partitionKey: keyof T;                        // Required — hash key
    sortKey?: keyof T;                            // Optional — range key
  };
  indexes?: Record<string, {
    partitionKey: keyof T;
    sortKey?: keyof T;
  }>;
  ttl?: keyof T;                                  // Field name with Unix epoch seconds — DynamoDB auto-deletes expired items
  readValidation?: 'coerce' | 'strict' | 'off';  // How reads reconcile stored items with schema (default: 'coerce')
  table?: ExternalTableRef;                       // Wrap existing DynamoDB table via fromExisting()
  logger?: ChildLogger;                           // Optional logger instance
}
```

## Operations

### Write

```typescript
// Put (create or overwrite)
await tasks.put({ userId: 'u1', taskId: 't1', title: 'Ship it', done: false, createdAt: Date.now() });

// Update specific fields — use get→modify→put pattern (no partial update method)
const task = await tasks.get({ userId: 'u1', taskId: 't1' });
if (task) {
  await tasks.put({ ...task, done: true });
}
```

### Read

```typescript
// Get by key (returns T | null)
const task = await tasks.get({ userId: 'u1', taskId: 't1' });

// Batch get (max 100 keys per call)
const items = await tasks.getBatch([
  { userId: 'u1', taskId: 't1' },
  { userId: 'u1', taskId: 't2' },
]);
```

### Delete

```typescript
await tasks.delete({ userId: 'u1', taskId: 't1' });
```

### Query (by partition key + optional sort key conditions)

```typescript
// Query primary key — all tasks for a user
for await (const item of tasks.query({
  where: { userId: { equals: 'u1' } },
})) {
  console.log(item.title);
}

// Query with GSI — tasks by creation date
for await (const item of tasks.query({
  index: 'byCreated',
  where: {
    userId: { equals: 'u1' },
    createdAt: { greaterThan: Date.now() - 86400000 }, // last 24h
  },
})) {
  console.log(item.title);
}

// With limit and ascending/descending
for await (const item of tasks.query({
  index: 'byCreated',
  where: { userId: { equals: 'u1' } },
  limit: 10,
  order: 'desc', // newest first
})) { /* ... */ }
```

**Sort key condition operators:**

| Operator | Usage |
|----------|-------|
| `equals` | `{ sortKey: { equals: value } }` |
| `lessThan` | `{ sortKey: { lessThan: value } }` |
| `lessThanOrEqual` | `{ sortKey: { lessThanOrEqual: value } }` |
| `greaterThan` | `{ sortKey: { greaterThan: value } }` |
| `greaterThanOrEqual` | `{ sortKey: { greaterThanOrEqual: value } }` |
| `between` | `{ sortKey: { between: [low, high] } }` |
| `beginsWith` | `{ sortKey: { beginsWith: prefix } }` — strings only |

### Scan (full table)

```typescript
for await (const item of tasks.scan({ limit: 100 })) {
  console.log(item);
}
```

⚠️ Scan reads every item — expensive on large tables. Prefer query with a GSI.

### Batch Operations

```typescript
// Batch put (max 25 items per call)
await tasks.putBatch([item1, item2, item3]);

// Batch delete (max 25 keys per call)
await tasks.deleteBatch([
  { userId: 'u1', taskId: 'old1' },
  { userId: 'u1', taskId: 'old2' },
]);
```

## Conditional Writes

```typescript
// Only write if item doesn't exist (create-only, prevents overwrite)
await tasks.put(newTask, { ifNotExists: true });

// Only write if a field matches expected value (optimistic locking)
await tasks.put(updatedTask, { ifFieldEquals: { version: 3 } });

// Conditional delete
await tasks.delete(key, { ifExists: true });
await tasks.delete(key, { ifFieldEquals: { status: 'draft' } });
```

Condition failure throws — catch and retry/abort as appropriate.

## TTL (Auto-Expiry)

```typescript
const sessions = new DistributedTable(scope, 'sessions', {
  schema: z.object({
    sessionId: z.string(),
    userId: z.string(),
    expiresAt: z.number(), // Unix epoch SECONDS (not milliseconds!)
  }),
  key: { partitionKey: 'sessionId' },
  ttl: 'expiresAt',
});

// Item auto-deleted after expiry (within ~48h of the TTL value)
await sessions.put({
  sessionId: 's1',
  userId: 'u1',
  expiresAt: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
});
```

⚠️ TTL field must be Unix epoch in **seconds** (not milliseconds). Using `Date.now()` directly will set expiry ~50 years in the future.

## GSI Design Patterns

### List all items (global query)

No scan operation by default. Use a constant partition key in a GSI:

```typescript
const users = new DistributedTable(scope, 'users', {
  schema: z.object({
    userId: z.string(),
    type: z.literal('USER'), // constant
    createdAt: z.number(),
    name: z.string(),
  }),
  key: { partitionKey: 'userId' },
  indexes: {
    allByCreated: { partitionKey: 'type', sortKey: 'createdAt' },
  },
});

// "List all users" = query the GSI with the constant
for await (const user of users.query({
  index: 'allByCreated',
  where: { type: { equals: 'USER' } },
})) { /* ... */ }
```

### Multi-access pattern entity

```typescript
const posts = new DistributedTable(scope, 'posts', {
  schema: postSchema,
  key: { partitionKey: 'postId' },
  indexes: {
    byAuthor: { partitionKey: 'authorId', sortKey: 'createdAt' },
    byCategory: { partitionKey: 'category', sortKey: 'createdAt' },
  },
});
```

## Wrap Existing DynamoDB Table

```typescript
const legacy = new DistributedTable(scope, 'legacy', {
  schema: mySchema,
  key: { partitionKey: 'pk', sortKey: 'sk' },
  table: DistributedTable.fromExisting('my-existing-table-name'),
});
```

## Local Development

- Mock stores data as JSON in `.bb-data/`
- Indexes are simulated — queries work correctly
- Data persists across dev server restarts. Wipe with `rm -rf .bb-data`

## Capacity & Cost (AWS)

- Default: on-demand capacity (pay-per-request)
- No idle cost for inactive tables
- GSIs billed separately (same per-request pricing)
- Storage: $0.25/GB/month

## Common Mistakes

❌ `table.query({ index: "userId", where: {...} })`
✅ `Use the index NAME defined in config, not the field name: table.query({ index: "byUser", where: {...} })`
_"Index 'X' not found" — index param must match the indexes config key_

❌ `Trying to list all items without a GSI`
✅ `Add a constant partition key (e.g., type: "USER") with a GSI, then query by that constant`
_Design access patterns with GSIs — avoid scan for production queries_

❌ `TTL field with Date.now() (milliseconds)`
✅ `Use Math.floor(Date.now() / 1000) — TTL must be Unix epoch SECONDS`
_Item won't expire for ~50 years if you use milliseconds_

❌ `putBatch with > 25 items`
✅ `Split into multiple calls of ≤25 items each`
_DynamoDB BatchWriteItem limit is 25 items_

## Read Validation

Reads now reconcile stored items with the schema via `readValidation`:

```typescript
const orders = new DistributedTable(scope, "orders", {
  schema: orderSchemaV2, // adds `currency: z.string().default('USD')`
  key: { partitionKey: "orderId" },
  readValidation: 'coerce', // default — fills defaults, narrows types
  // 'strict' — throws ValidationFailed on any non-conforming item
  // 'off' — return raw stored value (previous default behavior)
});
```

**Behavioral change:** The default is now `'coerce'` (previously reads returned raw values). Pass `readValidation: 'off'` to restore raw reads. Coercion preserves attributes not in the current schema (older-schema fields) during read-modify-write cycles.

## What It Provisions

- DynamoDB table with on-demand capacity
- Global Secondary Indexes (as configured)
- IAM policies for table access

## See Also

- [database](./database.md) — When you need SQL JOINs/transactions
- [kv-store](./kv-store.md) — Simpler key-value without indexes
- [file-bucket](./file-bucket.md) — Binary/file storage
