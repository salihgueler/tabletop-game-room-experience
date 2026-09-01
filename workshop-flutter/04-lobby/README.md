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
(reads every row, and gets slower as the table grows — which is why we query an index
instead) is the wrong tool for a listing you run constantly — it's unindexed and gets
slower as the table grows. The idiomatic Blocks pattern is a targeted `query()` instead:

- Give every row the **same** partition key (the field the store shards and groups rows
  by): `listKey: "all"`.
- Use `gameId` as the **sort key** (the field rows are ordered by within a partition —
  and here, unique per game).
- Add a **secondary index** (a GSI, Global Secondary Index — a second way to look rows
  up, on fields other than the primary key) `byCreated` on `(listKey, createdAt)`.
- To list them all: `query({ index: "byCreated", where: { listKey: { equals: "all" } } })`
  — one partition, sorted by creation time.

> **⚠️ `index` must be an index _name_, not a field.**
> `games.query({ index: "gameId", ... })` throws `Index 'gameId' not found`. Only names
> from the `indexes` config are valid.

The pattern is identical to the React workshop — the backend is the same `index.ts`, and
the Flutter frontend consumes the same JSON-RPC responses through generated Dart bindings.


## Steps

> **Working directory:** every fence in this module starts from `workshop-flutter/app/`.
> The `cd` lines are written so you can paste them in order from there.

### 1. Update the game schema

The two new fields exist purely to make *listing* possible. In module 03 you always knew
the one key you wanted, so you fetched a single item and were done. The lobby is the
opposite: you want every game at once. `listKey` is a constant partition key — every game
you write carries `"all"`, so they all land in the same partition and one query can read
them back together. `gameId` is the sort key, keeping each row unique within that shared
partition. This is the step that makes the `byCreated` GSI in step 2 possible; without a
shared partition to index, there would be nothing to query.

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

`Array.fromAsync` drains that async iterator into a plain array — the same idea as
calling `.toList()` on a Dart `Stream` to collect every event before you work with it.

Now update the following: 

   Also **infer `Game` from the schema**, the same move you made for `Character` in module 03 —
   delete the hand-written `type Game = { ... }` and replace it with:

   ```ts
   type Game = z.infer<typeof gameSchema>;
   ```

   This one is easy to skip because nothing breaks if you don't: rows are written through
   `games.put()`, which validates against `gameSchema` rather than against `type Game`, so a
   stale hand-written type still compiles. It just stops being true — it won't have `listKey`,
   and the schema is supposed to be the single source of truth.

   | before (Map)                                                                                    | after (table)                                                                                                                    |
   | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
   | `gameStore.size > 0` - in seedIfEmpty                                                           | query the existing and do the check `existing.length > 0`                                                                        |
   | `gameStore.set(gameId, {...})` - in seedIfEmpty, finalizeIfExpired, syncLobbyStatus, createGame | `await games.put({ listKey: "all", ...})`                                                                                        |
   | `[...gameStore.values()].sort(...)` - in listGames                                              | `(await Array.fromAsync(games.query({ index: "byCreated", where: { listKey: { equals: "all" } } }))).filter((g) => g.isPublic).reverse()` — newest-first, and **public only**: the lobby must not list private games. This replaces the existing `const publicGames = all.filter((g) => g.isPublic);` line too — the filter moves into the expression, so delete that line rather than keeping both |
   | `[...gameStore.values()].find(...)` - in joinPrivate                                            | query the existing and do the `.find(...)`                                                                                       |
   | `gameStore.get(state.gameId)` - in finalizeIfExpired and syncLobbyStatus                        | `await games.get({ listKey: "all", gameId: state.gameId })`                                                                      |

#### Copy the solution if something is missing

   ```bash
   cd backend
   cp ../../04-lobby/solution/index.ts aws-blocks/index.ts
   npm run typecheck
   ```

### 4. **Regenerate the Dart client bindings:**

   The spec generator reads `index.ts`, extracts every exported namespace's methods and
   Zod schemas, and writes a JSON spec the Dart code-gen reads:

   ```bash
   cd backend   # the blocks-generate-spec binary lives here
   npx blocks-generate-spec aws-blocks/index.ts ../lib/blocks.spec.json
   cd ..
   dart run build_runner build --delete-conflicting-outputs
   flutter analyze
   ```

