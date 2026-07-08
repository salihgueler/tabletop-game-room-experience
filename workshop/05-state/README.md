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

1. **Add the embedded schemas** (`playerSchema`, `rollSchema`, `logEntrySchema`) and the
   two table schemas (`gameStateSchema`, `chatSchema`), then create `gameStates` and
   `chatMessages` — right after the `games` table.

2. **Delete both Maps** (`gameStateStore`, `chatStore`). The persistence mock block is now
   empty — remove it; only the realtime and AI mocks remain.

3. **Infer the types from the schemas:**

   ```ts
   type Player = z.infer<typeof playerSchema>;
   type Roll = z.infer<typeof rollSchema>;
   type LogEntry = z.infer<typeof logEntrySchema>;
   type ChatMsg = z.infer<typeof chatSchema>;
   type GameState = z.infer<typeof gameStateSchema>;
   ```

4. **Swap the call sites** (all async now):

   | before (Map)                                          | after (table)                                                                          |
   | ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
   | `gameStateStore.get(gameId)`                          | `await gameStates.get({ gameId })`                                                     |
   | `gameStateStore.set(id, state)`                       | `await gameStates.put(state)`                                                          |
   | `chatStore.get(id)` / push / `set`                    | `await chatMessages.put(msg)`                                                          |
   | `[...chatStore.get(id)].sort(...)` (`getChatHistory`) | `await Array.fromAsync(chatMessages.query({ where: { gameId: { equals: gameId } } }))` |

   In `saveAndBroadcast`, build a new `next = { ...state, version: state.version + 1 }`,
   `put` it, and return it. The full versions are in [`index.ts`](index.ts).

5. **Verify:**

   ```bash
   npm run typecheck
   rm -rf app/.bb-data && npm run dev
   ```

   Play a game: sign in, create an AI game, take a turn. Then **restart the dev server**
   and reopen the same game — it's still live, mid-round, with the full chat log. Confirm
   on disk:

   ```bash
   ls app/.bb-data/    # tt-gameStates and tt-chat now exist alongside the rest
   ```

Catch up: `cp ../05-state/solution/index.ts app/aws-blocks/index.ts`

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
