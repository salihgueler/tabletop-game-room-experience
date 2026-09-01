# Module 05 — Game state & chat (Maps → `DistributedTable`)

**Goal:** move the authoritative game state and the chat transcript into real tables,
completing persistence — and take a proper look at the server-authoritative turn engine
that Flutter renders but never drives.

**Block introduced:** `DistributedTable` (two more tables; one with a sort key)

**You edit:** `app/backend/aws-blocks/index.ts`

**You'll know you're done when:** you start a game, take a turn, restart the dev server,
and the game is still live with its full chat transcript intact.

---

## Concept

Two more tables, each showing a different access pattern:

- **`gameStates`** — one item per game, keyed by `gameId`. Whole-object read/write, just
  like `characters`. The catch: the item is large and nested (players, log, rolls), so
  the schema is built from **embedded sub-schemas** (`playerSchema`, `rollSchema`,
  `logEntrySchema`).
- **`chatMessages`** — an append-only log keyed by `(gameId, ts)`. A **sort key** (`ts`)
  means one `query({ where: { gameId: { equals } } })` returns a game's whole transcript
  already ordered — no in-memory sort, no separate index.

Here are some explanations to the changes:


### Schema-first types with `z.infer`

Once state lives in a validated table, the Zod schema becomes the single source of truth
for the _type_ too. The solution replaces the hand-written `Player` / `Roll` /
`LogEntry` / `GameState` / `ChatMsg` types with `z.infer<typeof ...Schema>` so runtime
validation and compile-time types can't drift apart.

### Why `saveAndBroadcast` returns a _new_ object

With a real table you `put` the state and hand the **saved** object back to the client.
`publish()` is still the mock no-op — module 06 makes it a real Realtime push. Everything
else in the turn engine is unchanged; it was already authoritative.

### Server-authoritative engine — Flutter is a pure renderer

The turn logic never trusted the client. Skim `resolveAction` → `advanceTurn` and notice
the server owns the d20 roll, the DC check, narration, and turn order end to end. The
Flutter app's role is narrow:

- Render `GetStateResult` (board phase, players, log, options, dice).
- Send commands (`takeAction`, `advanceBotTurn`) — never rolls dice or advances turns
  locally.

This means swapping storage under the engine changes nothing about correctness — and the
Flutter UI code doesn't change at all in this module.


## Steps

> **Working directory:** every fence in this module starts from `workshop-flutter/app/`.
> The `cd` lines are written so you can paste them in order from there.

### 1. **Embed sub-schemas** for players, rolls, and log entries

You are describing the *inside* of a game: who is at the table, the last dice roll, one line
of the log. You have already met all three on the Dart side — `Player`, `DiceRoll` and
`LogEntry` in `lib/domain/models.dart` are hand-written mirrors of exactly these shapes.

Declaring them separately, before the table schema that embeds them, is the same move as
defining small Dart classes before the one that holds a `List<Player>`. The difference is
that this single declaration does three jobs: it validates every write at runtime, it gives
TypeScript the type, and it is what the generator reads to emit your Dart types.

Note `rollSchema` is `.nullable()` — no dice have been rolled when a game begins. That is
exactly why `GameState.lastRoll` is a `DiceRoll?` and not a `DiceRoll` in Dart.

   ```ts
   const playerSchema = z.object({
     id: z.string(),
     name: z.string(),
     classKey: z.string(),
     sprite: z.string(),
     color: z.string(),
     seat: z.enum(["human", "ai", "open"]),
     isHuman: z.boolean(),
     userId: z.string().nullable(),
     hp: z.number(),
     slot: z.number(),
   });
   const rollSchema = z
     .object({
       value: z.number(),
       sprite: z.number(),
       color: z.string(),
       dc: z.number(),
       success: z.boolean(),
       actor: z.string(),
       action: z.string(),
     })
     .nullable();
   const logEntrySchema = z.object({
     kind: z.enum(["dm", "action", "roll", "system"]),
     who: z.string(),
     color: z.string().optional(),
     text: z.string(),
   });
   ```

### 2. **Table schemas and constructions**

Now the rows that actually get stored. `gameStates` embeds the sub-schemas from step 1 via
`z.array(playerSchema)`, so a single row holds the entire table state instead of spreading
players across a table of their own. That is deliberate: a turn reads and writes the whole
state at once, so keeping it in one row makes the read atomic and cheap.

`chatMessages` is keyed by `(gameId, ts)` — a partition key plus a sort key — so messages
for one game come back already ordered by time. That ordering is load-bearing on the client:
`getChat()` in the repository maps the response straight through, and nothing in the Flutter
chat panel sorts it. The order you see on screen is the order the database returned.

