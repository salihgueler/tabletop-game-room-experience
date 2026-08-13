# Realtime

**When to use:** Live data push to browsers — chat, presence indicators, live dashboards, collaborative editing, notifications, any feature needing instant server→client updates.

**When NOT to use:** Polling-based updates (just use API calls). Server-to-server messaging (use SQS/EventBridge via Pipeline). Request-response patterns (use ApiNamespace).

**Scaling envelope:** Best suited for channels with tens to low-thousands of concurrent subscribers. Publish latency scales linearly (~100ms for 1,000 subscribers). For 10K+ subscribers, use explicit fan-out via AsyncJob.

## Quick Start

```typescript
import { Realtime } from '@aws-blocks/blocks';
import { z } from 'zod';

const rt = new Realtime(scope, 'collab', {
  namespaces: {
    cursors: Realtime.namespace(z.object({ userId: z.string(), x: z.number(), y: z.number() })),
    chat: Realtime.namespace(z.object({ sender: z.string(), text: z.string() })),
  },
});
```

**Schema validation:** Accepts any `@standard-schema/spec` compatible validator (Zod, Valibot, ArkType).

## API

⚠️ **Runtime only.** `publish()`, `subscribe()`, and `getChannel()` must be called inside handlers (ApiNamespace methods, RawRoute, job handlers) — NOT at module top level. Top-level code runs during CDK synth where these methods don't exist.

| Method | Returns | Description |
|--------|---------|-------------|
| `rt.publish(namespace, channel, data)` | `Promise<void>` | Broadcast to all subscribers. Validates against schema. |
| `rt.getChannel(namespace, channel)` | `Promise<RealtimeChannel<T>>` | Get a channel handle (async — `await` it). Return from API for client hydration. |
| `rt.subscribe(namespace, channel, handler)` | `() => void` | Server-side subscribe. Returns unsubscribe function. |

### Channel Handle

`getChannel()` returns a `Promise<RealtimeChannel<T>>`:

| Method | Returns | Description |
|--------|---------|-------------|
| `subscribe(handler)` | `RealtimeSubscription` | Listen for messages (simple form) |
| `subscribe({ onMessage, onDisconnect? })` | `RealtimeSubscription` | With disconnect handling |
| `toJSON()` | `RealtimeChannelDescriptor` | Serializable (called by JSON.stringify) |

Channel handles do **not** have `publish()` — publishing always goes through `rt.publish()` server-side.

### RealtimeSubscription

| Property | Type | Description |
|----------|------|-------------|
| `unsubscribe()` | `() => void` | Stop receiving messages |
| `established` | `Promise<void>` | Resolves when server confirms subscription. **Always await this.** |
| `connection` | `WebSocket \| undefined` | Underlying WebSocket (client-side). Multiple channels share one connection. |

## Usage Patterns

### Server Publish via API

```typescript
export const api = new ApiNamespace(scope, 'api', (context) => ({
  async sendMessage(roomId: string, text: string) {
    const user = await auth.requireAuth(context);
    await rt.publish('chat', roomId, { sender: user.id, text });
    return { sent: true };
  },
}));
```

### Returning Channel Handles (Authorization Gate)

The recommended pattern — authorization happens in your API, channel handle only returned if allowed:

```typescript
export const api = new ApiNamespace(scope, 'api', (context) => ({
  async joinRoom(roomId: string) {
    const user = await auth.requireAuth(context);
    if (!canAccessRoom(user, roomId)) throw new Error('Forbidden');
    return rt.getChannel('chat', roomId);
  },
}));
```

Client side:
```typescript
const channel = await api.joinRoom('room-1');
const sub = channel.subscribe((msg) => {
  console.log(msg.sender, msg.text); // fully typed
});
await sub.established;
```

### Server-Side Subscribe

```typescript
const ch = await rt.getChannel('chat', roomId);
const sub = ch.subscribe((msg) => {
  console.log(`[${roomId}] ${msg.sender}: ${msg.text}`);
});
await sub.established;
```

On AWS, uses a real WebSocket — receives messages from any Lambda invocation. Locally, in-process EventEmitter.

### Multiple Subscriptions Share a Connection

```typescript
const sub1 = (await api.joinRoom('room-1')).subscribe(handler1);
const sub2 = (await api.joinRoom('room-2')).subscribe(handler2);
// sub1.connection === sub2.connection (same WebSocket)
```

Messages are routed to the correct handler — room-1 only to handler1, room-2 only to handler2.

### Handling Auth Failures

```typescript
const sub = channel.subscribe(handler);
try {
  await sub.established;
} catch (err) {
  if (err.name === 'ConnectionFailedException') {
    // token rejected — re-fetch channel from API
  }
}
```

