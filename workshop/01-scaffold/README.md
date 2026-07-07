# Module 01 — Scaffold with `create-blocks-app` & meet the mock backend

**Goal:** scaffold the Blocks backend into the frontend-only starter using the official
CLI, drop in the game's mock backend, run it, and learn the map of mocks you'll replace
over the next modules.

**Blocks introduced:** `Scope`, `ApiNamespace`
**You'll know you're done when:** you've played a full turn against the mocks and can point
to the exact lines that fake auth, data, realtime, and AI.

---

## Why you scaffold instead of getting an `aws-blocks/` folder

The starter [`app/`](../app/) ships **frontend-only** — the React game, but _no_
`aws-blocks/` backend. That's deliberate: you're going to generate the backend the same
way you would for any real project, with the official scaffolder. (The CLI actually
**refuses to run** if an `aws-blocks/` folder already exists — _"Aborting to avoid
overwriting"_ — so a pre-made backend would block the very command this module teaches.)

## 1. Scaffold the backend into the app

```bash
cd app
npm create @aws-blocks/blocks-app@latest . -- --template react
```

The `.` means "add Blocks to _this_ existing project." The CLI detects the existing
`package.json` and prompts:

```
This will add AWS Blocks backend to your project:
  CREATE  aws-blocks/    CREATE  cdk.json
  MODIFY  package.json   MODIFY  .gitignore
Proceed? (y/N)
```

Type **`y`**. It's surgical — it creates `aws-blocks/` + `cdk.json`, merges the Blocks
deps and `sandbox`/`deploy`/`dev:server` scripts into your `package.json`, and adds
`.gitignore` entries. It does **not** touch your `src/`, `vite.config.js`, or
`tsconfig.json`.

> ⚠️ Always run the scaffolder on a **clean git tree** so you can `git diff` its changes
> and restore anything you want to keep. On existing repos it can reset root-config fields;
> here it only merges, but check the diff regardless.

The generated `aws-blocks/index.ts` is a **to-do app** — a fine Blocks demo, but not our
game. You'll replace it next.

## 2. Drop in the game's mock backend

This module's folder ships the game's backend + two glue files. Copy them over the
scaffolder's output (run from `app/`):

```bash
cp ../01-scaffold/index.ts          aws-blocks/index.ts          # the game (mock backend)
cp ../01-scaffold/index.handler.ts  aws-blocks/index.handler.ts  # see gotcha ①
cp ../01-scaffold/server.ts         aws-blocks/scripts/server.ts # see gotcha ②
```

> If you run `npm run dev` **before** these steps, you won't get a cryptic error — the
> starter's `predev` guard detects the missing backend and prints exactly which commands
> to run. (The starter already ships `dev`/`dev:server`/`tsx`, so those work the moment
> `aws-blocks/scripts/server.ts` exists.)

Three things that will trip you up if you skip them — all verified against
`@aws-blocks/blocks@0.2.0`:

- **① Lambda handler form.** The scaffolder emits `createLambdaHandler(backend)`, but the
  installed library expects the **lazy factory** `createLambdaHandler(() => import('./index.js'))`.
  The direct form fails `tsc`. Our `index.handler.ts` uses the working form.
- **② Dev server topology.** The `react` template's `server.ts` runs a _combined_ server
  (it spawns Vite itself on one origin). This workshop uses the **split** model — backend
  on `:3001`, Vite on `:3000` with a proxy (see `vite.config.js`) — because it keeps the
  auth cookie same-origin and matches every later module. Our `server.ts` sets `port: 3001`.
- **③ `typescript` must be a dependency.** The dev server needs it at runtime. The starter's
  `package.json` already includes it; if you ever see `Cannot find package 'typescript'`,
  run `npm i -D typescript`.

## 3. Install and run

```bash
npm install
npm run dev        # backend → :3001, client → :3000 (concurrently)
```

Open **http://localhost:3000**. You're signed in automatically (mock auth), so you land on
character select. Pick a hero → **Enter Guild Hall** → **Launch New Adventure** (leave
"Fill with AI companions" selected) → take a turn.

You just played a complete multiplayer-style RPG — authoritative dice, a narrating DM, AI
companions — with **no AWS account and no AI model**. Everything is faked in one file. The
rest of the workshop makes each fake real.

## 4. The one real Block: `Scope` + `ApiNamespace`

Open **`aws-blocks/index.ts`**. The top is already "real" AWS Blocks:

```ts
import { ApiNamespace, Scope } from "@aws-blocks/blocks";
const scope = new Scope("tt"); // namespaces every resource this app creates
```

At the very bottom, two exports define the whole API surface:

```ts
export const authApi = new ApiNamespace(
  scope,
  "authApi",
  (context) => fakeAuthApi,
);
export const api = new ApiNamespace(scope, "api", (context) => ({
  async getConstants() {
    /* ... */
  },
  async takeAction(gameId, action) {
    /* ... */
  },
  // ...
}));
```

Three rules that hold for the entire workshop:

1. **Every top-level `export` becomes an API namespace.** The frontend calls
   `api.takeAction(...)` and `authApi.setAuthState(...)` as fully-typed RPC. Constants and
   helpers are _not_ exported — they're plain `const`/`function`.
2. **The typed client is generated.** Running `npm run dev` reads your exports and writes
   `aws-blocks/client.js` (the module the frontend imports as `aws-blocks`). **Never edit
   `client.js`** — regenerate it by running dev after you change exports.
3. **`context`** carries the request. Real auth reads the session cookie off it; the mock
   ignores it. It becomes load-bearing in module 02.

> **Why `"tt"`?** Scope ids prefix resource names, and AppSync (the Realtime backend in
> module 06) caps namespace names at 50 chars. Short ids keep you clear of that.

Prove the pipeline works — call a method directly:

```bash
curl -s -X POST http://localhost:3001/aws-blocks/api \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"api.getConstants","params":[],"id":1}'
```

You get back the scenarios, DM types, and class metadata. **All RPC — both `api.*` and
`authApi.*` — POSTs to the single `/aws-blocks/api` endpoint;** the namespace is the part
of the method name before the dot.

## 5. The map of mocks

Everything between the constants and the API is faked in-memory, and each fake is labelled
with the module that replaces it. Skim these in `index.ts`:

| Mock (in `index.ts`)                                | What it fakes                  | Becomes                  | Module |
| --------------------------------------------------- | ------------------------------ | ------------------------ | ------ |
| `fakeAuthApi` / `requireAuth()`                     | a single always-signed-in user | `AuthBasic`              | 02     |
| `characterStore` (Map)                              | your saved hero                | `DistributedTable`       | 03     |
| `gameStore` (Map)                                   | the lobby list                 | `DistributedTable` + GSI | 04     |
| `gameStateStore` / `chatStore` (Maps)               | game state + chat transcript   | `DistributedTable`       | 05     |
| `fakeChannel()` / `publish()`                       | live updates (they no-op)      | `Realtime`               | 06     |
| `cannedNarration` / `nextScene` / `companionDecide` | the "AI"                       | `Agent` (× party)        | 07–08  |

Two design choices worth internalizing now, because they're _why_ the mocks are safe:

- **The frontend already tolerates missing realtime.** `GameRoom.jsx` wraps every
  `channel.subscribe(...)` in `try/catch` and falls back to polling `getState`. That's why
  `fakeChannel()` (which never pushes) still yields a playable game — and why module 06 is
  a drop-in upgrade, not a frontend rewrite.
- **The mock function _shapes_ match the real Blocks.** `requireAuth()` returns a user like
  `auth.requireAuth(context)` will; the stores expose get/set like a `DistributedTable`
  will. Each module swaps the _implementation_ behind the same shape, so the API methods
  and the frontend never change.

## 6. The dev loop you'll repeat every module

```bash
npm run typecheck   # after ANY edit to aws-blocks/index.ts — do this first
# (dev server auto-restarts; if a new export doesn't appear, restart `npm run dev` once)
curl ...            # hit the method to confirm the backend behaves
# then use the UI at http://localhost:3000
```

**Backend must typecheck clean before you touch the frontend.**

---

## Checklist

- [ ] `npm create @aws-blocks/blocks-app@latest . -- --template react` scaffolded
      `aws-blocks/` (answered `y`).
- [ ] You copied `index.ts`, `index.handler.ts`, and `server.ts` from `../01-scaffold/`.
- [ ] `npm run dev` runs; you played a full turn at http://localhost:3000.
- [ ] The `curl` to `api.getConstants` returns scenarios/dmTypes/classMeta.
- [ ] You can point to `fakeAuthApi`, `characterStore`, `fakeChannel`, and
      `cannedNarration` in `index.ts` and say which module replaces each.

## What you learned

- `create-blocks-app` scaffolds the Blocks backend into any project with one command; it
  won't clobber an existing `aws-blocks/`, and on an existing repo it merges rather than
  resets.
- An AWS Blocks backend is one file whose **exports define a typed API** — no routes, no
  controllers. `Scope` + `ApiNamespace` are the substrate; the client is generated from
  your exports.
- The starter is deliberately all-mocks so it runs instantly, and the mocks are the
  workshop's to-do list.

## Troubleshooting

- **CLI says "aws-blocks/ already exists. Aborting."** — you already scaffolded (or copied
  a backend in). Delete `aws-blocks/` first, or just proceed with what's there.
- **`tsc` error on `index.handler.ts` (`createLambdaHandler`)** — you kept the scaffolder's
  handler; copy ours (gotcha ①, the lazy-factory form).
- **Frontend loads on `:3000` but the API 404s / server is on `:3000`** — you kept the
  template's combined `server.ts`; copy ours (gotcha ②, `port: 3001`).
- **`Cannot find package 'typescript'`** — `npm i -D typescript` (gotcha ③).

---

**Next:** [Module 02 — Auth](../02-auth/) — replace `fakeAuth` with real `AuthBasic`
username/password sessions.