Update `gameStates` keyed by `gameId`; `chatMessages` keyed by `(gameId, ts)`:

   ```ts
   const gameStateSchema = z.object({
     gameId: z.string(),
     scenario: z.string(),
     dmName: z.string(),
     players: z.array(playerSchema),
     roomPhase: z.enum(["lobby", "live", "ended"]),
     endsAt: z.number().nullable(),
     turnIndex: z.number(),
     round: z.number(),
     phase: z.enum(["player", "resolving", "dm"]),
     dc: z.number(),
     lastRoll: rollSchema,
     log: z.array(logEntrySchema),
     inventory: z.array(z.string()),
     options: z.array(z.string()),
     version: z.number(),
   });
   const gameStates = new DistributedTable(scope, "gameStates", {
     schema: gameStateSchema,
     key: { partitionKey: "gameId" },
   });

   const chatSchema = z.object({
     gameId: z.string(),
     ts: z.number(),
     who: z.string(),
     color: z.string(),
     text: z.string(),
     kind: z.enum(["say", "dm", "action", "roll", "system"]).default("say"),
   });
   const chatMessages = new DistributedTable(scope, "chat", {
     schema: chatSchema,
     key: { partitionKey: "gameId", sortKey: "ts" }, // sort key = chronological order
   });
   ```

### 3. Delete `gameStateStore`, `chatStore` maps and add inferred types.

   Add the inferred types by replacing the current types:

   ```ts
   type Player = z.infer<typeof playerSchema>;
   type Roll = z.infer<typeof rollSchema>;
   type LogEntry = z.infer<typeof logEntrySchema>;
   type ChatMsg = z.infer<typeof chatSchema>;
   type GameState = z.infer<typeof gameStateSchema>;
   ```

### 4. **Call-site swap** (all async now):

   | before (Map)                                                      | after (table)                                                                              |
   | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
   | `gameStateStore.get(gameId)`                                      | `await gameStates.get({ gameId })`                                                         |
   | `const st = gameStateStore.get(g.gameId);`                        | `const st = await gameStates.get({ gameId: g.gameId });`                                   |
   | `gameStateStore.set(gameId, state)`                                   | `await gameStates.put(state)`                                                              |
   | `gameStateStore.set(state.gameId, {<items>})`                               | `await gameStates.put({<items>})`                                                          |
   | `[...(chatStore.get(gameId) ?? [])].sort((a, b) => a.ts - b.ts);` | `await Array.fromAsync( chatMessages.query({ where: { gameId: { equals: gameId } } }), );` |
   | `chatStore.get(gameId)` - delete all three bucket lines: the `const bucket = chatStore.get(gameId) ?? []`, the `bucket.push(msg)`, and the `chatStore.set(...)`. One `put` replaces the whole read-modify-write | `await chatMessages.put(msg)`                                                              |

> The `Array.fromAsync(...)` in the chat row drains `query`'s async iterator into a list —
> the same move as calling `.toList()` on a Dart `Stream`.

### 5. Update the **`saveAndBroadcast`** to bump the version and return the new object:

You are giving every saved state a monotonically increasing `version`, and that single
`+ 1` is what makes the client's staleness check work. In `game_view_model.dart`,
`refresh()` only adopts a fetched state when `fresh.version >= state!.version` — a response
that raced in carrying an older version is silently dropped rather than clobbering newer
truth. Bump it here and the Dart gate you'll read at the end of this module has something to
compare against.

   ```ts
   async function saveAndBroadcast(state: GameState) {
     const next = { ...state, version: state.version + 1 };
     await gameStates.put(next);
     publish("state", next.gameId, { gameId: next.gameId, version: next.version });
     return next;
   }
   ```

#### If something is not working make sure you copy the solution
   ```bash
   cd backend
   cp ../../05-state/solution/index.ts aws-blocks/index.ts
   npm run typecheck
   ```

### 6. **Regenerate the Dart client bindings:**

   ```bash
   cd backend   # the blocks-generate-spec binary lives here
   npx blocks-generate-spec aws-blocks/index.ts ../lib/blocks.spec.json
   cd ..
   dart run build_runner build --delete-conflicting-outputs
   flutter analyze
   ```

   The generated `blocks.blocks.dart` now carries the `GetStateResult` type with every
   field from `gameStateSchema` — players, phase, log, lastRoll, options, version.

### 7. **Run the app and play a game:**

   ```bash
   # Terminal 1
   cd backend # Make sure you are at backend folder
   npm run dev
   
   # Terminal 2
   cd app # Make sure you are at app folder
   flutter run -d chrome
   ```

   Sign in, create an AI-filled game, take an action. Observe the board update with
   dice, narration, and turn advance.

### 8. **Restart the backend and reopen the game:**

   Kill the dev server (`Ctrl-C`) and restart (`npm run dev`). Reopen the same game in
   Flutter — it's still live, mid-round, with the full chat log. That's persistence.

### 9. **Inspect the data on disk:**

You are looking at the tables you just declared, now materialised as real JSON files. Where
the old code held game state in an in-memory `Map` that vanished on restart, `DistributedTable`
writes each row to disk — seeing `tt-gameStates` and `tt-chat` appear is the concrete proof
that persistence is doing its job, and it's the same data your dev-server restart in step 8
just read back.

   ```bash
   ls backend/.bb-data/    # tt-gameStates and tt-chat now exist alongside tt-games
   ```

