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

> **Working directory:** every fence in this module starts from `workshop-flutter/app/`.
> Each one is written from that directory independently, so return to `app/` between
> fences — several of them begin with `cd backend`, and running two of those in a row
> without going back up looks for a `backend/backend/`.

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

You are declaring three named channels the client can subscribe to — `state`, `chat`, and
`thinking` — each with its own payload schema. Note `chat` reuses the exact `chatSchema`
you built in module 05, so a message you *publish* over the wire is validated against the
same shape as a message you *stored* in the table; the two can't drift apart.

Keep the key distinction from the Concept section in mind here: a channel broadcasts a
*signal, not the truth*. The `state` namespace carries only `{ gameId, version }`, not the
game itself — the client takes that as a nudge to refetch `getState` over RPC and stays
server-authoritative. You are wiring notification, not replication.

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

`fakeChannel()` was the only thing using the borrowed channel type, so remove that
type-only import as well — it has been carried since module 02 purely to keep the
generated Dart client stable while realtime was faked, and the real block now supplies
the type:

```ts
// delete this line — nothing references RealtimeChannel any more
import type { RealtimeChannel } from "@aws-blocks/blocks";
```

### 4. **Point `publish` calls at the block.** 
Every `publish("...", key, payload)` becomes: 

   `await rt.publish("...", key, payload)` — in `saveAndBroadcast`, `transcribe`,
   `postBotChat`, and `sendChat`. They're already inside `async` functions.

### 5. **Return real channels** from the three getters:

   ```ts
   async getStateChannel(gameId: string)    { await auth.requireAuth(context); return rt.getChannel("state", gameId); },
   async getChatChannel(gameId: string)     { await auth.requireAuth(context); return rt.getChannel("chat", gameId); },
   async getThinkingChannel(gameId: string) { await auth.requireAuth(context); return rt.getChannel("thinking", gameId); },
   ```

> **Keep the `: string` on all three.** These annotations are load-bearing, and nothing
> warns you if you drop them. `tsc` accepts either form, but the spec generator reads the
> parameter type: annotated, it emits `"schema": { "type": "string" }` and you get
> `getStateChannel({required String gameId})` in Dart. Unannotated, it emits an empty
> `"schema": {}` and you get `{required dynamic gameId}` instead — and `flutter analyze`
> still passes, because `dynamic` is assignable to everything. The only symptom is that
> the typed client this workshop is about quietly stops being typed.
   
### 6. **Regenerate the Dart client bindings:**

Regenerating gives you channel methods that return a raw `RealtimeChannel<dynamic>` — a
handle to the socket, with no idea what your app wants to do with each event. Turning that
into something the UI can actually consume is the repository's job, and unlike the schemas
this part is hand-written: the generator knows a channel *exists*, but not that a `chat`
frame should become a `ChatMessage` or that a `state` frame is a signal to throw away and
refetch. That decoding lives in `game_repository.dart` — `stateEvents`, `chatEvents`, and
`thinkingEvents` (around L146–176), each wrapping a channel into a typed Dart `Stream`
(shown just below).

   ```bash
   cd backend   # Make sure you are at backend folder
   npm run typecheck
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

### Prove it's actually *live* — not the fallback

This is the one verification that matters in this module, because the polling fallback is
designed to hide exactly the failure you're testing for. A broken subscription still shows
chat arriving — just up to three seconds later. "It appeared" proves nothing.

Two ways to tell them apart, easiest first:

1. **Watch the socket.** In Chrome devtools open **Network → WS**. You should see one
   WebSocket connection to `/realtime` in the list, and clicking it → **Messages** should
   show frames arriving the instant the other client acts. No WS entry, or an entry with no
   frames, means you are on the fallback and the channel wiring is wrong.
2. **Time it.** Send a chat message from client A and watch client B. Live push lands in
   well under a second; the fallback lands on the next 3-second poll tick. If every update
   feels like it arrives "on a beat", that beat is the timer, not your channel.

To see the failure deliberately (worth doing once — it's what your users will hit on a bad
network): stop the backend mid-game, act in one client, and watch the board go stale; restart
it and the poll catches up. That is the degradation path the Flutter app is written to
survive.

**Flutter UI steps:**

- Two clients, same game → chat in one appears in the other without refresh.
- AI companion turns appear live during an AI-filled game.
- Kill WebSocket → three-second polling keeps the board updating (delayed but functional).

Catch up (from `backend/`): `cp ../../06-realtime/solution/index.ts aws-blocks/index.ts`

---

### The Flutter side

Step 6 showed the repository turning raw channels into typed `stateEvents` / `chatEvents`
/ `thinkingEvents` streams. That's the *producer* half. Now look at what **consumes**
them — `app/lib/ui/features/game/game_view_model.dart`.

`_subscribe()` (around L162) is called once from `start()` (around L27–43). It listens to
all three streams and wires each to a UI effect:

- `stateEvents` → `stream.listen((_) => unawaited(refresh()))`. The state channel carries
  only a signal (remember: `{ gameId, version }`), so the handler ignores the payload and
  calls `refresh()`, which refetches `getState` and runs it through the version gate from
  module 05. Broadcast a signal, re-read the truth.
- `chatEvents` → appends each incoming `ChatMessage`, with a dedupe check so a message you
  sent optimistically (negative timestamp) isn't shown twice when it echoes back.
- `thinkingEvents` → accumulates `start`/`delta`/`end` reasoning tokens into
  `thinking` (this is what lights up in modules 07–08).

Every one of those `listen` calls is wrapped so a subscription failure is swallowed rather
than crashing the screen — because there's a safety net right below it.

That net is the **3-second poll timer**, started in `start()` (around L35):

```dart
_pollTimer = Timer.periodic(const Duration(seconds: 3), (_) {
  unawaited(refresh());
  unawaited(_loadChat());
});
```

It runs *unconditionally*, alongside the live subscriptions. When the WebSocket is
healthy, live pushes update the board instantly and the poll is redundant (the version
gate drops the stale re-reads). When the socket drops, the poll is the only thing keeping
the board fresh — the game degrades from "instant" to "up to 3 seconds behind" instead of
freezing. This is the consumer-side twin of the fallback the Concept section described.

**Exercise — prove the poll stands alone (~4 min):**

1. In `_subscribe()`, comment out the body of the `stateEvents` block (the
   `_subscriptions.add(stream.listen(...))` line for state) so no live state pushes
   arrive.
2. Run the app (`flutter run -d chrome`), take a turn in a second client, and watch the
   board still update — just on the 3-second beat instead of instantly. That beat is the
   poll timer doing the work alone.
3. Restore the line, then run the test suite:

   ```bash
   # from workshop-flutter/app/
   flutter test
   ```

   Watch `app/test/game_view_model_test.dart` stay green. That test builds a
   `_ChatFallbackRepository` that **subclasses `GameRepository`** and overrides `getChat`
   to `throw Exception('History transport unavailable')`, while `stateEvents` /
   `chatEvents` / `thinkingEvents` return empty streams. It then asserts that after
   `start()`, the view model still shows one message — the DM line — because when the chat
   transport fails, `_loadChat()` falls back to `_messagesFromLog(state)`. This is the
   module where `app/test/` finally means something: it pins the exact
   degradation-survives-failure behavior you just exercised by hand.

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
