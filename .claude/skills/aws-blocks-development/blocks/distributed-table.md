# DistributedTable

Structured records with a partition/sort key and secondary indexes, backed by
DynamoDB. The **default choice** for most application data — user profiles, posts,
orders, any entity with known access patterns. Zero cost at rest, no cold start.

**Use it for** entities with composite keys, range queries, secondary access
patterns, and batch operations.

**Don't use it for** JOINs or cross-entity transactions (Database /
DistributedDatabase), single-value storage (KVStore), or binary files
(FileBucket).

Schema validation accepts any `@standard-schema/spec` validator (Zod, Valibot,
ArkType). Examples use Zod.

## Contents

- Import and quick start
- The runtime-only rule
- `DistributedTableOptions`
- Read / write / delete
- Query — the exact option set
- Scan
- Conditional writes
- TTL
- Durability & security defaults
- Read validation and schema evolution
- Errors
- Local development
- What it provisions

## Import and quick start

```typescript
import { DistributedTable, DistributedTableErrors } from '@aws-blocks/blocks';
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

`isBlocksError` and `DistributedTable.fromKmsKey` are used below;
`fromKmsKey`/`fromExisting` are static methods on the class, and `isBlocksError`
comes from `@aws-blocks/core`.

**Type-inference trap:** do **not** write `new DistributedTable<MyType>(...)` with
a single explicit type arg — it pins only `T` and breaks key inference, so
`get()`/`query()` then demand every field instead of just the key fields. Either
let all generics infer, or pass all three. `as const` alone does not fix it.

## The runtime-only rule

Data methods (`get`, `put`, `delete`, `query`, `scan`, `getBatch`, `putBatch`,
`deleteBatch`) run at request time — call them inside an `ApiNamespace` method, a
`RawRoute` handler, a job handler, or a runtime script. **Calling them at the top
level of `aws-blocks/index.ts` throws during CDK synth** (top-level code runs at
synth, where the block resolves to its infrastructure construct with no data
methods — you get a `TypeError`). Constructing the block at module scope is fine;
only the method calls must live in handlers. To seed data, do it from a handler or
a separate runtime script.

## `DistributedTableOptions`

```typescript
interface DistributedTableOptions<T> {
  schema: StandardSchemaV1<T>;                     // Zod / Valibot / ArkType
  key: { partitionKey: keyof T & string; sortKey?: keyof T & string };
  indexes?: Record<string, { partitionKey: keyof T & string; sortKey?: keyof T & string }>;
  ttl?: keyof T & string;                          // field holding Unix epoch SECONDS
  readValidation?: 'off' | 'coerce' | 'strict';    // default 'coerce'
  protection?: 'disposable' | 'retained' | 'locked';                 // 0.4.0+
  pointInTimeRecovery?: boolean | { retentionDays: number };         // 0.4.0+
  encryption?: 'aws-managed' | 'customer-managed' | ExternalKmsKeyRef; // 0.4.0+
  table?: ExternalTableRef;                         // fromExisting()
  logger?: ChildLogger;
}
```

## Read / write / delete

```typescript
await tasks.put({ userId: 'u1', taskId: 't1', title: 'Ship it', done: false, createdAt: Date.now() });

const task = await tasks.get({ userId: 'u1', taskId: 't1' }); // T | null

// No update()/patch() — read-modify-write the whole item:
if (task) await tasks.put({ ...task, done: true });

await tasks.delete({ userId: 'u1', taskId: 't1' });

// Batch: getBatch ≤100 keys; putBatch/deleteBatch ≤25 each
const items = await tasks.getBatch([{ userId: 'u1', taskId: 't1' }, { userId: 'u1', taskId: 't2' }]);
await tasks.putBatch([item1, item2, item3]);
await tasks.deleteBatch([{ userId: 'u1', taskId: 'old1' }]);
```

## Query — the exact option set

`query(options)` returns an `AsyncIterable<T>`. The options object has **exactly
four** fields: `index`, `where`, `limit`, `order`. There is **no** cursor /
`nextToken` / `consistentRead` / `filter` / `projection` — do not invent
pagination or server-side filtering; there is none. Collect results with
`Array.fromAsync` or `for await`.

```typescript
type QueryOptions = {
  index?: string;              // GSI name from `indexes`; omit to query the primary key
  where: KeyCondition;         // required
  limit?: number;
  order?: 'asc' | 'desc';      // default 'asc'
};
```

```typescript
// Primary key
for await (const item of tasks.query({ where: { userId: { equals: 'u1' } } })) {
  console.log(item.title);
}

