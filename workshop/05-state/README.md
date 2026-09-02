# Module 05 — Game state & chat (`Maps` → `DistributedTable`)

**Goal:** move the authoritative game state and the chat transcript into real tables,
completing persistence — and take a proper look at the server-authoritative turn engine
that now writes to durable storage.

**Block introduced:** `DistributedTable` (two more tables; one with a sort key)
**You edit:** `app/aws-blocks/index.ts`
**You'll know you're done when:** you start a game, take a turn, restart the dev server,
and the game is still live with its full chat transcript intact.

---

## Concept

Two more tables, each showing a different access pattern:

- **`gameStates`** — one item per game, keyed by `gameId`. Whole-object read/write, just
  like `characters`. The catch: the item is large and nested (players, log, rolls), so
  the schema is built from **embedded sub-schemas** (`playerSchema`, `rollSchema`,
  `logEntrySchema`).
- **`chatMessages`** — an append-only log keyed by `(gameId, ts)`. A **sort key** (`ts`) —
  the field rows are ordered by within a partition — means one
  `query({ where: { gameId: { equals } } })` returns a game's whole transcript
  already ordered — no in-memory sort, no separate index.

```ts
const gameStates = new DistributedTable(scope, "gameStates", {
  schema: gameStateSchema,
  key: { partitionKey: "gameId" },
});

const chatMessages = new DistributedTable(scope, "chat", {
  schema: chatSchema,
  key: { partitionKey: "gameId", sortKey: "ts" }, // sort key = chronological order
});
```

### Schema-first types

Once state lives in a validated table, the Zod schema (Zod is a runtime schema/validation
library) becomes the single source of truth for the _type_ too. Replace the hand-written
`Player` / `Roll` / `LogEntry` / `GameState` / `ChatMsg` types with `z.infer<...>` — which
derives the static TypeScript type straight from a schema — so runtime validation and
compile-time types can't drift apart.

### Why `saveAndBroadcast` returns a _new_ object

With a real table you `put` the state and hand the **saved** object back to the client:

```ts
async function saveAndBroadcast(state) {
  const next = { ...state, version: state.version + 1 };
  await gameStates.put(next);
  publish("state", next.gameId, { gameId: next.gameId, version: next.version });
  return next; // callers return this to the frontend
}
```

`publish()` is still the mock no-op — module 06 makes it a real Realtime push. Everything
else in the turn engine is unchanged; it was already authoritative. That's the point:
**the turn logic never trusted the client, so swapping storage under it changes nothing
about correctness.** Skim `resolveAction` → `advanceTurn` and notice the server owns the
d20 roll, the DC check, narration, and turn order end to end.

## Steps

### 1. Add the embedded schemas

**Add the embedded schemas for players, rolls and log entries**

   These three schemas describe the pieces a game state is built out of — one player, one
   dice roll, one log line. They exist on their own so the big `gameStateSchema` in the next
   step can reference them (`z.array(playerSchema)`, `lastRoll: rollSchema`) instead of
   inlining everything. If you've split a large React prop type into smaller interfaces and
   composed them, this is the same move, except each schema also validates the data at
   runtime, not just at compile time. Note `rollSchema` is `.nullable()` — a turn may have no
   roll yet — which is exactly the `lastRoll` you'll read on the client to decide whether to
   animate the dice tray.

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

### 2. Add the gameStates and chatMessages tables

