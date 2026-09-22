# Composition Recipes

Multi-block patterns showing how blocks wire together in a single
`aws-blocks/index.ts`. Each recipe is verified against the package `API.md`
files and the shipped `create-blocks-app` templates.

Two rules cut across every recipe, because they are the mistakes agents make
most:

- **`ApiNamespace` takes exactly three arguments** — `new ApiNamespace(scope,
  'api', (context) => ({ ...methods }))`. There is no options object and no
  `auth` argument. Auth is opt-in **per method**: call
  `await auth.requireAuth(context)` (or `requireRole`) at the top of each method
  that needs it, and omit it for public methods.
- **`table.query(...)` returns an `AsyncIterable<T>`, not an array.** Collect it
  with `await Array.fromAsync(table.query({ ... }))`. Awaiting the iterable
  directly does not give you an array, so `.filter`/`.map` on the awaited value
  throws. This matches `TESTING-REFERENCE.md`.

All symbols below are re-exported from the umbrella `@aws-blocks/blocks`
package, so a single import line works.

## Contents

- Recipe: Authenticated CRUD API
- Recipe: AI chat with tools
- Recipe: Background file processing
- Recipe: Multi-tenant SaaS with feature flags

---

## Recipe: Authenticated CRUD API

**Blocks:** `AuthBasic` + `DistributedTable` + `ApiNamespace`

The starting pattern for any app that stores user-owned data behind login. The
authenticated user's `username` is the partition key, so every query is
naturally scoped to one user — cross-user reads are impossible because the key
is never client-supplied.

`DistributedTable` has no `update()` method: read the item, then `put()` the
whole object back. Guard against lost updates with `ifFieldEquals` (optimistic
locking) — a concurrent writer bumps `version`, the condition fails, and `put`
throws `ConditionalCheckFailedException`.

```typescript
import { ApiNamespace, Scope, AuthBasic, DistributedTable } from "@aws-blocks/blocks";
import crypto from "node:crypto";
import { z } from "zod";

const scope = new Scope("todo-app");
const auth = new AuthBasic(scope, "auth");
export const authApi = auth.createApi();

const todoSchema = z.object({
  userId: z.string(),      // partition key — per-user isolation
  todoId: z.string(),      // sort key
  title: z.string(),
  done: z.boolean(),
  version: z.number(),     // optimistic-lock counter
  createdAt: z.number(),
});

const todos = new DistributedTable(scope, "todos", {
  schema: todoSchema,
  key: { partitionKey: "userId", sortKey: "todoId" },
  indexes: {
    byCreatedAt: { partitionKey: "userId", sortKey: "createdAt" },
  },
});

export const api = new ApiNamespace(scope, "api", (context) => ({
  async createTodo(title: string) {
    const user = await auth.requireAuth(context);
    const todoId = crypto.randomUUID();
    const todo = { userId: user.username, todoId, title, done: false, version: 1, createdAt: Date.now() };
    await todos.put(todo);
    return todo;
  },

  async listTodos() {
    const user = await auth.requireAuth(context);
    return await Array.fromAsync(
      todos.query({ index: "byCreatedAt", where: { userId: { equals: user.username } } })
    );
  },

  async toggleTodo(todoId: string) {
    const user = await auth.requireAuth(context);
    const todo = await todos.get({ userId: user.username, todoId });
    if (!todo) throw new Error("Not found");
    await todos.put(
      { ...todo, done: !todo.done, version: todo.version + 1 },
      { ifFieldEquals: { version: todo.version } },   // fails if a concurrent write bumped version
    );
    return { done: !todo.done };
  },

  async deleteTodo(todoId: string) {
    const user = await auth.requireAuth(context);
    await todos.delete({ userId: user.username, todoId });
  },
}));
```

---

## Recipe: AI chat with tools

**Blocks:** `Agent` + `DistributedTable` + `AuthBasic`

Conversational AI whose tools read the caller's own data. The Agent streams via
AsyncJob + Realtime internally — you do not add those blocks yourself.

Three things the types enforce:

- The tool field is **`parameters`** (a Zod schema), not `schema`. Tools are
  defined through the `tool(...)` factory passed to `tools`.
- The config field is **`systemPrompt`**, not `system`.
- `stream()` returns an `AgentStreamResult`. It is safe to return straight from
  an API method — its `toJSON()` serializes to `{ channelId, channel: null }`,
  and the client rebuilds a subscribe-only channel from `channelId`. `userId` is
  **required** on `stream()` unless the Agent is `inferenceOnly`.

