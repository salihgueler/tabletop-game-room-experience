# Module 03 — Characters (`characterStore` Map → `DistributedTable`)

**Goal:** persist the player's hero in a real, schema-validated NoSQL table instead of an
in-memory Map — so it survives a server restart.

**Block introduced:** `DistributedTable`
**You edit:** `app/aws-blocks/index.ts`
**You'll know you're done when:** you save a hero, restart `npm run dev`, sign back in,
and your hero is still there.

---

## Concept

`DistributedTable` is the default data Block: structured items with a partition key
(the primary lookup key for an item — think of it like the key in a JavaScript `Map`, the
one value you must supply to fetch a row) (optionally a sort key) and secondary indexes.
Locally it persists to JSON under `.bb-data/`; deployed it's DynamoDB (a NoSQL database).
You define the shape with a **Zod schema** (Zod is a runtime schema validator whose
TypeScript type is inferred from the same definition, so one declaration both checks data
at runtime and types it at compile time; validated on every write) and read/write by key:

```ts
const characters = new DistributedTable(scope, "characters", {
  schema: characterSchema, // validates every put()
  key: { partitionKey: "userId" }, // one hero per account
});

await characters.put(character); // write
await characters.get({ userId: "aldric" }); // read by key → item | undefined
```

Characters are the simplest case: one item per user, always fetched by `userId`. No sort
key, no index. (The lobby in module 04 needs an index — that's the next lesson.)

## Steps

1. **Import the block and Zod**, and add the schema + table near the top:

   These two imports are the whole toolkit for this module: `DistributedTable` is the
   persistence Block, and `z` is Zod's builder. Reaching for a validation library the moment
   you touch stored data will feel familiar — it's the server-side equivalent of validating a
   form with Zod, Yup, or `io-ts` before you trust the payload. The payoff is that one Zod
   object becomes both the runtime guard on every write *and* the TypeScript type you code
   against (step 4), so the shape can't drift between "what the compiler thinks" and "what the
   database accepts."

   ```ts
   import {
     ApiNamespace,
     Scope,
     AuthBasic,
     DistributedTable,
   } from "@aws-blocks/blocks";

   import { z } from "zod";
   ```

2. Add the character schema and character table.

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

3. Delete **`const characterStore = new Map<string, Character>();`** from the persistence mock block
   (leave `gameStore` / `gameStateStore` / `chatStore` — those are modules 04–05).

4. Replace the `Character` current type, and **use the type from the schema** so there's one source of truth (`z.infer<typeof schema>` extracts the static TypeScript type from a Zod schema, so you write the shape once and get the type for free):

   ```ts
   type Character = z.infer<typeof characterSchema>;
   ```

5. **Swap the call sites** (async now — tables return Promises):

   | before (Map)                                                                         | after (DistributedTable)                                    |
   | ------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
   | `characterStore.set(user.username, character)` - in saveCharacter function           | `await characters.put(character)`                           |
   | `characterStore.get(user.username) ?? null` - in getCharacter function               | `(await characters.get({ userId: user.username })) ?? null` |
   | `characterStore.get(user.username)` - in createGame, joinGame and sendChat functions | `await characters.get({ userId: user.username })`           |

6. **Verify:**
   You are proving the one thing a `Map` could never do: that a hero outlives the process.
   Save one, restart the dev server, and sign in again — if it's still there, the write landed
   in a real table on disk.

   ```bash
   npm run typecheck
   npm run dev
   ```

   Play through character select, then confirm persistence directly:

   ```bash
   ls .bb-data/tt-characters/    # your hero is now a file on disk
   ```

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

   On Windows (cmd.exe), one line each with escaped quotes:

   ```cmd
   curl -s -c cookies.txt -X POST http://localhost:3001/aws-blocks/api -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"method\":\"authApi.setAuthState\",\"params\":[{\"action\":\"signIn\",\"username\":\"aldric\",\"password\":\"password123\"}],\"id\":1}"

   curl -s -b cookies.txt -X POST http://localhost:3001/aws-blocks/api -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"method\":\"api.getCharacter\",\"params\":[],\"id\":1}"
   ```

   > Replace `aldric` / `password123` with the account you registered. In PowerShell use
   > `curl.exe`. The `-c` flag writes the cookie jar, `-b` reuses it on the next call.

   Now the real test: stop `npm run dev`, start it again, sign in as the **same** user —
   your character loads without re-picking. (In the starter it would have been wiped.)

Catch up / start clean by copying this folder's solution from `workshop/app/`:

```bash
cp ../03-characters/solution/index.ts aws-blocks/index.ts
```

---

### The React side

The schema you just wrote isn't arbitrary — it's the exact contract the character-select
screen already sends. Open `app/src/screens/Login.jsx` and find the `enter` handler (around
L23-28). On confirm it calls:

```js
const character = await api.saveCharacter({
  name: name.trim(),
  classKey: picked.classKey,
  spriteId: picked.id,
  sprite: picked.sprite,
})
```

Now put that beside the schema from step 2:

```ts
const characterSchema = z.object({
  userId: z.string(),   // ← added server-side from the session, NOT sent by the client
  name: z.string(),
  classKey: z.string(),
  spriteId: z.string(),
  sprite: z.string(),
})
```

Four fields line up one-to-one: `name`, `classKey`, `spriteId`, `sprite`. The client sends
exactly those; the schema validates exactly those. The fifth field, `userId`, is the
partition key — the backend stamps it from `user.username` (that's why `saveCharacter`
doesn't send it, and why one account owns exactly one hero). This is the contract made
literal: if `Login.jsx` ever sent a field the schema didn't allow, `characters.put(...)`
would throw at runtime instead of silently writing junk — the same guarantee you'd want
from validating a form payload before a `fetch`, except here it guards the write itself.

Where do `classKey`, `spriteId`, and `sprite` come from? `app/src/data/classes.js` defines
the five classes and flattens them into `ALL_CHARACTERS` — 20 pickable sprites, each an
`{ id, classKey, sprite, label }` record. `Login.jsx` renders that array as the picker
grid; the selected entry (`picked`) is what supplies `classKey`, `spriteId: picked.id`, and
`sprite`. So the journey of one hero is: a static record in `classes.js` → the player's
click sets `picked` in React state → `api.saveCharacter` ships four of its fields → your Zod
schema validates them → `DistributedTable.put` writes a `.bb-data/tt-characters/` file that
survives the restart you tested above.

---

## Checklist

- [ ] `npm run typecheck` passes.
- [ ] Saving a hero writes a file under `app/.bb-data/tt-characters/`.
- [ ] The hero survives a dev-server restart (sign in → still there).

## What you learned

- `DistributedTable` = schema-validated NoSQL, keyed access, no server or table setup.
- A **Zod schema** both validates writes and gives you the TypeScript type via `z.infer`.
- Local `.bb-data/` files stand in for DynamoDB; the code is identical either way — which
  is why "works locally" is a real signal (and why `rm -rf app/.bb-data` resets state).

## Troubleshooting

- **`Index 'x' not found`** — you won't hit this yet (no indexes here); it shows up in
  module 04. `get()` uses the key directly, not an index.
- **Old hero keeps loading / stale data** — `rm -rf app/.bb-data` to reset local tables.

---

**Next:** Module 04 — Guild Hall lobby — a `DistributedTable` with a **GSI**, and the
"constant partition key" trick for listing all rows without a full-table scan.
