# Module 03 — Characters (`characterStore` Map → `DistributedTable`)

**Goal:** persist the player's hero in a real, schema-validated NoSQL table instead
of an in-memory Map — so it survives a server restart.

**Block introduced:** `DistributedTable`

**You edit:** `app/backend/aws-blocks/index.ts`

**You'll know you're done when:** you save a hero, restart the backend, sign back in,
and your hero is still there — character select is skipped.

---

## Concept

`DistributedTable` is the default data Block: structured items with a partition key
(the primary lookup key for an item — think of it like the key you'd use in a Dart `Map`)
and optionally a sort key and secondary indexes. Locally it persists to JSON under
`.bb-data/`; deployed it's DynamoDB (a NoSQL database). You define the shape with
a **Zod schema** — a runtime schema validator whose TypeScript type is *inferred* from
the same definition, so one declaration both checks the data and types it — validated on
every write, and read/write by key:

```ts
const characters = new DistributedTable(scope, "characters", {
  schema: characterSchema, // validates every put()
  key: { partitionKey: "userId" }, // one hero per account
});

await characters.put(character); // write
await characters.get({ userId: "aldric" }); // read by key → item | undefined
```

Characters are the simplest case: one item per user, always fetched by `userId`. No
sort key, no index. (The lobby in Module 04 needs an index — that's the next lesson.)

On the Flutter side, the generated `GetCharacterResult` type (a nullable record
matching the Zod schema fields) is mapped into the app's immutable `Character` domain
model in `lib/data/repositories/game_repository.dart`. The mapping is straightforward
— the generated type carries `userId`, `name`, `classKey`, `spriteId`, `sprite` — and
the repository constructs the domain model from those fields.

## Steps

> **Working directory:** every fence in this module starts from `workshop-flutter/app/`.
> The `cd` lines are written so you can paste them in order from there.


### 1. Update the imports

Open `app/backend/aws-blocks/index.ts` and make sure `DistributedTable` is imported from `@aws-blocks/blocks` and `z` from `zod`:

   ```ts
   import {
     ApiNamespace,
     Scope,
     AuthBasic,
     DistributedTable,
   } from "@aws-blocks/blocks";

   import { z } from "zod";
   ```
### 2. Add the Database Schema and table

Add the character schema and table:

   ```ts
   const characterSchema = z.object({
     userId: z.string(),
     name: z.string(),
     classKey: z.string(),
     spriteId: z.string(),
     sprite: z.string(),
   });

   const characters = new DistributedTable(scope, "characters", {
     schema: characterSchema,
     key: { partitionKey: "userId" },
   });
   ```

### 3. Use the Character type from Schema
Replace the `Character` type and **use the type from the schema** so there's one source of truth:
   ```ts
   type Character = z.infer<typeof characterSchema>;
   ```

### 4. Use the async data operations instead of mock operations.

a. Delete **`const characterStore = new Map<string, Character>();`** from the persistence mock block.

b. **Swap the call sites** (async now — tables return Promises):

   | before (Map)                                                                         | after (DistributedTable)                                    |
   | ------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
   | `characterStore.set(user.username, character)` - in saveCharacter function           | `await characters.put(character)`                           |
   | `characterStore.get(user.username) ?? null` - in getCharacter function               | `(await characters.get({ userId: user.username })) ?? null` |
   | `characterStore.get(user.username)` - in createGame, joinGame and sendChat functions | `await characters.get({ userId: user.username })`           |



#### Copy the solution if something is missing

```bash
cd backend # Make sure you are at backend folder
cp ../../03-characters/solution/index.ts aws-blocks/index.ts
npm run typecheck
```

### 5. Regenerate the Dart client

```bash
cd backend   # the blocks-generate-spec binary lives here
npx blocks-generate-spec aws-blocks/index.ts ../lib/blocks.spec.json
cd ..
dart run build_runner build --delete-conflicting-outputs
flutter analyze
```

### 6. Run and test

```bash
# Terminal 1
cd backend # make sure you are at backend folder
npm run dev

# Terminal 2
cd app # make sure you are at app folder
flutter run -d chrome
```

Pick a hero, save it. Then confirm persistence:

```bash
cat backend/.bb-data/tt-characters/data.json    # your hero is now a file on disk
```

## Verify

The real test: stop `npm run dev`, start it again, sign in as the **same** user —
character select is skipped and your hero loads directly. In the starter it would
have been wiped.

You can read the character back through the API. `getCharacter` now requires a session, so sign in
first (saving the cookie):

```bash
curl -s -c cookies.txt -X POST http://localhost:3001/aws-blocks/api \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"authApi.setAuthState","params":[{"action":"signIn","username":"aldric","password":"password123"}],"id":1}'
```

then call it with that cookie:

```bash
curl -s -b cookies.txt -X POST http://localhost:3001/aws-blocks/api \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"api.getCharacter","params":[],"id":1}'
```

Replace `aldric` / `password123` with the account you registered.

Flutter verify:

1. Save a character in the Flutter app.
2. Stop `npm run dev` (Ctrl+C).
3. Start `npm run dev` again.
4. Hot-restart the Flutter app — you're taken straight to the Guild Hall (character
   already loaded).

### The Flutter side

Persisting the hero didn't change the wire type — `getCharacter` still returns the same
`GetCharacterResult`. What's worth studying this module is the *seam* on the Flutter side:
where that generated type stops and the app's own **domain model** begins. Open
`app/lib/data/repositories/game_repository.dart`.

**The mapping boundary.** Find `_character()` (around L240):

```dart
Character _character(GetCharacterResult value) => Character(
      userId: value.userId,
      name: value.name,
      classKey: value.classKey,
      spriteId: value.spriteId,
      sprite: value.sprite,
    );
```

`GetCharacterResult` is the generated wire type from `blocks.blocks.dart`; `Character`
(in `app/lib/domain/models.dart`, around L107) is a hand-written immutable model the UI
consumes. `_character()` is the one place a `GetCharacterResult` is allowed to exist — it
is copied field-for-field into a `Character` and never seen again. `_state()` just below
it (around L248) does the same, larger job: it maps `GetStateResult` into the domain
`GameState`, and this is where all those `.toInt()` calls from Module 01 live
(`hp: player.hp.toInt()`, `turnIndex: value.turnIndex.toInt()`) — the boundary is exactly
where you convert the generated `num` into the `int` the domain model declares.

**Why bother with a domain layer at all?** It would compile fine to hand `GetCharacterResult`
straight to your widgets. The reason not to:

- **The generated type is regenerated.** Rename a backend field, regenerate, and every
  widget that read the old name breaks. With a domain layer, the break is contained to the
  one mapper function — the UI keeps compiling against a stable `Character`.
- **The domain model can carry behaviour the wire type can't.** `Character` has a computed
  `String get asset` (it turns `sprite` into an asset path); `Player` and `GameState`
  add getters like `me` and `narration`. Generated types are dumb data — no derived
  fields, no domain logic.
- **The UI stays decoupled from the wire format.** Widgets depend on `models.dart`, not on
  `blocks.blocks.dart`. The backend can evolve behind the mapper.

**The generated client is a compile-time contract for the client too — prove it (1 min):**
in `_character()`, change one field read from `value.classKey` to `value.classKeys` (a
name that doesn't exist) and run `flutter analyze`. The analyzer points at that exact line:
*The getter 'classKeys' isn't defined for the type 'GetCharacterResult'.* You never ran the
app, never hit the backend — the spec caught a rename statically, on the Dart side. Now
revert it and confirm `flutter analyze` is clean again. That is the same safety the
backend's Zod schema gives the server, extended all the way into your Flutter code: change
the schema, regenerate, and the analyzer walks you to every read that needs updating.

---

## Checklist

- [ ] `npm run typecheck` and `flutter analyze` both pass.
- [ ] Saving a hero writes a file under `backend/.bb-data/tt-characters/`.
- [ ] The hero survives a backend restart (sign in → still there, character select
      skipped).
- [ ] `flutter test` passes.

## What you learned

- `DistributedTable` = schema-validated NoSQL, keyed access, no server or table
  setup.
- A **Zod schema** validates writes _and_ drives the generated Dart type via the
  spec — one source of truth from TypeScript through to Flutter.
- Local `.bb-data/` files stand in for DynamoDB; the code is identical either way —
  which is why "works locally" is a real signal.
- The Flutter repository maps generated result types into immutable domain models,
  keeping the UI layer decoupled from the wire format.

## Troubleshooting

- **Stale generated types / missing fields** — regenerate:
  ```bash
  cd backend
  npx blocks-generate-spec aws-blocks/index.ts ../lib/blocks.spec.json
  cd ..
  dart run build_runner build --delete-conflicting-outputs
  ```
- **Old hero keeps loading / stale data** — `rm -rf backend/.bb-data` to reset
  local tables, then restart the backend.
- **Android emulator can't reach backend** — confirm `10.0.2.2` mapping in
  `lib/data/services/blocks_api_url_io.dart`. Physical devices need
  `--dart-define=BLOCKS_API_URL=http://LAN_IP:3001/aws-blocks/api`.
- **Port 3001 clash** — stop the React workshop backend; both default to `:3001`.

---

**Next:** Module 04 — Guild Hall lobby — a `DistributedTable` with a **GSI**, and
the "constant partition key" trick for listing all rows without a full-table scan.