The tool `handler` receives `{ input, context }`; `context` is the per-call tool
context (the `context` you pass to `stream`), which is where auth-derived values
belong. Note this is the Agent tool context, not the API `BlocksContext` — so
resolve the user in the API method and pass what the tool needs through
`stream({ context })`.

```typescript
import { ApiNamespace, Scope, AuthBasic, Agent, DistributedTable, BedrockModels } from "@aws-blocks/blocks";
import { z } from "zod";

const scope = new Scope("chat-app");
const auth = new AuthBasic(scope, "auth");
export const authApi = auth.createApi();

const noteSchema = z.object({
  userId: z.string(),
  noteId: z.string(),
  content: z.string(),
});

const notes = new DistributedTable(scope, "notes", {
  schema: noteSchema,
  key: { partitionKey: "userId", sortKey: "noteId" },
});

const assistant = new Agent(scope, "assistant", {
  systemPrompt: "You are a helpful assistant. Use searchNotes to answer questions about the user's saved notes.",
  model: { deployed: BedrockModels.FAST },
  toolContextSchema: z.object({ userId: z.string() }),
  tools: (tool) => ({
    searchNotes: tool({
      description: "Search the user's saved notes by keyword",
      parameters: z.object({ keyword: z.string() }),
      handler: async ({ input, context }) => {
        const all = await Array.fromAsync(
          notes.query({ where: { userId: { equals: context.userId } } })
        );
        return all.filter((n) => n.content.includes(input.keyword));
      },
    }),
  }),
});

export const api = new ApiNamespace(scope, "api", (context) => ({
  async chat(message: string, conversationId?: string) {
    const user = await auth.requireAuth(context);
    // userId is required for persistence; context feeds the tool's toolContextSchema.
    return assistant.stream(message, {
      userId: user.userId,
      conversationId,
      context: { userId: user.userId },
    });
  },
}));
```

The client subscribes to `result.channelId` for streaming chunks; the
`@aws-blocks/blocks/react` `useChat` hook wires that up.

---

## Recipe: Background file processing

**Blocks:** `FileBucket` + `AsyncJob` + `EmailClient` + `Metrics`

The client uploads directly to S3 with a presigned URL, then kicks off async
processing that emails the user and records metrics. Keep the SQS payload small
by passing the file **key**, never its bytes.

API-shape facts this recipe pins down:

- Presigned URLs are `bucket.putUrl(path)` (upload) and `bucket.getUrl(path)`
  (download). There is no `getSignedUrl`/`getSignedUploadUrl`.
- `EmailClient` takes `{ fromAddress }`, not `{ from }`. `send` needs
  `{ to, subject, body }` (`body` is the plain-text part; `html` is optional).
- `metrics.emit(name, value, { unit })` — there is no `record(...)`. `unit` is a
  `MetricUnit` string such as `'Milliseconds'` or `'Count'`.
- The `AsyncJob` handler signature is `(payload, context)` — `payload` is your
  typed value directly, not wrapped in `{ input }`.

```typescript
import { ApiNamespace, Scope, AuthBasic, FileBucket, AsyncJob, EmailClient, Metrics } from "@aws-blocks/blocks";
import { z } from "zod";

const scope = new Scope("processor");
const auth = new AuthBasic(scope, "auth");
export const authApi = auth.createApi();

const uploads = new FileBucket(scope, "uploads");
const email = new EmailClient(scope, "mail", { fromAddress: "noreply@myapp.com" });
const metrics = new Metrics(scope, "metrics", { namespace: "Processor" });

const processJob = new AsyncJob(scope, "process", {
  schema: z.object({ fileKey: z.string(), userEmail: z.string() }),
  handler: async (payload) => {
    const start = Date.now();

    const file = await uploads.get(payload.fileKey);
    if (!file) throw new Error(`Missing upload: ${payload.fileKey}`);
    const resultKey = `results/${payload.fileKey}`;
    await uploads.put(resultKey, transform(file.body));

    await email.send({
      to: payload.userEmail,
      subject: "Processing complete",
      body: `Your file is ready: ${await uploads.getUrl(resultKey)}`,
    });

    metrics.emit("ProcessingTime", Date.now() - start, { unit: "Milliseconds" });
    metrics.emit("FilesProcessed", 1, { unit: "Count" });
  },
});

export const api = new ApiNamespace(scope, "api", (context) => ({
  async getUploadUrl(filename: string) {
    const user = await auth.requireAuth(context);
    const key = `${user.userId}/${Date.now()}-${filename}`;
    return { url: await uploads.putUrl(key), key };
  },

  async startProcessing(fileKey: string) {
    const user = await auth.requireAuth(context);
    // Pass the key, not the bytes — SQS payloads are capped at 256 KB.
    const { jobId } = await processJob.submit({ fileKey, userEmail: user.username });
    return { jobId, status: "processing" };
  },
}));

function transform(body: Buffer): Buffer {
  return body; // your processing logic
}
```