// GSI + sort-key condition + limit + order
const recent = await Array.fromAsync(tasks.query({
  index: 'byCreated',
  where: { userId: { equals: 'u1' }, createdAt: { greaterThan: Date.now() - 86400000 } },
  limit: 10,
  order: 'desc',
}));
```

The partition key must be given as `{ equals: ... }`. Sort-key operators: `equals`,
`lessThan`, `lessThanOrEqual`, `greaterThan`, `greaterThanOrEqual`,
`between: [low, high]`, and `beginsWith` (strings only).

**"List all items" pattern:** since there is no server-side filter and `scan` is
expensive, give the entity a constant field (e.g. `type: z.literal('USER')`) and a
GSI on it, then query the constant:

```typescript
for await (const user of users.query({ index: 'allByCreated', where: { type: { equals: 'USER' } } })) { /* ... */ }
```

## Scan

`scan(options?)` **exists** and is public — `scan(options?: { limit?: number }): AsyncIterable<T>`.
It enumerates every item, so it is expensive on large tables; prefer a GSI query.
Its only option is `limit`.

```typescript
const all = await Array.fromAsync(tasks.scan({ limit: 100 }));
for await (const item of tasks.scan()) { /* ... */ }
```

## Conditional writes

```typescript
await tasks.put(newTask, { ifNotExists: true });                 // create-only
await tasks.put(updatedTask, { ifFieldEquals: { version: 3 } }); // optimistic lock
await tasks.delete(key, { ifExists: true });
await tasks.delete(key, { ifFieldEquals: { status: 'draft' } });
```

Condition failure throws `ConditionalCheckFailedException` — catch with
`isBlocksError(e, DistributedTableErrors.ConditionalCheckFailed)`.

## TTL

```typescript
const sessions = new DistributedTable(scope, 'sessions', {
  schema: z.object({ sessionId: z.string(), expiresAt: z.number() }),
  key: { partitionKey: 'sessionId' },
  ttl: 'expiresAt',
});
await sessions.put({ sessionId: 's1', expiresAt: Math.floor(Date.now() / 1000) + 3600 });
```

The TTL field must be Unix epoch in **seconds**. Passing `Date.now()`
(milliseconds) sets expiry ~50 years out. DynamoDB deletes expired items
asynchronously (within ~48h of the timestamp).

## Durability & security defaults

> These `protection` / `pointInTimeRecovery` / `encryption` options and
> `fromKmsKey` shipped in **`@aws-blocks/blocks@0.4.0`** (commit `08ab129`,
> #282). They are not in `0.3.1`.

Durability posture comes from the **stack-wide `BlocksDefaults`** you pass to
`BlocksStack.create` / `BlocksBackend.create` — start from `BlocksPresets.production`
or `BlocksPresets.sandbox` (from `@aws-blocks/core/cdk`). Every block reads the
same defaults; a **per-block option always wins** over them.

- **`BlocksPresets.production`** → PITR on (restore to any second in 35 days),
  `RemovalPolicy.RETAIN` + deletion protection on (≈ `protection: 'locked'`),
  SSE-KMS with the `aws/dynamodb` key.
- **`BlocksPresets.sandbox`** → PITR off, `RemovalPolicy.DESTROY`, deletion
  protection off (≈ `protection: 'disposable'`) so `sandbox:destroy` is one
  command. SSE-KMS stays on in both (encryption isn't part of `BlocksDefaults` —
  it's a per-block option defaulting to `'aws-managed'`).

Per-block overrides:

```typescript
// Cost-sensitive prod table: protected, but skip PITR's backup-storage cost
const cache = new DistributedTable(scope, 'cache', {
  schema, key: { partitionKey: 'id' }, pointInTimeRecovery: false,
});

