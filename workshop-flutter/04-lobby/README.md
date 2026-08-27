# Module 04 — Guild Hall lobby (`gameStore` Map → `DistributedTable` + GSI)

**Goal:** persist lobby rows in a real table and learn the pattern for listing a whole
collection without a full-table scan.

**Block introduced:** `DistributedTable` (with a secondary index / GSI)

**You edit:** `app/backend/aws-blocks/index.ts`

**You'll know you're done when:** the seeded games appear, a created game shows up in the
list, and Join-Private resolves by access code — all surviving a restart. The Flutter hall
renders correctly at both wide and narrow viewports (resize below 840 px for the compact
layout).

---

## Concept: list via a constant partition key + GSI

Earlier one, you fetched one item by its key. The lobby is different: you need **every** game.
`DistributedTable` does have a `scan()` (it walks the whole table), but a full-table scan
is the wrong tool for a listing you run constantly — it's unindexed and gets slower as the
table grows. The idiomatic Blocks pattern is a targeted `query()` instead:

- Give every row the **same** partition key: `listKey: "all"`.
- Use `gameId` as the **sort key** (unique per game).
- Add a **secondary index** `byCreated` on `(listKey, createdAt)`.
- To list them all: `query({ index: "byCreated", where: { listKey: { equals: "all" } } })`
  — one partition, sorted by creation time.

> **⚠️ `index` must be an index _name_, not a field.**
> `games.query({ index: "gameId", ... })` throws `Index 'gameId' not found`. Only names
> from the `indexes` config are valid.

The pattern is identical to the React workshop — the backend is the same `index.ts`, and
the Flutter frontend consumes the same JSON-RPC responses through generated Dart bindings.


## Steps

### 1. Update the game schame

Add game schema like below. This schema adds two new fields the Map version didn't need — `listKey` and `gameId`:

 ```ts
   // A game room in the lobby list.
   const gameSchema = z.object({
     listKey: z.string(), // constant "all" — the whole-collection partition
     gameId: z.string(), // sort key — unique per game
     name: z.string(),
     theme: z.string(),
     note: z.string(),
     dmType: z.string(),
     dmLevel: z.string(),
     maxParty: z.number(),
     status: z.string(),
     isPublic: z.boolean(),
     accessCode: z.string().nullable(),
     hostUserId: z.string(),
     createdAt: z.number(),
   });
   ```

### 2. Use `byCreated` index 

The `games` DistributedTable uses that schema with a `byCreated` index:

   ```ts
   const games = new DistributedTable(scope, "games", {
     schema: gameSchema, // includes listKey + gameId
     key: { partitionKey: "listKey", sortKey: "gameId" },
     indexes: {
       byCreated: { partitionKey: "listKey", sortKey: "createdAt" },
     },
   });
   ```

### 3. Remove the Mock and Use Real Implementation

1. Delete `const gameStore = new Map<string, Game>();`. 

2. Every call site becomes `async`, and every write must include `listKey: "all"`. When you are asked to query the item, paste the following:
```ts
// list everything (query returns an async iterator):
const existing = await Array.fromAsync(
  games.query({ index: "byCreated", where: { listKey: { equals: "all" } } }),
);
```

Now update the following: 

   | before (Map)                                                                                    | after (table)                                                                                                                    |
   | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
   | `gameStore.size > 0` - in seedIfEmpty                                                           | query the existing and do the check `existing.length > 0`                                                                        |
   | `gameStore.set(gameId, {...})` - in seedIfEmpty, finalizeIfExpired, syncLobbyStatus, createGame | `await games.put({ listKey: "all", ...})`                                                                                        |
   | `[...gameStore.values()].sort(...)` - in listGames                                              | `(await Array.fromAsync(games.query({ index: "byCreated", where: { listKey: { equals: "all" } } }))).reverse()` for newest-first |
   | `[...gameStore.values()].find(...)` - in joinPrivate                                            | query the existing and do the `.find(...)`                                                                                       |
   | `gameStore.get(state.gameId)` - in finalizeIfExpired and syncLobbyStatus                        | `await games.get({ listKey: "all", gameId: state.gameId })`                                                                      |

#### Copy the solution if something is missing

   ```bash
   cd backend
   cp ../../04-lobby/solution/index.ts aws-blocks/index.ts
   npm run typecheck
   ```

