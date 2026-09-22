# KVStore

Simple key-value storage backed by DynamoDB — user preferences, session data,
caches, per-user feature flags, counters. Fast single-key get/put/delete with
conditional writes and optional typed schemas.

**Use it for** single-key access where you don't need queries or indexes.

**Don't use it for** structured records with queries/indexes (DistributedTable),
SQL data (Database), or large binary objects (FileBucket).

Values are strings by default. Pass a `@standard-schema/spec` validator (Zod,
Valibot, ArkType) to store typed values.

## Contents

- Import
- Operations
- `KVStoreOptions`
- TTL (per-item expiry)
- Errors
- Local development and provisioning

## Import

```typescript
import { KVStore, KVStoreErrors } from '@aws-blocks/blocks';
```

`isBlocksError` comes from `@aws-blocks/core`.

## Operations

```typescript
const store = new KVStore(scope, 'cache');

await store.put('key', 'value');
const val = await store.get('key');       // string | null
await store.delete('key');

// Conditional writes
await store.put('key', 'newValue', { ifValueEquals: 'oldValue' }); // optimistic lock
await store.put('key', 'value', { ifNotExists: true });            // create-only
await store.delete('key', { ifExists: true });
await store.delete('key', { ifValueEquals: 'expected' });

// Scan all entries (AsyncIterable) — collect with Array.fromAsync or for await
for await (const { key, value } of store.scan()) {
  console.log(key, value);
}
```

Data methods are runtime-only — call them inside a handler, not at the top level
of `aws-blocks/index.ts` (top-level runs during CDK synth, where the block is an
infrastructure construct with no data methods).

### Typed values

```typescript
const prefs = new KVStore(scope, 'prefs', {
  schema: z.object({ theme: z.string(), fontSize: z.number() }),
});
await prefs.put('user-1', { theme: 'dark', fontSize: 14 });  // validated
const p = await prefs.get('user-1');                         // { theme, fontSize } | null
```

## `KVStoreOptions`

```typescript
interface KVStoreOptions<T = string> {
  schema?: StandardSchemaV1<T>;          // typed values; omit for strings
  ttl?: boolean;                         // enable per-item expiry (see below)
  table?: ExternalTableRef;              // wrap an existing table — see below
  removalPolicy?: 'destroy' | 'retain';
  deletionProtection?: boolean;
  logger?: ChildLogger;
}
```

`table` and `fromExisting` are two halves of the **same** feature, not
alternatives: `KVStore.fromExisting(tableName)` is a static factory that returns
an `ExternalTableRef`, which you then pass as the `table` option. You do not use
them independently.

```typescript
const store = new KVStore(scope, 'legacy', {
  table: KVStore.fromExisting('my-existing-table'),
});
```

## TTL (per-item expiry)

Enable DynamoDB TTL with `ttl: true`, then set expiry per write via `PutOptions`:

```typescript
const cache = new KVStore(scope, 'session-cache', { ttl: true });

await cache.put('session:abc', data, { ttlSeconds: 3600 });            // relative (seconds)
await cache.put('token:xyz', data, { expiresAt: new Date(Date.now() + 86400000) }); // absolute Date
await cache.put('token:xyz', data, { expiresAt: Math.floor(Date.now() / 1000) + 86400 }); // epoch SECONDS

const val = await cache.get('session:abc');   // reads/scans filter expired items
const all = await Array.fromAsync(cache.scan({ includeExpired: true })); // opt out of filtering
```

`PutOptions` = `{ ifNotExists?, ifValueEquals?, ttlSeconds?, expiresAt? }`. Both
`ttlSeconds` and `expiresAt` default to no expiry. DynamoDB deletes expired items
asynchronously (up to ~48h); the mock emulates the same read-time filtering.

**`expiresAt` is Unix epoch SECONDS** (the DynamoDB TTL unit) — either a `Date`
or a number of seconds. A numeric millisecond-epoch value (e.g.
`Date.now() + 86400000`) is **rejected** with `ValidationFailedException`: any
number `>= 1e11` is assumed to be milliseconds and refused rather than silently
stored as a year-5138 expiry. Pass a `Date`, or divide a ms value by 1000.

**`ttlSeconds` and `expiresAt` are mutually exclusive** — passing both throws
`ValidationFailedException` ("pass either `ttlSeconds` or `expiresAt`, not both").
`ttlSeconds` must be a finite number `> 0` (fractional values round up to the
next second); `expiresAt` may be any instant, including one already in the past
(requesting immediate expiry).

## Errors

```typescript
import { isBlocksError } from '@aws-blocks/core';
import { KVStoreErrors } from '@aws-blocks/bb-kv-store';

try {
  await store.put('k', 'v', { ifNotExists: true });
} catch (e: unknown) {
  if (isBlocksError(e, KVStoreErrors.ConditionalCheckFailed)) { /* key already exists */ }
  throw e;
}
```

| Constant | `error.name` |
|---|---|
| `KVStoreErrors.ConditionalCheckFailed` | `ConditionalCheckFailedException` |
| `KVStoreErrors.ValidationFailed` | `ValidationFailedException` |
| `KVStoreErrors.ItemTooLarge` | `ItemTooLargeException` |

## Local development and provisioning

Mock stores JSON at `.bb-data/{fullId}/store.json`, persisted across restarts
(wipe with `rm -rf .bb-data`). AWS provisions a single-table key-value DynamoDB
table plus IAM policies for access.

For app-wide single config values, use AppSetting; for structured records with
indexes, use DistributedTable.
