# Module 06 — Realtime (`fakeChannel`/`publish` → `Realtime`)

**Goal:** make the game live. Replace the no-op channel stubs with a real `Realtime`
block so turns, chat, and (soon) AI reasoning broadcast to every player over WebSocket.

**Block introduced:** `Realtime`
**You edit:** `app/backend/aws-blocks/index.ts`
**You'll know you're done when:** open the same game in two Flutter clients — a chat
message or a turn taken in one appears in the other **without a manual refresh**.

---

## Concept

`Realtime` is typed pub/sub organized into **namespaces**, each with its own Zod schema.
You `publish(namespace, key, payload)` on the server and hand the frontend a channel via
`getChannel(namespace, key)` to `subscribe()` to. The `key` is per-room — here, the
`gameId` — so each game is its own isolated channel. Locally it's a WebSocket server on
the same port; deployed it's an API Gateway WebSocket API. Same code.

> **Short namespace names matter.** The full channel path is composed from your stack,
> Scope id, Realtime id, and namespace name — long names make logs and URLs unwieldy.
> That's why the scope is `"tt"` and the namespaces are `state` / `chat` / `thinking`,
> not verbose descriptions.

### Why the Flutter UI needs no changes this module

The Flutter app already subscribes to all three channels via the repository and wraps each
in error handling with the polling fallback. Flipping the backend stubs to a real Realtime
block simply turns those subscriptions live — the "refresh to see the bot's turn" friction
disappears.


### The three namespaces, and why `state` is just a version bump

- **`state`** — deliberately carries only `{ gameId, version }`. The client doesn't trust
  a pushed state blindly; the bump just tells it to **refetch `getState`**, keeping the
  server authoritative. This is the key pattern: _broadcast a signal, not the truth._
- **`chat`** — the full payload of each message (mirrors the chat table row).
- **`thinking`** — streamed AI reasoning tokens (`start`/`delta`/`end` phases). Barely
  used until modules 07–08, but wired now.

## Steps

### 1. **Import `Realtime`** alongside the existing Building Blocks:

   ```ts
   import {
     ApiNamespace,
     Scope,
     AuthBasic,
     DistributedTable,
     Realtime,
   } from "@aws-blocks/blocks";
   ```

### 2. **Construct** the Realtime block after the tables, reusing `chatSchema`:

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

### 3. **Delete the realtime mock** 

Delete both `fakeChannel()` and the no-op `publish()` function.

### 4. **Point `publish` calls at the block.** 
Every `publish("...", key, payload)` becomes: 

   `await rt.publish("...", key, payload)` — in `saveAndBroadcast`, `transcribe`,
   `postBotChat`, and `sendChat`. They're already inside `async` functions.

### 5. **Return real channels** from the three getters:

   ```ts
   async getStateChannel(gameId)    { await auth.requireAuth(context); return rt.getChannel("state", gameId); },
   async getChatChannel(gameId)     { await auth.requireAuth(context); return rt.getChannel("chat", gameId); },
   async getThinkingChannel(gameId) { await auth.requireAuth(context); return rt.getChannel("thinking", gameId); },
   ```
   
### 6. **Regenerate the Dart client bindings:**

   ```bash
   cd backend   # Make sure you are at backend folder
   npx blocks-generate-spec aws-blocks/index.ts ../lib/blocks.spec.json
   cd ..
   dart run build_runner build --delete-conflicting-outputs
   flutter analyze
   ```

#### Dart side: `RealtimeChannel<dynamic>` → domain streams

The generated Dart bindings expose channel methods that return `RealtimeChannel<dynamic>`.
The repository (`game_repository.dart`) wraps these into typed domain streams:

```dart
Future<Stream<void>> stateEvents(String gameId) async {
  final channel = await _service.gameApi.getStateChannel(gameId: gameId);
  return (await _channelEvents(channel)).map((_) {}); // signal only — refetch
}

Future<Stream<ChatMessage>> chatEvents(String gameId) async {
  final channel = await _service.gameApi.getChatChannel(gameId: gameId);
  return (await _channelEvents(channel)).map((json) {
    return ChatMessage(
      timestamp: (json['ts'] as num).toInt(),
      who: json['who'] as String,
      text: json['text'] as String,
      kind: json['kind'] as String? ?? 'say',
    );
  });
}

Future<Stream<ThinkingEvent>> thinkingEvents(String gameId) async {
  final channel = await _service.gameApi.getThinkingChannel(gameId: gameId);
  return (await _channelEvents(channel)).map((json) {
    return ThinkingEvent(
      who: json['who'] as String,
      phase: json['phase'] as String,
      text: json['text'] as String,
    );
  });
}
```