## Verify

Read the authoritative state through the API. `getState` takes a `gameId` (positional
param) and needs a session:

```bash
# 1) sign in, saving the session cookie
curl -s -c cookies.txt -X POST http://localhost:3001/aws-blocks/api \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"authApi.setAuthState","params":[{"action":"signIn","username":"aldric","password":"password123"}],"id":1}'

# 2) find a gameId (from api.listGames), then fetch its state
curl -s -b cookies.txt -X POST http://localhost:3001/aws-blocks/api \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"api.getState","params":["REPLACE_WITH_GAME_ID"],"id":1}'
```

> Swap `REPLACE_WITH_GAME_ID` for a real `gameId` from `api.listGames`, and use your own
> credentials.

**Flutter UI steps:**

- Sign in → create an AI game → take a turn → verify dice animation and log update.
- Kill the backend → restart → reopen the game → board state and chat transcript are
  intact.
- Open a second account, join the same multiplayer game → both clients see consistent
  state after manual refresh.

---

### The Flutter side

The Concept section made a claim — *"Flutter is a pure renderer, the server owns the
dice."* Here's where that stops being a slogan and becomes a line of code you can point
at.

Open `app/lib/ui/features/game/game_view_model.dart` and read `refresh()` (around
L45–54). It fetches the authoritative state and then applies it through a **version
gate**:

```dart
final fresh = await _repository.getState(gameId);
if (state == null || fresh.version >= state!.version) state = fresh;
```

That `version` field is the one you just added to `gameStateSchema` and bumped in
`saveAndBroadcast`. The client keeps whichever state it holds unless the server's version
is **at least as new** — a stale response that raced in behind a newer one is silently
dropped. The client never invents state, never decrements a version, never rolls a die;
it only ever *adopts* a fresher server truth. This is the code-level meaning of
"server-authoritative": the backend owns `version`, and Flutter's job is to notice it
went up and re-render.

The rendering itself leans on three computed getters on `GameState` in
`app/lib/domain/models.dart` (around L246–250) — no field on the wire, pure functions of
the state the server sent:

- `current` — the player whose turn it is, `players[turnIndex]` (bounds-checked). Drives
  "whose turn" in the UI. `turnIndex` is server-owned; Flutter just indexes into it.
- `me` — the player matching `viewerUserId`, or `null` if you're a spectator. Note the
  view model derives *my turn* from these two together (`isMyTurn`, around L138–144:
  `current?.userId == viewerUserId`) — the client asks "is the server's current player
  me?", it does not decide the turn.
- `isHost` — `players.first.userId == viewerUserId`. Only the host's client drives AI
  turns (`_driveBotIfNeeded`), so this getter gates who nudges the bot forward — again, a
  read off server state, not a client-side election.

**The payoff:** because these are all *derived from* `GetStateResult`, swapping the
backend's storage from a `Map` to a `DistributedTable` this module changed nothing in the
Flutter code — the renderer can't tell where the state came from, only what version it's
at. That's exactly why "works locally against a `Map`" and "works deployed against a real
table" are the same behavior.

---

## Checklist

- [ ] `npm run typecheck` passes.
- [ ] `flutter analyze` reports no issues.
- [ ] `backend/.bb-data/tt-gameStates/` and `backend/.bb-data/tt-chat/` exist
      after playing.
- [ ] A game (and its chat) survives a dev-server restart.

## What you learned

- A **sort key** turns a table into an ordered log — query by partition key and get rows
  back in sort order, no manual sorting.
- Large nested items are modeled with **embedded Zod sub-schemas**; `z.infer` keeps types
  and validation in lockstep.
- The turn engine was authoritative all along — real storage slotted in with no logic
  change, which is exactly why "works locally" is trustworthy.
- Flutter only renders `GetStateResult` and sends commands (`takeAction`) — it never
  rolls dice or advances turns locally. The server is the single authority.

## Troubleshooting

- **`ZodError` on `put`** — your object doesn't match the schema (e.g. a missing field, or
  `kind` outside the enum). The error names the offending path.
- **Chat out of order** — you're sorting client-side instead of relying on the `ts` sort
  key; use the `query` shown above.
- **Old game won't load after schema edits** — `rm -rf backend/.bb-data` to clear
  items written under the previous shape.
- **`flutter analyze` errors after regen** — if the generated bindings added new required
  fields, the UI may need minor updates to pass them through. Check `game_repository.dart`
  for any red underlines.
- **`build_runner` conflicts** — always use `--delete-conflicting-outputs`.

---

**Next:** [Module 06 — Realtime](../06-realtime/README.md) — replace `fakeChannel`/`publish`
with the `Realtime` block so every player sees turns, chat, and AI "thinking" live over
WebSocket.