A failed subscribe does **not** kill other subscriptions on the same connection.

### Handling Disconnects

API Gateway has a 2-hour max connection duration. Handle unexpected disconnects:

```typescript
const sub = channel.subscribe({
  onMessage: (msg) => { console.log(msg); },
  onDisconnect: (reason) => {
    // reason: 'client' | 'timeout' | 'error' | 'unknown'
    if (reason === 'client') return; // we called unsubscribe()
    // Re-fetch channel (new tokens), re-subscribe, backfill from DB
  },
});
```

### Large Fan-Out Pattern

For channels with many subscribers, offload to AsyncJob so the API response isn't blocked:

```typescript
const broadcast = new AsyncJob(scope, 'broadcast', {
  schema: z.object({ namespace: z.string(), channel: z.string(), data: z.any() }),
  handler: async ({ namespace, channel, data }) => {
    await rt.publish(namespace, channel, data);
  },
});

// In your API — returns immediately
await broadcast.submit({ namespace: 'updates', channel: 'global', data: payload });
```

## Schema Validation

Every `publish()` validates against the schema at runtime:

```typescript
import { isBlocksError } from '@aws-blocks/core';
import { RealtimeErrors } from '@aws-blocks/blocks';

try {
  await rt.publish('chat', 'room-1', { sender: 123 }); // wrong type
} catch (e) {
  if (isBlocksError(e, RealtimeErrors.ValidationFailed)) {
    // data failed schema validation
  }
}
```

## Error Constants

```typescript
import { RealtimeErrors } from '@aws-blocks/blocks';

RealtimeErrors.ValidationFailed   // data failed schema validation on publish
RealtimeErrors.PublishFailed       // Fan-out failed (AWS only)
RealtimeErrors.ConnectionFailed    // WebSocket connection or subscribe rejected
```

## Best Practices

- **Await `established`** before publishing or relying on a subscription
- **Subscribe before you publish** — no message buffering; subscriber only receives messages after registration
- **Publish through the API**, not channel handles — keeps auth in one place
- **Use channels for dynamic scoping** — `room-123`, `user-456`, `game-abc`
- **Keep payloads small** — max 32 KB per message (including wire envelope)
- **One Realtime instance per domain** — use multiple namespaces for different message types
- **Unsubscribe when done** — especially in mount/unmount cycles. Leaked subscriptions hold WebSocket open
- **Delivery is best-effort** — fire-and-forget per connection. If delivery to one subscriber fails, the rest continue

## Local Development

Local WebSocket server on the dev server port (3000). No external services. Messages delivered via in-process EventEmitter between handlers and subscribers.

## Scaling & Cost

- Connections: up to 500 concurrent per stage (adjustable via Service Quotas)
- Messages: ~$1.00 per million messages (API Gateway WebSocket pricing)
- Idle: $0 (fully serverless)
- Cold start: ~200ms for first connection in a stage

## Common Mistakes

❌ `new Realtime(scope, "realtime-messaging", ...)` — name too long
✅ `Use short IDs: new Realtime(scope, "rt", ...) — full name includes stack+scope prefixes`
_Channel paths are built from scope chain — keep IDs short to avoid exceeding URL limits_

❌ `Reusing a channel token across different channels`
✅ `Tokens are scoped to specific namespace/channel — get a fresh one per channel`
_"Invalid token" on subscribe — token scope mismatch_

❌ `Calling rt.publish() at module top level`
✅ `Call inside a handler (ApiNamespace method, RawRoute, job handler) — not at file scope`
_TypeError: rt.publish is not a function (runs during CDK synth)_

❌ `Publishing before client subscription is established`
✅ `Client: await sub.established THEN trigger the server action that publishes`
_Messages lost — no buffering, fire-and-forget delivery_

## What It Provisions

- API Gateway WebSocket API (`wss://` endpoint with `$connect`, `$disconnect`, `$default` routes)
- DynamoDB connections table (partition: `connectionId`, sort: `channel`, GSI: `channel-index`)
- WebSocket event handler on the shared Blocks handler Lambda (no separate Lambdas)
- AppSetting for token secret (connection auth)
- IAM roles for API Gateway Management API (`PostToConnectionCommand` for fan-out)

## See Also

- [agent](./agent.md) — Uses Realtime internally for streaming LLM chunks
- [distributed-table](./distributed-table.md) — Store message history alongside realtime delivery
- [auth-basic](./auth-basic.md) — Authenticate channel subscriptions
- [async-job](./async-job.md) — Offload large fan-out publishes
