# Module 06 — Realtime (`fakeChannel`/`publish` → `Realtime`)

**Goal:** make the game live. Replace the no-op channel stubs with a real `Realtime`
block so turns, chat, and (soon) AI reasoning broadcast to every player over WebSocket.

**Block introduced:** `Realtime`
**You edit:** `app/aws-blocks/index.ts`
**You'll know you're done when:** open the same game in two browser tabs — a chat message
or a turn taken in one appears in the other **without a manual refresh**.

---

## Concept

`Realtime` is typed pub/sub organized into **namespaces**, each with its own Zod schema.
You `publish(namespace, key, payload)` on the server and hand the frontend a channel via
`getChannel(namespace, key)` to `subscribe()` to. The `key` is per-room — here, the
`gameId` — so each game is its own isolated channel. Locally it's a WebSocket server on
the same port; deployed it's AppSync Events. Same code.

```ts
const rt = new Realtime(scope, "rt", {
  namespaces: {
    state: Realtime.namespace(
      z.object({ gameId: z.string(), version: z.number() }),
    ),
    chat: Realtime.namespace(chatSchema),
    thinking: Realtime.namespace(
      z.object({
        /* who, color, phase, text */
      }),
    ),
  },
});

await rt.publish("chat", gameId, msg); // server broadcasts
return rt.getChannel("chat", gameId); // frontend subscribes to this
```

> **Short namespace names matter.** AppSync caps channel namespace names at 50 chars, and
> the name is composed with your Scope id. That's why the scope is `"tt"` and the
> namespaces are `state` / `chat` / `thinking`, not verbose descriptions.

### The three namespaces, and why `state` is just a version bump

- **`chat`** — the full payload of each message (mirrors the chat table).
- **`thinking`** — streamed AI reasoning tokens (`start`/`delta`/`end`). Barely used until
  modules 07–08, but wired now.
- **`state`** — deliberately carries only `{ gameId, version }`. The client doesn't trust
  a pushed state blindly; the bump just tells it to **refetch `getState`**, keeping the
  server authoritative. This is the key pattern: _broadcast a signal, not the truth._

### Why the frontend needs no changes

`GameRoom.jsx` already subscribes to all three channels and wraps each in `try/catch` with
a polling fallback (that's why the mock worked). Flipping the stubs to a real block simply
turns those subscriptions live — the "refresh to see the bot's turn" friction disappears.

## Steps

1. **Import `Realtime`** and construct it after the tables. Reuse `chatSchema` for the
   `chat` namespace; define inline schemas for `state` and `thinking`. (See
   [`index.ts`](index.ts).)

2. **Delete the realtime mock** — both `fakeChannel()` and the no-op `publish()` function.

3. **Point `publish` calls at the block.** Every `publish("...", key, payload)` becomes
   `await rt.publish("...", key, payload)` (in `saveAndBroadcast`, `transcribe`,
   `postBotChat`, `sendChat`). They're already inside `async` functions.

4. **Return real channels** from the three getters:

   ```ts
   async getStateChannel(gameId)    { await auth.requireAuth(context); return rt.getChannel("state", gameId); }
   async getChatChannel(gameId)     { await auth.requireAuth(context); return rt.getChannel("chat", gameId); }
   async getThinkingChannel(gameId) { await auth.requireAuth(context); return rt.getChannel("thinking", gameId); }
   ```

5. **Verify:**

   ```bash
   npm run typecheck
   npm run dev
   ```

   Open http://localhost:3000 in **two tabs** (or two browsers). Register two accounts,
   have both join the same game (create one with "Wait for other players"). A message sent
   in one tab shows up in the other instantly; when a turn resolves, both boards update
   live. In an AI game, companion turns now stream in on their own instead of needing a
   refresh.

Catch up: `cp ../06-realtime/solution/index.ts app/aws-blocks/index.ts`

---

## Checklist

- [ ] `npm run typecheck` passes.
- [ ] A chat message sent in one tab appears in another subscribed tab with no refresh.
- [ ] AI companion turns appear live during an AI-filled game.

## What you learned

- `Realtime` = typed, per-key pub/sub; `publish` on the server, `getChannel` +
  `subscribe` on the client.
- Broadcasting a **version bump** and refetching keeps the server authoritative — never
  trust a pushed payload as truth.
- Keep Scope ids and namespace names short (AppSync's 50-char cap).

## Troubleshooting

- **Nothing arrives live, but works after refresh** — the subscription failed and the
  client fell back to polling. Check the browser console for a WS error and confirm you're
  on `:3000` (the Vite proxy forwards `/realtime`).
- **`Namespace name too long`** — a long Scope id + namespace exceeded 50 chars. Shorten
  the namespace (`state`/`chat`/`thinking` are safe).

---

**Next:** Module 07 — AI Dungeon Master — replace the canned narration with a real `Agent`
that narrates outcomes and generates contextual actions, streaming its reasoning to the
`thinking` channel you just wired up.