// Survives stack delete but stays directly deletable
const staging = new DistributedTable(scope, 'staging', {
  schema, key: { partitionKey: 'id' }, protection: 'retained',
});

// Dedicated customer-managed CMK (≈ $1/month/key)
const ledger = new DistributedTable(scope, 'ledger', {
  schema, key: { partitionKey: 'id' }, encryption: 'customer-managed',
});

// Share ONE customer-managed key across several tables (one key, one bill)
const key = DistributedTable.fromKmsKey('arn:aws:kms:us-east-1:111122223333:key/abcd-1234');
const orders = new DistributedTable(scope, 'orders', { schema, key: { partitionKey: 'id' }, encryption: key });
const events = new DistributedTable(scope, 'events', { schema, key: { partitionKey: 'id' }, encryption: key });
```

`protection: 'locked'`/`'retained'` uses `RemovalPolicy.RETAIN`, so deleting the
stack **orphans** the table. Because the table name is derived from the block id,
redeploying then fails with `Table already exists` until you delete or import the
orphan. `pointInTimeRecovery` charges for continuous-backup storage per GB-month.
When you bring your own table via `fromExisting()`, none of these apply — you own
the table's configuration.

## Read validation and schema evolution

`readValidation` controls how a stored item is reconciled with `schema` on
`get`/`getBatch`/`query`/`scan`. Default is `'coerce'`.

| Mode | On read | Non-conforming item |
|---|---|---|
| `'coerce'` (default) | returns coerced output (defaults filled, types narrowed) | returns the **raw** value + warns — never throws |
| `'strict'` | validates | throws `ValidationFailed` (one bad row fails the whole query/scan/batch) |
| `'off'` | returns raw value, no validation | returns as-is |

`'coerce'` deep-merges the coerced output over the raw stored item, so attributes
not in the current schema (older versions, columns another writer owns) survive a
read-modify-write. Coercion depends on the validator *transforming* input — Zod
fills defaults; a check-only Valibot/ArkType schema returns the value unchanged.
Use `'strict'` to treat a mismatch as corruption; `'off'` for hot paths or rows
you can't yet coerce.

## Errors

```typescript
import { isBlocksError } from '@aws-blocks/core';
import { DistributedTableErrors } from '@aws-blocks/bb-distributed-table';

try {
  await table.put(item, { ifNotExists: true });
} catch (e: unknown) {
  if (isBlocksError(e, DistributedTableErrors.ConditionalCheckFailed)) { /* already exists */ }
  if (isBlocksError(e, DistributedTableErrors.ItemTooLarge)) { /* > 400 KB */ }
  throw e;
}
```

| Constant | `error.name` | Thrown when |
|---|---|---|
| `ConditionalCheckFailed` | `ConditionalCheckFailedException` | `ifNotExists`/`ifExists`/`ifFieldEquals` failed |
| `ValidationFailed` | `ValidationFailedException` | item failed `schema` on `put`/`putBatch` |
| `InvalidQuery` | `InvalidQueryException` | bad query shape (missing `where`, partition key not `{ equals }`, unknown index, multiple sort-key conditions, empty `ifFieldEquals`) |
| `ItemTooLarge` | `ItemTooLargeException` | item exceeds DynamoDB's 400 KB limit |
| `BatchIncomplete` | `BatchIncompleteException` | batch left entries unprocessed after retries (AWS only) |

## Local development

Mock persists data to `.bb-data/{fullId}/` across restarts (wipe with
`rm -rf .bb-data`). It validates the 400 KB limit, schema, and conditional
failures like AWS; index queries are in-memory filtering — correct, but different
performance characteristics.

## What it provisions

A DynamoDB table (on-demand / PAY_PER_REQUEST), the configured GSIs (up to 20),
and IAM policies for table access. ~$1.25 per million writes, ~$0.25 per million
reads; storage ~$0.25/GB-month; 400 KB per item.