### 5. **Run the app:**

You are starting the backend and the Flutter client together to confirm the table-backed
lobby behaves end to end — that seeded games load, a game you create shows up, and the
list survives a restart. The steps below tell you exactly what to click and resize.

   ```bash
   # Terminal 1 — from workshop-flutter/app/
   cd backend
   npm run dev

   # Terminal 2 — from workshop-flutter/app/
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
cat backend/.bb-data/tt-games/data.json   # lobby rows, all with listKey:"all"
```

**Flutter UI steps:**

- Sign in → Guild Hall shows seeded games.
- Create a public game → it appears at the top of the list.
- Create a private game → copy the access code → sign in as a different user → Join
  Private → confirm the game loads.
- Resize the window below 840 px → responsive hall layout renders correctly.

---

### The Flutter side

The backend you just changed serves web, an Android emulator, a desktop build, and
iOS — all from the **same** JSON-RPC endpoint. The one place that fact bites you is the
base URL: a Chrome tab and an Android emulator can't both reach the dev server at
`http://localhost:3001`. Dart solves this without an `if (kIsWeb)` scattered through
your networking code — it picks a *different source file* at compile time.

Open the conditional-export trio under `app/lib/data/services/`:

- `blocks_api_url.dart` — the shim. It's a one-liner:
  `export 'blocks_api_url_io.dart' if (dart.library.js_interop) 'blocks_api_url_web.dart';`.
  When you compile for the web, `dart.library.js_interop` is available, so the `if`
  clause wins and the web file is exported; for every non-web target (mobile, desktop)
  the default `_io` file is exported. Callers just `import 'blocks_api_url.dart'` and
  call `localBlocksApiUrl()` — they never know which one they got.
- `blocks_api_url_io.dart` (around L1–5) — the native path. It imports `dart:io` and
  returns `Platform.isAndroid ? '10.0.2.2' : 'localhost'`. `10.0.2.2` is the Android
  emulator's alias for the host machine's loopback — the emulator is a separate virtual
  machine, so its own `localhost` is the emulator, not your laptop.
- `blocks_api_url_web.dart` (around L1) — the web path. Just `localhost`; the browser is
  already on your machine. It **can't** import `dart:io` (there's no filesystem in a
  browser), which is the whole reason the split exists.

`http_client_factory.dart` uses the identical trick for the HTTP client itself. On the
web, `http_client_factory_web.dart` (around L1–4) returns
`BrowserClient()..withCredentials = true`. That `withCredentials` flag is what makes the
browser attach the session cookie (the one module 02's auth set) on cross-origin XHRs —
without it, `listGames` would come back unauthorized even after a successful sign-in. The
native factory (`http_client_factory_io.dart`) needs no such flag; a Dart VM sends the
cookie regardless.

**Reason it through:** when you run `flutter run -d chrome`, which file compiles into the
build — `blocks_api_url_io.dart` or `blocks_api_url_web.dart`? (The web one:
`dart.library.js_interop` is present.) When you run against an Android emulator, which
URL does the app hit? (`http://10.0.2.2:3001/...`, from the `_io` file's `Platform.isAndroid`
branch.) Get this wrong and the symptom is always the same: the app builds fine but every
request hangs or connection-refuses, because it's dialing the wrong host.

---

## Checklist

- [ ] `npm run typecheck` passes.
- [ ] `flutter analyze` reports no issues.
- [ ] Seeded + created games list correctly (newest first) and persist to
      `backend/.bb-data/tt-games/`.
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
  delete `backend/.bb-data` and restart to re-seed cleanly.
- **`flutter analyze` errors about missing members** — you need to regenerate bindings.
  Re-run the regeneration loop in step 4.
- **`build_runner` fails with conflicting outputs** — always pass
  `--delete-conflicting-outputs` to let it overwrite stale generated files.
- **Responsive layout not switching** — ensure you're resizing the *window*, not just the
  content area. The breakpoint is 840 px of available width.

---

**Next:** [Module 05 — Game state & chat](../05-state/README.md) — move the authoritative
game state and the chat transcript into `DistributedTable`, completing persistence.
