# Module 04 — Guild Hall lobby (`gameStore` Map → `DistributedTable` + GSI)

**Goal:** persist lobby rows in a real table and learn the pattern for listing a whole
collection without a full-table scan (reading every row to find the ones you want).

**Block introduced:** `DistributedTable` (with a secondary index / GSI — Global Secondary
Index, a second way to look rows up besides the table's own key)
**You edit:** `app/aws-blocks/index.ts`
**You'll know you're done when:** the seeded games appear, a created game shows up in the
list, and Join-Private resolves by access code — all surviving a restart.

---

## Concept: list via a constant partition key + GSI

Module 03 fetched one item by its key. The lobby is different: you need **every** game.
`DistributedTable` does have a `scan()` (it walks the whole table), but a full-table scan
is the wrong tool for a listing you run constantly — it's unindexed and gets slower as the
table grows. The idiomatic Blocks pattern is a targeted `query()` instead:

- Give every row the **same** partition key (the field the table shards and groups by):
  `listKey: "all"`.
- Use `gameId` as the **sort key** (the field that orders rows within one partition — here,
  unique per game).
- Add a **secondary index** `byCreated` on `(listKey, createdAt)`.
- To list them all: `query({ index: "byCreated", where: { listKey: { equals: "all" } } })`
  — one partition, sorted by creation time.

> **⚠️ `index` must be an index _name_, not a field.**
> `games.query({ index: "gameId", ... })` throws `Index 'gameId' not found`. Only names
> from the `indexes` config are valid.

## Steps

1. Start by adding game schema after character schema. The schema adds two fields the Map version didn't need: `listKey` and `gameId`.

```ts
// A game room in the lobby list.
const gameSchema = z.object({
  listKey: z.string(), // constant partition key for public listing ("all")
  gameId: z.string(), // sort key
  name: z.string(),
  theme: z.string(),
  note: z.string(),
  dmType: z.string(),
  dmLevel: z.string(),
  maxParty: z.number(),
  status: z.string(), // 'Awaiting Players' | 'In Session'
  isPublic: z.boolean(),
  accessCode: z.string().nullable(),
  hostUserId: z.string(),
  createdAt: z.number(),
});
```

2. **Add the `games` table** (schema + index) right after the `characters` table.

```ts
const games = new DistributedTable(scope, "games", {
  schema: gameSchema, // includes listKey + gameId
  key: { partitionKey: "listKey", sortKey: "gameId" },
  indexes: {
    byCreated: { partitionKey: "listKey", sortKey: "createdAt" },
  },
});
```

3. **Delete `const gameStore = new Map<string, Game>();`** from the persistence mock (keep
   `gameStateStore` and `chatStore` — that's module 05).

4. **Type from schema:** `type Game = z.infer<typeof gameSchema>;` (delete the hand-written
   `Game` type). `z.infer` reads the static TypeScript type back out of a Zod schema, so the
   runtime validator and the compile-time type stay one definition. Note `Game` now includes `listKey`.

5. **Swap every call site.** All become `async`, and every write must include
   `listKey: "all"`. When you are asked to query the item, paste the following:

   ```ts
   // list everything (query returns an async iterator):
   const existing = await Array.fromAsync(
     games.query({ index: "byCreated", where: { listKey: { equals: "all" } } }),
   );
   ```

   | before (Map)                                                                                    | after (table)                                                                                                                    |
   | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
   | `gameStore.size > 0` - in seedIfEmpty                                                           | query the existing and do the check `existing.length > 0`                                                                        |
   | `gameStore.set(gameId, {...})` - in seedIfEmpty, finalizeIfExpired, syncLobbyStatus, createGame | `await games.put({ listKey: "all", ...})`                                                                                        |
   | `[...gameStore.values()].sort(...)` - in listGames                                              | `(await Array.fromAsync(games.query({ index: "byCreated", where: { listKey: { equals: "all" } } }))).reverse()` for newest-first |
   | `[...gameStore.values()].find(...)` - in joinPrivate                                            | query the existing and do the `.find(...)`                                                                                       |
   | `gameStore.get(state.gameId)` - in finalizeIfExpired and syncLobbyStatus                        | `await games.get({ listKey: "all", gameId: state.gameId })` and remove the `listKey: "all"` from put calls                       |

   The completed version is in [`solution/index.ts`](solution/index.ts) — diff against yours.

6. **Verify:**

   These two commands are your smoke test. `npm run typecheck` is the same `tsc`
   gate you would wire into a CI step — it proves your `z.infer` types and the
   table config still line up before anything runs. Deleting `.bb-data` wipes the
   local table files so the seed path runs on a clean slate, the way clearing
   `localStorage` forces a first-run flow in a React app. What you are really
   confirming is that the rows survive the process boundary: start, look, restart,
   look again.

   ```bash
   npm run typecheck
   rm -rf .bb-data && npm run dev     # fresh state so the seed runs
   ```

   In the browser: the Guild Hall shows the 3 seeded games; **Launch New Adventure**
   adds a public game to the Guild Hall. A private game persists on disk but does
   not appear in the public listing; open it through **Join Private Game** using
   its access code.
   Confirm on disk:

   ```bash
   cat .bb-data/tt-games/data.json    # your lobby rows, all with listKey:"all"
   ```

   Or list them through the API. `listGames` requires a session, so sign in (saving the
   cookie):

   ```bash
   curl -s -c cookies.txt -X POST http://localhost:3001/aws-blocks/api \
     -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","method":"authApi.setAuthState","params":[{"action":"signIn","username":"aldric","password":"password123"}],"id":1}'
   ```

   comment out the following to test out:

   ```ts
   const publicGames = all.filter((g) => g.isPublic).reverse();
   ```

   and change the `publicGames` in the for loop to `all`. Do the call:

   ```bash
   curl -s -b cookies.txt -X POST http://localhost:3001/aws-blocks/api \
     -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","method":"api.listGames","params":[],"id":1}'
   ```

   On Windows / PowerShell, translate the quoting as shown in
   [the curl reference](../README.md#reference-curl-windows-quoting-and-resetting-state)
   — the JSON body is identical. Replace `aldric` / `password123` with your account.

Catch up from `workshop/app/`: `cp ../04-lobby/solution/index.ts aws-blocks/index.ts`

### The React side

The listing you just built is consumed by `app/src/screens/GuildHall.jsx`. Open it and
trace one value all the way through. Near the top the screen holds the list in local state:

```jsx
const [games, setGames] = useState([])
```

`refresh` (a `useCallback`, ~L26) does the whole job in one line — `setGames(await
api.listGames())`. Whatever array your server-side `listGames` returns becomes the `games`
state verbatim; there is no client-side reshaping. It runs once on mount from the
`useEffect` (~L37) and again whenever the host clicks the ⟳ "Refresh games" rail button.

The render maps that state straight onto cards (~L120):

```jsx
games.map((g) => <GameCard key={g.id} game={g} onJoin={() => onOpenGame(g.id)} />)
```

`key={g.id}` is the `id` field you set from `g.gameId` server-side — the same value passed
back to `onOpenGame` when a card's Join button is clicked, closing the loop from the row in
the table to the game the user opens. Inside `GameCard` you can see exactly which fields of
your assembled shape the UI reads: `game.name` and `game.note` for the heading,
`game.party`/`game.maxParty` for "seats filled", `game.dmLevel`, `game.partyClasses` for the
class sprites, and `game.members` for the expandable roster. Note one honest detail: your
server also returns `theme` and a precomputed `status` string, but the card doesn't use them
directly — it derives its own status text from the `finished` and `full` booleans instead
(`statusText`, ~L262). So the query you wrote is the single source of the list, but the
component still owns its own presentation of it.

---

## Checklist

- [ ] `npm run typecheck` passes.
- [ ] Seeded + created games list correctly (newest first) and persist to
      `.bb-data/tt-games/`.
- [ ] Join-Private resolves a game by its access code.

## What you learned

- Listing a collection in Blocks = **constant partition key + a GSI + query** — a targeted
  index read, not a full-table `scan()`.
- `query()` takes an optional **index name** (from `indexes`) and returns an async iterator
  — `Array.fromAsync(...)` collects it (draining a stream into an array, the way you'd call
  `.toList()` on one). Omit `index` to query the base table by its
  primary key (that's how module 05 reads a game's chat by `gameId`).
- A sort key (`gameId`) makes each row unique within the shared partition; the index sort
  key (`createdAt`) gives you ordering.

## Troubleshooting

- **`Index 'all' not found` / `Index 'gameId' not found`** — you passed a field where an
  index name goes. Use `index: "byCreated"`.
- **Lobby empty after the change** — the seed only runs when the query returns nothing;
  `rm -rf .bb-data` and restart to re-seed cleanly.

---

**Next:** Module 05 — Game state & chat — move the authoritative game state and the chat
transcript into `DistributedTable`, completing persistence.