The UI subscribes to these domain streams. When the WebSocket drops, a **three-second
polling fallback** kicks in — the game remains playable (state is refetched on a timer)
until the socket reconnects.

### 7. **Run the app with two clients:**

   ```bash
# Terminal 1
cd backend # Make sure you are at backend folder
npm run dev

# Terminal 2
cd app # Make sure you are at app folder
flutter run -d chrome
   ```

   Open **two instances** (two terminal windows running `flutter run`, or one desktop +
   one web via `flutter run -d chrome`). Register two accounts, have both join the same
   game (create one with "Wait for other players").

### 8. **Test live updates:**

   - Send a chat message in one client → it appears in the other instantly.
   - Take a turn → both boards update live (dice, narration, turn advance).
   - In an AI-filled game, companion turns now stream in on their own instead of needing
     a manual refresh.

### 9. **Test the polling fallback:**

   Stop WebSocket connectivity (kill the backend briefly or disconnect the network) and
   confirm the three-second state polling fallback keeps the game table usable — the
   board still updates, just with a short delay instead of instant pushes.

## Verify

The live channels are WebSocket (not something `curl` subscribes to), but you can confirm
the transcript being broadcast is persisted with an HTTP call:

```bash
# 1) sign in, saving the session cookie
curl -s -c cookies.txt -X POST http://localhost:3001/aws-blocks/api \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"authApi.setAuthState","params":[{"action":"signIn","username":"aldric","password":"password123"}],"id":1}'

# 2) read the chat transcript for a gameId (from api.listGames)
curl -s -b cookies.txt -X POST http://localhost:3001/aws-blocks/api \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"api.getChatHistory","params":["REPLACE_WITH_GAME_ID"],"id":1}'
```

> Swap `REPLACE_WITH_GAME_ID` for a real `gameId` and use your own credentials.

**Flutter UI steps:**

- Two clients, same game → chat in one appears in the other without refresh.
- AI companion turns appear live during an AI-filled game.
- Kill WebSocket → three-second polling keeps the board updating (delayed but functional).

Catch up from `app/backend/`:
`cp ../../06-realtime/solution/index.ts aws-blocks/index.ts`

---

## Checklist

- [ ] `npm run typecheck` passes.
- [ ] `flutter analyze` reports no issues.
- [ ] A chat message sent in one client appears in the other subscribed client with no
      refresh.
- [ ] AI companion turns appear live during an AI-filled game.
- [ ] The three-second polling fallback keeps the game usable when WebSocket drops.

## What you learned

- `Realtime` = typed, per-key pub/sub; `publish` on the server, `getChannel` +
  `subscribe` on the client.
- Broadcasting a **version bump** and refetching keeps the server authoritative — never
  trust a pushed payload as truth.
- Keep Scope ids and namespace names short (readable channel paths, logs, and URLs).
- The Dart repository wraps generated `RealtimeChannel<dynamic>` subscriptions into
  domain-typed `Stream`s — the UI never touches raw WebSocket frames.
- A three-second polling fallback ensures the game is never stuck when WS connectivity
  drops.

## Troubleshooting

- **Nothing arrives live, but works after refresh** — the subscription failed and the
  client fell back to polling. Check the debug console for a WebSocket error and confirm
  the backend is running on the expected port.
- **`RealtimeChannel<dynamic>` type errors after regen** — ensure you ran
  `dart run build_runner build --delete-conflicting-outputs` after the spec regeneration.
- **Channel names unwieldy in logs / connection errors** — the full channel path includes
  stack + Scope + Realtime id + namespace. The scope is `"tt"` and namespaces are
  `state`/`chat`/`thinking` — keep them short.
- **Polling fallback not engaging** — the fallback timer fires every 3 seconds when the
  stream errors or closes. If the board freezes entirely, check that `stateEvents` is
  subscribed and that `getState` works independently via curl.
- **Two desktop instances won't run simultaneously** — use one desktop + one web
  (`flutter run -d chrome`) or two separate Chrome profiles.

---

**Next:** [Module 07 — AI Dungeon Master](../07-ai-dm/README.md) — replace the canned
narration with a real `Agent` that narrates outcomes and generates contextual actions,
streaming its reasoning to the `thinking` channel you just wired up.
