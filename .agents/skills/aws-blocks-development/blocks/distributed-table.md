# DistributedTable

Structured data with partition/sort keys and secondary indexes. Default choice for application data.

**Schema validation:** Accepts any `@standard-schema/spec` compatible validator (Zod, Valibot, ArkType). Examples below use Zod.

```typescript
import { z } from "zod";

const schema = z.object({
  userId: z.string(),
  taskId: z.string(),
  title: z.string(),
  done: z.boolean(),
  createdAt: z.number(),
});

const tasks = new DistributedTable(scope, "tasks", {
  schema,
  key: { partitionKey: "userId", sortKey: "taskId" },
  indexes: {
    byCreated: { partitionKey: "userId", sortKey: "createdAt" },
  },
});

// Write
await tasks.put({
  userId: "u1",
  taskId: "t1",
  title: "Ship it",
  done: false,
  createdAt: Date.now(),
});

// Read by key
const task = await tasks.get({ userId: "u1", taskId: "t1" });

// Query by index (async iterator)
for await (const item of tasks.query({
  index: "byCreated",
  where: { userId: { equals: "u1" } },
})) {
  console.log(item.title);
}

// Delete
await tasks.delete({ userId: "u1", taskId: "t1" });
```

Local mock: JSON files in `.bb-data/`. AWS: DynamoDB with GSIs.

**scan() — iterate all items:**
```typescript
for await (const item of tasks.scan({ limit: 100 })) {
  console.log(item);
}
```

**TTL (auto-expiry):**
```typescript
const sessions = new DistributedTable(scope, 'sessions', {
  schema: sessionSchema,
  key: { partitionKey: 'sessionId' },
  ttl: 'expiresAt', // Unix epoch seconds — DynamoDB auto-deletes expired items
});
```

**Conditional writes:**
```typescript
// Only write if item doesn't exist (create-only)
await tasks.put(newTask, { ifNotExists: true });

// Only write if a field matches expected value (optimistic locking)
await tasks.put(updatedTask, { ifFieldEquals: { version: 3 } });
```

**Conditional deletes:**
```typescript
await tasks.delete(key, { ifExists: true });
await tasks.delete(key, { ifFieldEquals: { status: 'draft' } });
```

**Wrap existing DynamoDB table:**
```typescript
const legacy = new DistributedTable(scope, 'legacy', {
  schema: mySchema,
  key: { partitionKey: 'pk', sortKey: 'sk' },
  table: DistributedTable.fromExisting('my-existing-table'),
});
```

**⚠️ Common mistake:** the `index` property on `query()`'s options object must be an index name from the `indexes` config — NOT a field name. `usersTable.query({ index: "id", where: {} })` throws `Index 'id' not found`.
