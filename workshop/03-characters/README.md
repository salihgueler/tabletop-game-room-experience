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
(optionally a sort key) and secondary indexes. Locally it persists to JSON under
`.bb-data/`; deployed it's DynamoDB — same API either way. You define the shape with a
**Zod schema** (validated on every write) and read/write by key:

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

   ```ts
   import {
     ApiNamespace,
     Scope,
     AuthBasic,
     DistributedTable,
   } from "@aws-blocks/blocks";
   import { z } from "zod";

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

2. **Delete `const characterStore = new Map(...)`** from the persistence mock block
   (leave `gameStore` / `gameStateStore` / `chatStore` — those are modules 04–05).

3. **Derive the type from the schema** so there's one source of truth:

   ```ts
   type Character = z.infer<typeof characterSchema>;
   ```

4. **Swap the call sites** (async now — tables return Promises):

   | before (Map)                                                            | after (DistributedTable)                                    |
   | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
   | `characterStore.set(user.username, character)`                          | `await characters.put(character)`                           |
   | `characterStore.get(user.username) ?? null`                             | `(await characters.get({ userId: user.username })) ?? null` |
   | `characterStore.get(user.username)` _(in createGame/joinGame/sendChat)_ | `await characters.get({ userId: user.username })`           |

5. **Verify:**

   ```bash
   npm run typecheck
   npm run dev
   ```

   Play through character select, then confirm persistence directly:

   ```bash
   ls app/.bb-data/tt-characters/    # your hero is now a file on disk
   ```

   Or read the hero back through the API. `getCharacter` now requires a session, so sign in
   first (saving the cookie), then call it with that cookie:

   ```bash
   # 1) sign in, saving the session cookie to cookies.txt
   curl -s -c cookies.txt -X POST http://localhost:3001/aws-blocks/api \
     -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","method":"authApi.setAuthState","params":[{"action":"signIn","username":"aldric","password":"password123"}],"id":1}'

   # 2) fetch the saved hero using the cookie
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

Catch up / start clean by copying this folder's solution:

```bash
cp ../03-characters/solution/index.ts app/aws-blocks/index.ts   # from workshop/
```

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
