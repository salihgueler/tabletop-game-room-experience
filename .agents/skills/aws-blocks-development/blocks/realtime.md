# Realtime

Typed pub/sub with namespace-based API.

**Schema validation:** Accepts any `@standard-schema/spec` compatible validator (Zod, Valibot, ArkType). Examples below use Zod.

```typescript
import { z } from "zod";

const cursorSchema = z.object({
  userId: z.string(),
  x: z.number(),
  y: z.number(),
});
const chatSchema = z.object({ userId: z.string(), message: z.string() });

const realtime = new Realtime(scope, "collab", {
  namespaces: {
    cursors: Realtime.namespace(cursorSchema),
    chat: Realtime.namespace(chatSchema),
  },
});

// Server: publish to a channel
await realtime.publish("cursors", "room-1", { userId: "u1", x: 100, y: 200 });

// Server: return channel handle for frontend subscription
return realtime.getChannel("cursors", "room-1");
```

**Frontend subscription (via API method that returns a channel):**

```typescript
const channel = await api.getCursorChannel("room-1");
// channel is a RealtimeChannel — subscribe returns RealtimeSubscription
const subscription = channel.subscribe((data) => {
  console.log(data.userId, data.x, data.y);
});
// Later: subscription.unsubscribe();
```

`subscribe()` returns a `RealtimeSubscription` with `unsubscribe()` method and `established` promise. Do NOT cast to a plain function.

Local mock: Local WebSocket server on same port. AWS: AppSync EventAPI.
