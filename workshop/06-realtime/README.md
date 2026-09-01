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
the same port; deployed it's an API Gateway WebSocket API. Same code.

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

> **Short namespace names matter.** The full channel path is composed from your stack,
> Scope id, Realtime id, and namespace name — long names make logs and URLs unwieldy.
> That's why the scope is `"tt"` and the namespaces are `state` / `chat` / `thinking`,
> not verbose descriptions.

### The three namespaces, and why `state` is just a version bump

- **`chat`** — the full payload of each message (mirrors the chat table).
- **`thinking`** — streamed AI reasoning tokens (`start`/`delta`/`end`). Barely used until
  modules 07–08, but wired now.
- **`state`** — deliberately carries only `{ gameId, version }`. The client doesn't trust
  a pushed state blindly; the bump just tells it to **refetch `getState`**, keeping the
  server authoritative. This is the key pattern: _broadcast a signal, not the truth._

### Why the frontend needs no changes

`GameRoom.jsx` already subscribes to all three channels and wraps each in `try/catch`, so a
channel that isn't there yet can't crash the app — that's why the mock worked. Flipping the
stubs to a real block simply turns those subscriptions live — the "refresh to see the bot's
turn" friction disappears.

> **The fallback is narrower than it looks, and that matters for testing.** The 3-second
> `setInterval` in `GameRoom.jsx` is gated on `state?.roomPhase !== 'lobby'` — it polls
> **only while you're in the lobby**, so newly-joined seats appear without a refresh. Once
> the game is `live` there is no periodic poll at all: a client updates from the state
> channel, or from its own refetch after its own move. So if your subscription is broken
> during a live game, a second tab that is only *watching* will never update. That is
> inconvenient in production and useful to you right now — it makes the verification below
> a real pass/fail instead of a guess.

## Steps

1. **Import `Realtime`** Building Block:

```ts
import {
  ApiNamespace,
  Scope,
  AuthBasic,
  DistributedTable,
  Realtime,
} from "@aws-blocks/blocks";
```

1.  Construct the data inside the building blocks and use the `chatSchema`.

```ts
const rt = new Realtime(scope, "rt", {
  namespaces: {
    // A version bump — the client refetches getState (server stays authoritative;
    // we don't trust the pushed payload blindly).
    state: Realtime.namespace(
      z.object({ gameId: z.string(), version: z.number() }),
    ),
    // Every DM line, action, roll, and player message (same shape as the table).
    chat: Realtime.namespace(chatSchema),
    // Streamed AI reasoning tokens with start/delta/end phases (modules 07–08).
    thinking: Realtime.namespace(
      z.object({
        gameId: z.string(),
        who: z.string(),
        color: z.string(),
        phase: z.enum(["start", "delta", "end"]),
        text: z.string(),
      }),
    ),
  },
});
```

2. **Point `publish` calls at the block.** Every `publish("...", key, payload)` becomes
   `await rt.publish("...", key, payload)` (in `saveAndBroadcast`, `transcribe`,
   `postBotChat`, `sendChat`). They're already inside `async` functions.

3. **Return real channels** from the three getters:

   ```ts
   async getStateChannel(gameId)    { await auth.requireAuth(context); return rt.getChannel("state", gameId); },
   async getChatChannel(gameId)     { await auth.requireAuth(context); return rt.getChannel("chat", gameId); },
   async getThinkingChannel(gameId) { await auth.requireAuth(context); return rt.getChannel("thinking", gameId); },
   ```

4. **Delete the realtime mock** — both `fakeChannel()` implementation and the empty `publish()` function.

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

   **Prove it's the socket, not a coincidence.** "It appeared" is weak evidence — you moved,
   so your own tab refetched anyway. Use one of these instead:

   - **Watch the socket.** DevTools → **Network → WS**. You should see one connection to
     `/realtime` with status **101**, and clicking it → **Messages** should show frames
     arriving the moment the other tab acts. No connection, or a connection with no frames,
     means your channels aren't wired.
   - **Watch someone else's turn.** In an AI-filled game, sit in a second tab and take **no
     action at all**, then let a companion move. With the subscription working the board
     updates within about a second. With it broken it never updates, because live games
     don't poll (see the note above). This is the unambiguous test: nothing to misread.

   The live channels are WebSocket (not something `curl` subscribes to), but you can confirm
   the transcript being broadcast is persisted with an HTTP call. Sign in (saving the
   cookie):

   ```bash
   # 1) sign in, saving the session cookie
   curl -s -c cookies.txt -X POST http://localhost:3001/aws-blocks/api \
     -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","method":"authApi.setAuthState","params":[{"action":"signIn","username":"aldric","password":"password123"}],"id":1}'
   ```

then read a game's chat with `getChatHistory` and find the game id in your data:

```bash
 # 2) read the chat transcript for a gameId (from api.listGames)
 curl -s -b cookies.txt -X POST http://localhost:3001/aws-blocks/api \
   -H 'Content-Type: application/json' \
   -d '{"jsonrpc":"2.0","method":"api.getChatHistory","params":["REPLACE_WITH_GAME_ID"],"id":1}'
```

On Windows (cmd.exe), one line each with escaped quotes:

```cmd
curl -s -c cookies.txt -X POST http://localhost:3001/aws-blocks/api -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"method\":\"authApi.setAuthState\",\"params\":[{\"action\":\"signIn\",\"username\":\"aldric\",\"password\":\"password123\"}],\"id\":1}"

curl -s -b cookies.txt -X POST http://localhost:3001/aws-blocks/api -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"method\":\"api.getChatHistory\",\"params\":[\"REPLACE_WITH_GAME_ID\"],\"id\":1}"
```

> Swap `REPLACE_WITH_GAME_ID` for a real `gameId` and use your own credentials. In
> PowerShell use `curl.exe`.

Catch up from `workshop/app/`: `cp ../06-realtime/solution/index.ts aws-blocks/index.ts`

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
- Keep Scope ids and namespace names short (readable channel paths, logs, and URLs).

## Troubleshooting

- **Nothing arrives live, but works after refresh** — the subscription failed, so you're
  seeing only your own post-action refetches (and, in the lobby, the 3-second poll). Check
  the browser console for a WS error and confirm you're on `:3000` (the Vite proxy forwards
  `/realtime`); a direct `:3001` page load has no proxy and no socket.
- **Channel names unwieldy in logs / connection errors on long names** — the full channel
  path includes stack + Scope + Realtime id + namespace. Keep them short
  (`state`/`chat`/`thinking` are safe).

---

**Next:** Module 07 — AI Dungeon Master — replace the canned narration with a real `Agent`
that narrates outcomes and generates contextual actions, streaming its reasoning to the
`thinking` channel you just wired up.