Add two tables (`gameStateSchema`, `chatSchema`), then create `gameStates` and `chatMessages` — right after the `games` table.

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
  key: { partitionKey: "gameId", sortKey: "ts" },
});
```

> **The sort key has to be unique.** `(gameId, ts)` is the full identity of a chat row, so
> two messages in the same game with the same `ts` are the *same row* — the second `put`
> silently overwrites the first and that message is gone. This matters here because
> `Date.now()` only resolves to the millisecond and a single turn emits a whole burst of
> messages (a DM line, the action, the roll, the outcome) far faster than that. That is why
> the backend hands out timestamps through the `nextTs` helper, which never returns the same
> number twice, instead of calling `Date.now()` at each write. Any time you make a clock
> reading part of a key, ask what happens when two writes share a tick.

### 3. Delete both Maps

**Delete both Maps** (`gameStateStore`, `chatStore`). The persistence mock block is now empty — remove it; only the realtime and AI mocks remain.

### 4. Infer the types from the schemas

Remove all the mock Game Types and **Infer the types from the schemas:**

   ```ts
   type Player = z.infer<typeof playerSchema>;
   type Roll = z.infer<typeof rollSchema>;
   type LogEntry = z.infer<typeof logEntrySchema>;
   type ChatMsg = z.infer<typeof chatSchema>;
   type GameState = z.infer<typeof gameStateSchema>;
   ```

### 5. Swap the call sites

**Swap the call sites** (all async now):

   | before (Map)                                                      | after (table)                                                                              |
   | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
   | `gameStateStore.get(gameId)`                                      | `await gameStates.get({ gameId })`                                                         |
   | `const st = gameStateStore.get(g.gameId);`                        | `const st = await gameStates.get({ gameId: g.gameId });`                                   |
   | `gameStateStore.set(id, state)`                                   | `await gameStates.put(state)`                                                              |
   | `gameStateStore.set(id, {<items>})`                               | `await gameStates.put({<items>})`                                                          |
   | `[...(chatStore.get(gameId) ?? [])].sort((a, b) => a.ts - b.ts);` | `await Array.fromAsync( chatMessages.query({ where: { gameId: { equals: gameId } } }), );` |
   | `chatStore.get(id)` — see the note below                          | `await chatMessages.put(msg)`                                                              |

The last row applies in **three separate places** — `transcribe`, `postBotChat`, and
`sendChat` — and each one is a three-line read-modify-write that collapses into a single
`put`. In every one of them, delete all three lines:

```ts
const bucket = chatStore.get(gameId) ?? [];   // delete
bucket.push(msg);                             // delete
chatStore.set(gameId, bucket);                // delete
```

and leave `await chatMessages.put(msg)` in their place. The copies inside `postBotChat` and
`sendChat` are indented differently from the one in `transcribe`, so searching for the exact
text above will miss them — search for `bucket` instead and confirm you have none left.
Once all three sites are converted, the `const chatStore = new Map…` declaration is unused
and should go too.

### 6. Bump the version in saveAndBroadcast

Update the `saveAndBroadcast` function like the following:

```ts
async function saveAndBroadcast(state: GameState) {
  const next = { ...state, version: state.version + 1 };
  await gameStates.put(next);
  publish("state", next.gameId, { gameId: next.gameId, version: next.version });
  return next;
}
```

The full version is in [`solution/index.ts`](solution/index.ts).

### 7. Verify

**Verify:** Same idea as module 03, one level up: the whole game — players, rolls, log, chat — now survives a restart. The turn engine was already authoritative; you only changed where it keeps its state.

   ```bash
   npm run typecheck
   rm -rf .bb-data && npm run dev
   ```

   Play a game: sign in, create an AI game, take a turn. Then **restart the dev server**
   and reopen the same game — it's still live, mid-round, with the full chat log. Confirm
   on disk:

   ```bash
   ls .bb-data/    # tt-gameStates and tt-chat now exist alongside the rest
   cat .bb-data/tt-gameStates/data.json # Check the data
   ```

   Or read the authoritative state through the API. `getState` takes a `gameId` and needs a
   session, so sign in:

   ```bash
   # 1) sign in, saving the session cookie
   curl -s -c cookies.txt -X POST http://localhost:3001/aws-blocks/api \
     -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","method":"authApi.setAuthState","params":[{"action":"signIn","username":"aldric","password":"password123"}],"id":1}'
   ```

   (saving the cookie), grab a `gameId` from `listGames`, then fetch it:

```bash
  # 2) find a gameId (from api.listGames), then fetch its state
  curl -s -b cookies.txt -X POST http://localhost:3001/aws-blocks/api \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","method":"api.getState","params":["REPLACE_WITH_GAME_ID"],"id":1}'
```

On Windows / PowerShell, translate the quoting as shown in
[the curl reference](../README.md#reference-curl-windows-quoting-and-resetting-state)
— the JSON body is identical. Swap `REPLACE_WITH_GAME_ID` for a real `gameId` from
`api.listGames`, and use your own credentials.

Catch up from `workshop/app/`: `cp ../05-state/solution/index.ts aws-blocks/index.ts`

### The React side

Two client files put this module's storage to work. The chat transcript you now persist is
rendered by `app/src/components/Chat.jsx`, a plain presentational component: it takes a
`messages` array and paints each line, styling it by `m.kind` (`dm` / `roll` / `action` /
`system` / `say`). Its one bit of behaviour is scroll-follow — a `useRef` on the scroll
container plus a `useEffect` keyed on `messages` that pins the view to the bottom whenever
the list grows:

```jsx
const scrollRef = useRef(null)
useEffect(() => {
  const el = scrollRef.current
  if (el) el.scrollTop = el.scrollHeight
}, [messages])
```

The `ts` sort key you leaned on server-side is why those messages arrive already ordered;
the component never sorts them.

The more important half is the **version guard** in `app/src/screens/GameRoom.jsx`. Your
`saveAndBroadcast` increments `state.version` on every write — that number is the whole
point of the client's `refreshState` `useCallback` (~L38–45):

```jsx
const fresh = await api.getState(gameId)
setState((prev) => (prev && fresh.version < prev.version ? prev : fresh))
```

Instead of blindly replacing state with whatever the fetch returned, it keeps the state it
already holds when the fetched `version` is *older*. That's what stops a slow in-flight
`getState` from clobbering a newer state the client already applied (for example, your own
optimistic result racing a refetch triggered elsewhere). The server-side version bump you
wrote and this client-side comparison are two halves of one mechanism: the server stamps
monotonically increasing versions, and the client refuses to move backwards.

---

## Checklist

- [ ] `npm run typecheck` passes.
- [ ] `app/.bb-data/tt-gameStates/` and `app/.bb-data/tt-chat/` exist after playing.
- [ ] A game (and its chat) survives a dev-server restart.

## What you learned

- A **sort key** turns a table into an ordered log — query by partition key and get rows
  back in sort order, no manual sorting.
- Large nested items are modeled with **embedded Zod sub-schemas**; `z.infer` keeps types
  and validation in lockstep.
- The turn engine was authoritative all along — real storage slotted in with no logic
  change, which is exactly why "works locally" is trustworthy.

## Troubleshooting

- **`ZodError` on `put`** — your object doesn't match the schema (e.g. a missing field, or
  `kind` outside the enum). The error names the offending path.
- **Chat out of order** — you're sorting client-side instead of relying on the `ts` sort
  key; use the `query` shown above.
- **Old game won't load after schema edits** — `rm -rf app/.bb-data` to clear items
  written under the previous shape.

---

**Next:** Module 06 — Realtime — replace `fakeChannel`/`publish` with the `Realtime` block
so every player sees turns, chat, and AI "thinking" live over WebSocket.
