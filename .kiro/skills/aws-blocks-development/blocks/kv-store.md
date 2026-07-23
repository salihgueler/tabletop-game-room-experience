# KVStore

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
