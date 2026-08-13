# Composition Recipes

Multi-block patterns showing how blocks wire together. Each recipe is a complete `aws-blocks/index.ts`.

---

## Recipe: Authenticated CRUD API

**Blocks:** `AuthBasic` + `DistributedTable` + `ApiNamespace`

**Why:** The starting pattern for any app that stores user-owned data behind login.

**Wiring points:**
- Pass `auth` in ApiNamespace options — all methods require auth by default
- Use `user.userId` from `requireAuth(context)` as the partition key to scope data per user

```typescript
import { Scope, ApiNamespace } from "@aws-blocks/core";
import { AuthBasic } from "@aws-blocks/blocks";
import { DistributedTable } from "@aws-blocks/blocks";
import { z } from "zod";

const scope = new Scope("my-app");
const auth = new AuthBasic(scope, "auth");

const todos = new DistributedTable(scope, "todos", {
  pk: "userId",
  sk: "todoId",
  attributes: { title: "string", done: "boolean", createdAt: "number" },
  indexes: { byDate: { pk: "userId", sk: "createdAt" } },
});

export const api = new ApiNamespace(scope, "api", { auth }, (context) => ({
  async createTodo(title: string) {
    const user = await auth.requireAuth(context);
    const todoId = crypto.randomUUID();
    await todos.put({ userId: user.userId, todoId, title, done: false, createdAt: Date.now() });
    return { todoId };
  },

  async listTodos() {
    const user = await auth.requireAuth(context);
    return todos.query({ index: "byDate", where: { userId: { equals: user.userId } } });
  },

  async toggleTodo(todoId: string) {
    const user = await auth.requireAuth(context);
    const item = await todos.get({ userId: user.userId, todoId });
    if (!item) throw new Error("Not found");
    await todos.update({ userId: user.userId, todoId }, { done: !item.done });
    return { done: !item.done };
  },

  async deleteTodo(todoId: string) {
    const user = await auth.requireAuth(context);
    await todos.delete({ userId: user.userId, todoId });
  },
}));

export const authApi = auth.createApi();
```

**Frontend snippet:**
```typescript
import { api, authApi } from "aws-blocks";
import { Authenticator } from "@aws-blocks/auth-common/ui";

document.body.appendChild(Authenticator(authApi));

// After sign-in:
const { todoId } = await api.createTodo("Buy milk");
const items = await api.listTodos();
```

---

## Recipe: AI Chat with History & Streaming

**Blocks:** `Agent` + `DistributedTable` + `AuthCognito`

**Why:** Conversational AI with per-user conversation persistence, auth-gated access, and real-time streaming.

**Wiring points:**
- Agent uses Realtime internally — no explicit Realtime block needed
- Frontend must subscribe (via `useChat`) BEFORE calling `stream()` — early chunks are lost otherwise
- Agent is server-side only — expose via ApiNamespace methods, never import in frontend

```typescript
import { Scope, ApiNamespace } from "@aws-blocks/core";
import { AuthCognito, Agent, DistributedTable } from "@aws-blocks/blocks";
import { z } from "zod";

const scope = new Scope("chat-app");

const auth = new AuthCognito(scope, "auth", {
  mfa: "optional",
  mfaTypes: ["TOTP"],
  groups: ["users"],
});

const notes = new DistributedTable(scope, "notes", {
  pk: "userId",
  sk: "noteId",
  attributes: { title: "string", content: "string" },
});

const agent = new Agent(scope, "assistant", {
  system: "You are a helpful assistant. Use the searchNotes tool to find user notes when asked.",
  tools: (tool) => ({
    searchNotes: tool({
      description: "Search the user's saved notes by keyword",
      schema: z.object({ keyword: z.string() }),
      handler: async ({ input, context }) => {
        const user = await auth.requireAuth(context);
        const all = await notes.query({ where: { userId: { equals: user.userId } } });
        return all.filter((n) => n.content.includes(input.keyword));
      },
    }),
  }),
});

export const api = new ApiNamespace(scope, "api", { auth }, (context) => ({
  async chat(message: string, conversationId?: string) {
    const user = await auth.requireAuth(context);
    return agent.stream(message, { conversationId, userId: user.userId, context });
  },

  async listConversations() {
    const user = await auth.requireAuth(context);
    return agent.listConversations(user.userId);
  },

  async deleteConversation(conversationId: string) {
    const user = await auth.requireAuth(context);
    await agent.deleteConversation(conversationId, user.userId);
  },
}));

export const authApi = auth.createApi();
```

**Frontend snippet:**
```typescript
import { api } from "aws-blocks";
import { useChat } from "@aws-blocks/blocks/react";

function Chat() {
  const { messages, send, isStreaming } = useChat(api.chat);
  // useChat handles: subscribe → stream() → collect chunks → update messages
  return <button onClick={() => send("What's in my notes about React?")}>Ask</button>;
}
```

