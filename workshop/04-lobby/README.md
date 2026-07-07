# Module 04 — Guild Hall lobby (`gameStore` Map → `DistributedTable` + GSI)

**Goal:** persist lobby rows in a real table and learn the pattern for listing a whole
collection without a full-table scan.

**Block introduced:** `DistributedTable` (with a secondary index / GSI)
**You edit:** `app/aws-blocks/index.ts`
**You'll know you're done when:** the seeded games appear, a created game shows up in the
list, and Join-Private resolves by access code — all surviving a restart.

---

## Concept: list via a constant partition key + GSI

Module 03 fetched one item by its key. The lobby is different: you need **every** game.
`DistributedTable` does have a `scan()` (it walks the whole table), but a full-table scan
is the wrong tool for a listing you run constantly — it's unindexed and gets slower as the
table grows. The idiomatic Blocks pattern is a targeted `query()` instead:

- Give every row the **same** partition key: `listKey: "all"`.
- Use `gameId` as the **sort key** (unique per game).
- Add a **secondary index** `byCreated` on `(listKey, createdAt)`.
- To list them all: `query({ index: "byCreated", where: { listKey: { equals: "all" } } })`
  — one partition, sorted by creation time.

```ts
const games = new DistributedTable(scope, "games", {
  schema: gameSchema, // includes listKey + gameId
  key: { partitionKey: "listKey", sortKey: "gameId" },
  indexes: {
    byCreated: { partitionKey: "listKey", sortKey: "createdAt" },
  },
});

// list everything (query returns an async iterator):
const all = await Array.fromAsync(
  games.query({ index: "byCreated", where: { listKey: { equals: "all" } } }),
);
```

> **⚠️ `index` must be an index _name_, not a field.**
> `games.query({ index: "gameId", ... })` throws `Index 'gameId' not found`. Only names
> from the `indexes` config are valid.

## Steps

1. **Add the `games` table** (schema + index) right after the `characters` table. The
   schema adds two fields the Map version didn't need: `listKey` and `gameId`.

2. **Delete `const gameStore = new Map(...)`** from the persistence mock (keep
   `gameStateStore` and `chatStore` — that's module 05).

3. **Type from schema:** `type Game = z.infer<typeof gameSchema>;` (delete the hand-written
   `Game` type). Note `Game` now includes `listKey`.

4. **Swap every call site.** All become `async`, and every write must include
   `listKey: "all"`:

   | before (Map)                                        | after (table)                                                                                                                          |
   | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
   | `gameStore.size > 0` (in `seedIfEmpty`)             | query the index; check `existing.length > 0`                                                                                           |
   | `gameStore.set(id, {...})`                          | `await games.put({ listKey: "all", ...})`                                                                                              |
   | `[...gameStore.values()]` (in `listGames`)          | `await Array.fromAsync(games.query({ index: "byCreated", where: { listKey: { equals: "all" } } }))` then `.reverse()` for newest-first |
   | `gameStore.get(state.gameId)` (finalize/sync)       | `await games.get({ listKey: "all", gameId: state.gameId })`                                                                            |
   | `[...gameStore.values()].find(...)` (`joinPrivate`) | query the index, then `.find(...)`                                                                                                     |

   The completed versions are in [`index.ts`](index.ts) — diff against yours.

5. **Verify:**

   ```bash
   npm run typecheck
   rm -rf app/.bb-data && npm run dev     # fresh state so the seed runs
   ```

   In the browser: the Guild Hall shows the 3 seeded games; **Launch New Adventure** adds
   one; create a _private_ game with an access code, then use **Join Private Game** with
   that code. Confirm on disk:

   ```bash
   cat app/.bb-data/tt-games/data.json    # your lobby rows, all with listKey:"all"
   ```

Catch up: `cp ../04-lobby/index.ts app/aws-blocks/index.ts`

---

## Checklist

- [ ] `npm run typecheck` passes.
- [ ] Seeded + created games list correctly (newest first) and persist to
      `app/.bb-data/tt-games/`.
- [ ] Join-Private resolves a game by its access code.

## What you learned

- Listing a collection in Blocks = **constant partition key + a GSI + query** — a targeted
  index read, not a full-table `scan()`.
- `query()` takes an optional **index name** (from `indexes`) and returns an async iterator
  — `Array.fromAsync(...)` collects it. Omit `index` to query the base table by its
  primary key (that's how module 05 reads a game's chat by `gameId`).
- A sort key (`gameId`) makes each row unique within the shared partition; the index sort
  key (`createdAt`) gives you ordering.

## Troubleshooting

- **`Index 'all' not found` / `Index 'gameId' not found`** — you passed a field where an
  index name goes. Use `index: "byCreated"`.
- **Lobby empty after the change** — the seed only runs when the query returns nothing;
  `rm -rf app/.bb-data` and restart to re-seed cleanly.

---

**Next:** Module 05 — Game state & chat — move the authoritative game state and the chat
transcript into `DistributedTable`, completing persistence.