`Metrics` feeds a `Dashboard` if you add one: `new Dashboard(scope, 'dash', {
metrics })`. You must pass the `Metrics` instance — a bare `Dashboard` collects
nothing.

---

## Recipe: Multi-tenant SaaS with feature flags

**Blocks:** `AuthCognito` + `DistributedTable` + `KVStore`

Tenant-isolated data with group-based admin access and per-tenant feature flags.
The `tenantId` lives as a Cognito custom attribute and is read **server-side**
from the authenticated session — a client-supplied tenant id is never trusted.
Prefixing the partition key with `tenant#<id>` isolates every tenant's rows.

Two API-shape corrections drive the structure:

- Custom attributes are declared via `userAttributes: [{ name: 'tenantId', type:
  'String' }]` and read back as `user.attributes['custom:tenantId']` (Cognito
  prefixes custom attributes with `custom:`). Group RBAC is `groups: [...]` plus
  `await auth.requireRole(context, 'admins')`.
- **`AppSetting` cannot store per-tenant flags.** It is a *single* value —
  `get()` takes no arguments and `put(value)` sets the one value. There is no
  keyed access. Feature flags keyed by tenant belong in `KVStore`, whose
  `get(key)` / `put(key, value)` are keyed. `KVStore<T>` with a schema stores
  typed objects directly (no manual `JSON.parse`).

```typescript
import { ApiNamespace, Scope, AuthCognito, DistributedTable, KVStore } from "@aws-blocks/blocks";
import crypto from "node:crypto";
import { z } from "zod";

const scope = new Scope("saas");

const auth = new AuthCognito(scope, "auth", {
  groups: ["admins", "members"],
  userAttributes: [{ name: "tenantId", type: "String" }],
});
export const authApi = auth.createApi();

const recordSchema = z.object({
  tenantKey: z.string(),   // "tenant#<tenantId>" — partition key isolates tenants
  recordId: z.string(),
  type: z.string(),
  payload: z.string(),
  createdBy: z.string(),
  createdAt: z.number(),
});

const data = new DistributedTable(scope, "data", {
  schema: recordSchema,
  key: { partitionKey: "tenantKey", sortKey: "recordId" },
  indexes: {
    byType: { partitionKey: "tenantKey", sortKey: "type" },
  },
});

// Feature flags keyed by tenantId — KVStore, because AppSetting is single-value.
const flags = new KVStore<{ betaFeatures: boolean }>(scope, "flags", {
  schema: z.object({ betaFeatures: z.boolean() }),
});

// Resolve tenant from the authenticated session — never from client input.
async function resolveTenant(context: any) {
  const user = await auth.requireAuth(context);
  const tenantId = user.attributes["custom:tenantId"];
  if (!tenantId) throw new Error("User has no tenant assignment");
  return { user, tenantId, tenantKey: `tenant#${tenantId}` };
}

export const api = new ApiNamespace(scope, "api", (context) => ({
  async createRecord(type: string, payload: string) {
    const { user, tenantKey } = await resolveTenant(context);
    const recordId = crypto.randomUUID();
    await data.put({ tenantKey, recordId, type, payload, createdBy: user.userId, createdAt: Date.now() });
    return { recordId };
  },

  async listByType(type: string) {
    const { tenantKey } = await resolveTenant(context);
    return await Array.fromAsync(
      data.query({ index: "byType", where: { tenantKey: { equals: tenantKey }, type: { equals: type } } })
    );
  },

  async getFeatureFlags() {
    const { tenantId } = await resolveTenant(context);
    return (await flags.get(tenantId)) ?? { betaFeatures: false };
  },

  async setFeatureFlags(value: { betaFeatures: boolean }) {
    const { tenantId } = await resolveTenant(context);
    await auth.requireRole(context, "admins");   // group-gated: throws if not an admin
    await flags.put(tenantId, value);
    return { success: true };
  },
}));
```
