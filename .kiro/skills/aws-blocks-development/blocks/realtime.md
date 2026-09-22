# Realtime

Typed real-time pub/sub: push data from the server to connected browsers over a
WebSocket, with per-namespace schema validation on publish.

**Use it for** chat, presence, live dashboards, collaborative editing,
notifications — anything needing instant server→client updates.

**Don't use it for** request/response (ApiNamespace), polling-friendly data (just
call the API), server-to-server messaging (AsyncJob / a queue), or durable
guaranteed delivery (AsyncJob). Delivery here is best-effort fire-and-forget.

## Contents

- Import
- Quick start
- Runtime API (`publish` / `getChannel` / `subscribe`)
- Channel handles and subscriptions
- Usage patterns (publish, authorization gate, server subscribe, fan-out)
- Handling auth failures and disconnects
- Limits — channel path and message size
- Error constants
- Best practices
- Local development
- What it provisions

## Import

```typescript
import { Realtime } from '@aws-blocks/blocks';        // Realtime IS re-exported here
import { RealtimeErrors } from '@aws-blocks/bb-realtime'; // RealtimeErrors is NOT
```

`RealtimeErrors` is **not** re-exported from `@aws-blocks/blocks` — only the
`Realtime` class and its types are. Import `RealtimeErrors` from
`@aws-blocks/bb-realtime`, or every `isBlocksError(e, RealtimeErrors.X)` compares
against `undefined` and silently never matches.

## Quick start

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

Schema accepts any `@standard-schema/spec` validator (Zod, Valibot, ArkType).

## Runtime API

⚠️ **Runtime only.** `publish()`, `subscribe()`, and `getChannel()` exist only in
the runtime build. Under `--conditions=cdk` a `Realtime` resolves to the CDK
construct, whose stubs throw an actionable synth-guard error — so never call them
at module top level (which runs during synth); call them inside a handler.

| Method | Returns | Description |
|---|---|---|
| `rt.publish(namespace, channel, data)` | `Promise<void>` | Validate against the namespace schema, then broadcast to all subscribers. |
| `rt.getChannel(namespace, channel)` | `Promise<RealtimeChannel<T>>` | A channel handle (async — `await` it). Return it from an API for client hydration. |
| `rt.subscribe(namespace, channel, handler)` | `() => void` | Server-side subscribe. Returns an unsubscribe function. |

## Channel handles and subscriptions

`getChannel()` resolves to a `RealtimeChannel<T>`:

| Member | Returns | Description |
|---|---|---|
| `subscribe(handler)` | `RealtimeSubscription` | Listen for messages (simple form). |
| `subscribe({ onMessage, onDisconnect? })` | `RealtimeSubscription` | With disconnect handling. |
| `toJSON()` | descriptor | Serializes for the wire (called by `JSON.stringify`). |

Channel handles have **no** `publish()` — publishing always goes through
`rt.publish()` server-side.

`RealtimeSubscription`: `unsubscribe()`, `established: Promise<void>` (resolves
when the server confirms the subscription — always `await` it), and
`connection?: WebSocket` (client-side; multiple channels share one connection).

## Usage patterns

### Server publish via API

```typescript
export const api = new ApiNamespace(scope, 'api', (context) => ({
  async sendMessage(roomId: string, text: string) {
    const user = await auth.requireAuth(context);
    await rt.publish('chat', roomId, { sender: user.userId, text });
    return { sent: true };
  },
}));
```

### Returning channel handles (authorization gate)

Authorize in your API; only hand back a channel handle if allowed:

```typescript
export const api = new ApiNamespace(scope, 'api', (context) => ({
  async joinRoom(roomId: string) {
    const user = await auth.requireAuth(context);
    if (!canAccessRoom(user, roomId)) throw new Error('Forbidden');
    return rt.getChannel('chat', roomId);
  },
}));
```

Client:

```typescript
const channel = await api.joinRoom('room-1');
const sub = channel.subscribe((msg) => console.log(msg.sender, msg.text)); // typed
await sub.established;
```

### Server-side subscribe

```typescript
const ch = await rt.getChannel('chat', roomId);
const sub = ch.subscribe((msg) => console.log(`[${roomId}] ${msg.sender}: ${msg.text}`));
await sub.established;
```

On AWS this uses a real WebSocket, so it receives messages from any Lambda
invocation; locally it is an in-process EventEmitter.

### Large fan-out

Offload wide publishes to AsyncJob so the API response isn't blocked:

```typescript
const broadcast = new AsyncJob(scope, 'broadcast', {
  schema: z.object({ namespace: z.string(), channel: z.string(), data: z.any() }),
  handler: async ({ namespace, channel, data }) => rt.publish(namespace, channel, data),
});
await broadcast.submit({ namespace: 'updates', channel: 'global', data: payload });
```