---

## Recipe: Background Processing Pipeline

**Blocks:** `AsyncJob` + `FileBucket` + `EmailClient` + `Metrics` + `Dashboard`

**Why:** User uploads a file, backend processes it asynchronously, sends a notification, and tracks metrics.

**Wiring points:**
- FileBucket generates presigned upload URLs — client uploads directly to S3
- AsyncJob payload must be < 256KB — pass the file *key*, not the file content
- EmailClient and Metrics are called inside the job handler (runs async in Lambda)
- Dashboard auto-collects metrics from the Metrics block

```typescript
import { Scope, ApiNamespace } from "@aws-blocks/core";
import { AuthBasic, AsyncJob, FileBucket, EmailClient, Metrics, Dashboard } from "@aws-blocks/blocks";
import { z } from "zod";

const scope = new Scope("processor");
const auth = new AuthBasic(scope, "auth");
const bucket = new FileBucket(scope, "uploads");
const email = new EmailClient(scope, "mail", { from: "noreply@myapp.com" });
const metrics = new Metrics(scope, "metrics");
const dashboard = new Dashboard(scope, "dash");

const processJob = new AsyncJob(scope, "process", {
  schema: z.object({ fileKey: z.string(), userEmail: z.string() }),
  handler: async ({ input }) => {
    const start = Date.now();

    // Download and process the file
    const content = await bucket.get(input.fileKey);
    const result = processFile(content); // your logic
    await bucket.put(`results/${input.fileKey}`, result);

    // Notify user
    await email.send({
      to: input.userEmail,
      subject: "Processing complete",
      body: `Your file has been processed. Download: ${await bucket.getSignedUrl(`results/${input.fileKey}`)}`,
    });

    // Record metrics
    metrics.record("ProcessingTime", Date.now() - start, "Milliseconds");
    metrics.record("FilesProcessed", 1, "Count");
  },
});

export const api = new ApiNamespace(scope, "api", { auth }, (context) => ({
  async getUploadUrl(filename: string) {
    const user = await auth.requireAuth(context);
    const key = `${user.userId}/${Date.now()}-${filename}`;
    const url = await bucket.getSignedUploadUrl(key);
    return { url, key };
  },

  async startProcessing(fileKey: string) {
    const user = await auth.requireAuth(context);
    // Pass reference, NOT file content (256KB SQS limit)
    await processJob.submit({ fileKey, userEmail: user.email });
    return { status: "processing" };
  },
}));

export const authApi = auth.createApi();

function processFile(content: Buffer): Buffer {
  // Your processing logic here
  return content;
}
```

---

## Recipe: Multi-tenant SaaS

**Blocks:** `AuthCognito (groups)` + `DistributedTable` + `AppSetting` + `Hosting`

**Why:** Tenant-isolated data with role-based access control and per-tenant configuration.

**Wiring points:**
- Store `tenantId` as a custom attribute on the Cognito user — derive it server-side from the authenticated session
- Use `tenant#${tenantId}` as partition key prefix — guarantees data isolation at the DynamoDB level
- NEVER trust a client-supplied tenantId — always extract from the authenticated user
- AppSetting stores per-tenant feature flags (keyed by tenantId)

```typescript
import { Scope, ApiNamespace } from "@aws-blocks/core";
import { AuthCognito, DistributedTable, AppSetting, Hosting } from "@aws-blocks/blocks";
import { z } from "zod";

const scope = new Scope("saas");

const auth = new AuthCognito(scope, "auth", {
  groups: ["admins", "members"] as const,
  userAttributes: [{ name: "tenantId", type: "String" }] as const,
});

const data = new DistributedTable(scope, "data", {
  pk: "tenantKey", // "tenant#<tenantId>"
  sk: "recordId",
  attributes: { type: "string", payload: "string", createdBy: "string", createdAt: "number" },
  indexes: { byType: { pk: "tenantKey", sk: "type" } },
});

const features = new AppSetting(scope, "features");

// Helper: extract tenantId from authenticated user (server-side only)
async function getTenantId(context: any) {
  const user = await auth.requireAuth(context);
  const tenantId = user.attributes["custom:tenantId"];
  if (!tenantId) throw new Error("User has no tenant assignment");
  return { user, tenantId, tenantKey: `tenant#${tenantId}` };
}

