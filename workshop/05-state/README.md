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
- **`chatMessages`** — an append-only log keyed by `(gameId, ts)`. A **sort key** (`ts`)
  means one `query({ where: { gameId: { equals } } })` returns a game's whole transcript
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

Once state lives in a validated table, the Zod schema becomes the single source of truth
for the _type_ too. Replace the hand-written `Player` / `Roll` / `LogEntry` / `GameState`
/ `ChatMsg` types with `z.infer<...>` so runtime validation and compile-time types can't
drift apart.

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

1. **Add the embedded schemas for players, rolls and log entries**

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

2. Add two tables (`gameStateSchema`, `chatSchema`), then create `gameStates` and
   `chatMessages` — right after the `games` table.

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
3. **Delete both Maps** (`gameStateStore`, `chatStore`). The persistence mock block is now
   empty — remove it; only the realtime and AI mocks remain.

4. Remove all the mock Game Types and **Infer the types from the schemas:**

   ```ts
   type Player = z.infer<typeof playerSchema>;
   type Roll = z.infer<typeof rollSchema>;
   type LogEntry = z.infer<typeof logEntrySchema>;
   type ChatMsg = z.infer<typeof chatSchema>;
   type GameState = z.infer<typeof gameStateSchema>;
   ```

5. **Swap the call sites** (all async now):

   | before (Map)                                                      | after (table)                                                                              |
   | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
   | `gameStateStore.get(gameId)`                                      | `await gameStates.get({ gameId })`                                                         |
   | `const st = gameStateStore.get(g.gameId);`                        | `const st = await gameStates.get({ gameId: g.gameId });`                                   |
   | `gameStateStore.set(id, state)`                                   | `await gameStates.put(state)`                                                              |
   | `gameStateStore.set(id, {<items>})`                               | `await gameStates.put({<items>})`                                                          |
   | `[...(chatStore.get(gameId) ?? [])].sort((a, b) => a.ts - b.ts);` | `await Array.fromAsync( chatMessages.query({ where: { gameId: { equals: gameId } } }), );` |
   | `chatStore.get(id)` - remove set and bucket as well               | `await chatMessages.put(msg)`                                                              |

6. Update the `saveAndBroadcast` function like the following:

```ts
async function saveAndBroadcast(state: GameState) {
  const next = { ...state, version: state.version + 1 };
  await gameStates.put(next);
  publish("state", next.gameId, { gameId: next.gameId, version: next.version });
  return next;
}
```

The full version is in [`solution/index.ts`](solution/index.ts).

7. **Verify:**

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

On Windows (cmd.exe), one line each with escaped quotes:

```cmd
curl -s -c cookies.txt -X POST http://localhost:3001/aws-blocks/api -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"method\":\"authApi.setAuthState\",\"params\":[{\"action\":\"signIn\",\"username\":\"aldric\",\"password\":\"password123\"}],\"id\":1}"

curl -s -b cookies.txt -X POST http://localhost:3001/aws-blocks/api -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"method\":\"api.getState\",\"params\":[\"REPLACE_WITH_GAME_ID\"],\"id\":1}"
```

> Swap `REPLACE_WITH_GAME_ID` for a real `gameId` from `api.listGames`, and use your own
> credentials. In PowerShell use `curl.exe`.

Catch up from `workshop/app/`: `cp ../05-state/solution/index.ts aws-blocks/index.ts`

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