## Handling auth failures and disconnects

A failed subscribe rejects `established` but does **not** kill other
subscriptions on the same connection:

```typescript
try {
  await sub.established;
} catch (err) {
  if (err.name === 'ConnectionFailedException') { /* token rejected — re-fetch channel */ }
}
```

API Gateway caps a WebSocket connection at 2 hours. Handle disconnects:

```typescript
const sub = channel.subscribe({
  onMessage: (msg) => { /* ... */ },
  onDisconnect: (reason) => {          // 'client' | 'timeout' | 'error' | 'unknown'
    if (reason === 'client') return;   // we called unsubscribe()
    // re-fetch channel (fresh tokens), re-subscribe, backfill from your store
  },
});
```

## Limits — channel path and message size

There is **no** namespace character-count limit. Two byte-budget limits are
enforced, both raising `ValidationFailed`:

- **Full channel path ≤ 1024 UTF-8 bytes.** The path is
  `{fullId}/{namespace}/{channel}`, where `fullId` is the scope-chain prefix.
  This is the DynamoDB sort-key limit (the connections table keys on the channel).
  Checked by `validateChannelPath` on `publish`, `subscribe`, and `getChannel`.
- **Each published message ≤ 32768 bytes.** Checked by `validatePublishSize`
  against the full serialized envelope `{ type, channel, data }`, i.e. the
  channel path and JSON overhead count toward the 32 KB, not just `data`.

Keep scope IDs and namespace/channel names short: the `fullId` prefix, namespace,
and channel all spend from the same 1024-byte path budget, so deep scope chains
plus long dynamic channel keys (`room-...`, `user-...`) can push a legitimate
path over the limit.

## Error constants

```typescript
import { isBlocksError } from '@aws-blocks/core';
import { RealtimeErrors } from '@aws-blocks/bb-realtime';

try {
  await rt.publish('chat', 'room-1', { sender: 123 }); // wrong type
} catch (e) {
  if (isBlocksError(e, RealtimeErrors.ValidationFailed)) { /* schema or limit failure */ }
}
```

| Constant | `error.name` | Cause |
|---|---|---|
| `RealtimeErrors.ValidationFailed` | `ValidationFailedException` | Data failed the namespace schema, or exceeded the 1024-byte path / 32768-byte message limit |
| `RealtimeErrors.PublishFailed` | `PublishFailedException` | Fan-out failed (AWS only) |
| `RealtimeErrors.ConnectionFailed` | `ConnectionFailedException` | WebSocket connect or subscribe rejected (e.g. token rejected, empty signing secret) |
| `RealtimeErrors.UnsupportedCompute` | `UnsupportedComputeException` | the resolved compute is not Lambda (thrown at synth) |

There is also an **`InvalidNamespace`** error (`error.name === 'InvalidNamespace'`)
thrown by `publish` / `getChannel` / `subscribe` when the namespace is not one
declared in the `namespaces` map. It is **not** a member of the `RealtimeErrors`
constant object, so there is no `RealtimeErrors.InvalidNamespace` to pass to
`isBlocksError` — match it by the literal string `'InvalidNamespace'` (or, better,
never let it happen: the namespace keys are known at construction). Declaring only
the three constants above while throwing a fourth name is deliberate.

## Best practices

- **Await `established`** before publishing or relying on a subscription.
- **Subscribe before you publish** — there is no buffering; a subscriber only
  gets messages sent after it registers.
- **Publish through the API**, not channel handles — keeps auth in one place.
- **Use channels for dynamic scoping** (`room-123`, `user-456`), and keep IDs
  short to protect the 1024-byte path budget.
- **Keep payloads well under 32 KB** — the envelope counts toward the limit.
- **One Realtime instance per domain**, with multiple namespaces for message types.
- **Unsubscribe on unmount** — leaked subscriptions hold the WebSocket open.

## Local development

A local WebSocket server on the dev server port; no external services. Messages
are delivered via an in-process EventEmitter between handlers and subscribers.

## What it provisions

The first Realtime instance in a stack creates shared infrastructure; later ones
reuse it.

- API Gateway WebSocket API (`$connect` / `$disconnect` / `$default` routes)
- A DynamoDB connections table (via DistributedTable): partition `connectionId`,
  sort `channel`, GSI `channel-index`, TTL on `expiresAt`
- WebSocket routes handled by the shared Blocks handler Lambda (no separate Lambdas)
- An AppSetting (secret) for the connection-auth token signing secret
- `grantManageConnections` on the handler for API Gateway Management API fan-out