export const api = new ApiNamespace(scope, "api", { auth }, (context) => ({
  async createRecord(type: string, payload: string) {
    const { user, tenantKey } = await getTenantId(context);
    const recordId = crypto.randomUUID();
    await data.put({ tenantKey, recordId, type, payload, createdBy: user.userId, createdAt: Date.now() });
    return { recordId };
  },

  async listByType(type: string) {
    const { tenantKey } = await getTenantId(context);
    return data.query({ index: "byType", where: { tenantKey: { equals: tenantKey }, type: { equals: type } } });
  },

  async getFeatureFlags() {
    const { tenantId } = await getTenantId(context);
    const flags = await features.get(`flags:${tenantId}`);
    return flags ? JSON.parse(flags) : { betaFeatures: false };
  },

  // Admin-only: update tenant feature flags
  async setFeatureFlags(flags: Record<string, boolean>) {
    const { tenantId } = await getTenantId(context);
    await auth.requireRole(context, "admins");
    await features.set(`flags:${tenantId}`, JSON.stringify(flags));
  },
}));

export const authApi = auth.createApi();
export const hosting = new Hosting(scope, "web");
```

---

## Recipe: Real-time Collaboration

**Blocks:** `Realtime` + `DistributedTable` + `AuthBasic` + `KVStore`

**Why:** Shared cursors, live chat, and presence tracking with message persistence and auto-expiring online status.

**Wiring points:**
- `getChannel()` returns an auth-gated handle — only return it after `requireAuth`
- KVStore with TTL for presence: set on join, auto-expires after 60s, refresh with heartbeat
- Realtime delivery is best-effort — backfill missed messages from DistributedTable on reconnect
- Subscribe before publishing; `await sub.established` before assuming connection is live

```typescript
import { Scope, ApiNamespace } from "@aws-blocks/core";
import { AuthBasic, Realtime, DistributedTable, KVStore } from "@aws-blocks/blocks";
import { z } from "zod";

const scope = new Scope("collab");
const auth = new AuthBasic(scope, "auth");

const rt = new Realtime(scope, "rt", {
  namespaces: {
    cursors: Realtime.namespace(z.object({ userId: z.string(), x: z.number(), y: z.number() })),
    chat: Realtime.namespace(z.object({ userId: z.string(), text: z.string(), ts: z.number() })),
  },
});

const messages = new DistributedTable(scope, "msgs", {
  pk: "roomId",
  sk: "ts",
  attributes: { userId: "string", text: "string" },
});

// TTL-based presence: keys auto-expire after 60s
const presence = new KVStore(scope, "presence", { ttlSeconds: 60 });

export const api = new ApiNamespace(scope, "api", { auth }, (context) => ({
  async joinRoom(roomId: string) {
    const user = await auth.requireAuth(context);

    // Mark user online (TTL auto-expires if they disconnect)
    await presence.set(`${roomId}:${user.userId}`, JSON.stringify({ name: user.username, joinedAt: Date.now() }));

    // Return channels for subscription
    return {
      cursors: await rt.getChannel("cursors", roomId),
      chat: await rt.getChannel("chat", roomId),
    };
  },

  // Heartbeat — client calls every 30s to keep presence alive
  async heartbeat(roomId: string) {
    const user = await auth.requireAuth(context);
    await presence.set(`${roomId}:${user.userId}`, JSON.stringify({ name: user.username, joinedAt: Date.now() }));
  },

  async sendMessage(roomId: string, text: string) {
    const user = await auth.requireAuth(context);
    const ts = Date.now();
    // Persist + broadcast in parallel
    await Promise.all([
      messages.put({ roomId, ts, userId: user.userId, text }),
      rt.publish("chat", roomId, { userId: user.userId, text, ts }),
    ]);
    return { ts };
  },

  async moveCursor(roomId: string, x: number, y: number) {
    const user = await auth.requireAuth(context);
    await rt.publish("cursors", roomId, { userId: user.userId, x, y });
  },

  // Load history on join (backfill what Realtime didn't deliver)
  async getHistory(roomId: string, since?: number) {
    await auth.requireAuth(context);
    return messages.query({
      where: { roomId: { equals: roomId }, ...(since ? { ts: { greaterThan: since } } : {}) },
    });
  },

  async getOnlineUsers(roomId: string) {
    await auth.requireAuth(context);
    // Scan presence keys for this room (non-expired = online)
    const keys = await presence.list(`${roomId}:`);
    return keys.map((k) => JSON.parse(k.value));
  },
}));

export const authApi = auth.createApi();
```

**Frontend snippet:**
```typescript
import { api } from "aws-blocks";

const { cursors, chat } = await api.joinRoom("room-1");

const chatSub = chat.subscribe({
  onMessage: (msg) => addMessageToUI(msg),
  onDisconnect: async (reason) => {
    if (reason === "client") return;
    // Reconnect + backfill missed messages from DB
    const { chat: newChat } = await api.joinRoom("room-1");
    const missed = await api.getHistory("room-1", lastSeenTimestamp);
    missed.forEach(addMessageToUI);
    newChat.subscribe({ onMessage: addMessageToUI });
  },
});
await chatSub.established;

// Heartbeat every 30s
setInterval(() => api.heartbeat("room-1"), 30_000);
```