### 5. **Regenerate the Dart client bindings:**

   The spec generator reads `index.ts`, extracts every exported namespace's methods and
   Zod schemas, and writes a JSON spec the Dart code-gen reads:

   ```bash
   cd backend   # the blocks-generate-spec binary lives here
   npx blocks-generate-spec aws-blocks/index.ts ../lib/blocks.spec.json
   cd ..
   dart run build_runner build --delete-conflicting-outputs
   flutter analyze
   ```

### 6. **Run the app:**

   ```bash
# Terminal 1
npm run dev

# Terminal 2
   flutter run -d chrome
   ```

   (Or `-d macos` for macOS, `-d linux` for Linux desktop.)

**Exercise the lobby:**

   - The Guild Hall shows the 3 seeded games.
   - **Launch New Adventure** adds a game that appears at the top.
   - Create a _private_ game with an access code, then use **Join Private Game** with
     that code from a second account.
   - **Resize below 840 px** — the hall switches to the compact single-column layout.
     Verify game cards still render correctly.
   - **Join from a second client** (two windows, two accounts) and confirm both see the
   same lobby state after refresh.

## Verify

Confirm the backend independently with `curl`. `listGames` requires a session, so sign
in first (saving the cookie) and reuse it:

```bash
# 1) sign in, saving the session cookie
curl -s -c cookies.txt -X POST http://localhost:3001/aws-blocks/api \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"authApi.setAuthState","params":[{"action":"signIn","username":"aldric","password":"password123"}],"id":1}'

# 2) list the lobby (newest first)
curl -s -b cookies.txt -X POST http://localhost:3001/aws-blocks/api \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"api.listGames","params":[],"id":1}'
```

> Replace `aldric` / `password123` with your account.

On disk you can also inspect the raw table data:

```bash
cat app/backend/.bb-data/tt-games/data.json   # lobby rows, all with listKey:"all"
```

**Flutter UI steps:**

- Sign in → Guild Hall shows seeded games.
- Create a public game → it appears at the top of the list.
- Create a private game → copy the access code → sign in as a different user → Join
  Private → confirm the game loads.
- Resize the window below 840 px → responsive hall layout renders correctly.

Catch up from `app/backend/`:
`cp ../../04-lobby/solution/index.ts aws-blocks/index.ts`

---

## Checklist

- [ ] `npm run typecheck` passes.
- [ ] `flutter analyze` reports no issues.
- [ ] Seeded + created games list correctly (newest first) and persist to
      `app/backend/.bb-data/tt-games/`.
- [ ] Join-Private resolves a game by its access code.
- [ ] Responsive hall layout works below 840 px.

## What you learned

- Listing a collection in Blocks = **constant partition key + a GSI + query** — a targeted
  index read, not a full-table `scan()`.
- `query()` takes an optional **index name** (from `indexes`) and returns an async iterator
  — `Array.fromAsync(...)` collects it. Omit `index` to query the base table by its
  primary key (that's how module 05 reads a game's chat by `gameId`).
- A sort key (`gameId`) makes each row unique within the shared partition; the index sort
  key (`createdAt`) gives you ordering.
- The Dart bindings regeneration loop (`blocks-generate-spec` → `build_runner`) is the
  Flutter equivalent of the React workshop's TypeScript client codegen.

## Troubleshooting

- **`Index 'all' not found` / `Index 'gameId' not found`** — you passed a field where an
  index name goes. Use `index: "byCreated"`.
- **Lobby empty after the change** — the seed only runs when the query returns nothing;
  delete `app/backend/.bb-data` and restart to re-seed cleanly.
- **`flutter analyze` errors about missing members** — you need to regenerate bindings.
  Re-run `npx blocks-generate-spec ...` and `dart run build_runner build
  --delete-conflicting-outputs`.
- **`build_runner` fails with conflicting outputs** — always pass
  `--delete-conflicting-outputs` to let it overwrite stale generated files.
- **Responsive layout not switching** — ensure you're resizing the *window*, not just the
  content area. The breakpoint is 840 px of available width.

---

**Next:** [Module 05 — Game state & chat](../05-state/README.md) — move the authoritative
game state and the chat transcript into `DistributedTable`, completing persistence.
