# Module 01 — Scaffold Blocks & Generate the Dart Client

**Goal:** scaffold the Blocks backend beside the Flutter app, drop in the game's mock
backend, generate the first typed Dart client, run the game, and learn the map of
mocks you'll replace over the next modules.

**Block introduced:** `Scope`, `ApiNamespace`

**You edit:** `app/backend/aws-blocks/index.ts` (created this module)

**You'll know you're done when:** you've played a full turn against the mocks on Flutter and the `curl` to `api.getConstants` returns scenarios, DM types, and class
metadata.

---

## Concept

An AWS Blocks backend is **one TypeScript file whose `export`s define a typed API** —
no routes, no controllers. `Scope` namespaces every resource; `ApiNamespace` publishes
methods the client can call. 

The mobile side's toolchain turns these exports into an
OpenRPC spec, then into type-safe Dart with zero manual wiring.

Two primitives worth understanding now:

- **`Scope("tt")`** — prefixes every resource name. Short ids keep Realtime channel paths, logs, and URLs readable.
- **`ApiNamespace`** — wraps an object of async functions into an API surface. Every top-level `export` of an `ApiNamespace` becomes a callable method on the generated client.

## Steps

### 1. Create the backend

From the workshop root:

```bash
cd app
mkdir backend
cd backend
npm create @aws-blocks/blocks-app@latest . -- --template backend
```

Answer **`y`** when prompted. The CLI creates `aws-blocks/`, `cdk.json`, and a
`package.json` with dev scripts.

### 2. Copy the game's mock checkpoint

The scaffolder generates a generic starter — useful scaffolding, but not our game.
Replace it with this module's checkpoint (run from `app/backend/`):

```bash
cp ../../01-scaffold/solution/index.ts          aws-blocks/index.ts
cp ../../01-scaffold/solution/index.handler.ts  aws-blocks/index.handler.ts
cp ../../01-scaffold/solution/server.ts         aws-blocks/scripts/server.ts
rm test/e2e.test.ts                             # see problem ④
npm install
```

Four problems might trip you up if you skip copying these files:

- **① Lambda handler form.** The scaffolder emits `createLambdaHandler(backend)`, but
  the library expects the lazy factory
  `createLambdaHandler(() => import('./index.js'))`. Our `index.handler.ts` uses the
  working form.
- **② Dev server topology.** This workshop uses the **split** model — backend on
  `:3001`, Flutter app calling it directly — because the session cookie goes to the
  API origin and there is no Vite proxy. Our `server.ts` sets `port: 3001`.
- **③ `typescript` must be a dependency.** The dev server needs it at runtime. If you
  ever see `Cannot find package 'typescript'`, run `npm i -D typescript`.
- **④ Delete the template's demo test.** The `backend` template ships
  `test/e2e.test.ts`, which calls a `greet()` method that only exists in the template
  — and its `tsconfig.json` includes `test/**/*`. Leave it in place and
  `npm run typecheck` fails with `Property 'greet' does not exist` in **every** module,
  even though your backend is fine.

### 3. Generate the Flutter API

Run from `app/backend/` (that is where `npm install` put the `blocks-generate-spec`
binary — from another directory `npx` can't find it locally and tries to download a
package by that name from npm, which does not exist):

```bash
cd app/backend   # skip if you are already here from step 2
npx blocks-generate-spec aws-blocks/index.ts ../lib/blocks.spec.json
cd ..            # now in app/
flutter pub get
dart run build_runner build --delete-conflicting-outputs
flutter analyze
```

Inspect `lib/blocks.blocks.dart`: you'll see `Blocks.api` and `Blocks.authApi` with
fully typed methods generated from the backend exports.

### 4. Run

Terminal one (backend):

```bash
cd app/backend
npm run dev
```

Terminal two (Flutter):

```bash
cd app
flutter run -d macos
```

Use `-d chrome` for web, or an Android emulator. The app maps Android localhost
to `10.0.2.2` automatically (see `lib/data/services/blocks_api_url_io.dart`).

You're signed in automatically (mock auth), so you land on character select. Pick a
hero → **Enter Guild Hall** → **Launch New Adventure** → take a turn. You just played
a complete multiplayer-style RPG with **no AWS account and no AI model** — everything
is faked in one file.

### 5. The map of mocks

Open `app/backend/aws-blocks/index.ts`. Everything between the constants and the API
exports is faked in-memory, and each fake is labelled with the module that replaces it:

| Mock (in `index.ts`)                                | What it fakes                  | Becomes                  | Module |
| --------------------------------------------------- | ------------------------------ | ------------------------ | ------ |
| `fakeAuthApi` / `requireAuth()`                     | a single always-signed-in user | `AuthBasic`              | 02     |
| `characterStore` (Map)                              | your saved hero                | `DistributedTable`       | 03     |
| `gameStore` (Map)                                   | the lobby list                 | `DistributedTable` + GSI | 04     |
| `gameStateStore` / `chatStore` (Maps)               | game state + chat transcript   | `DistributedTable`       | 05     |
| `fakeChannel()` / `publish()`                       | live updates (they no-op)      | `Realtime`               | 06     |
| `cannedNarration` / `nextScene` / `companionDecide` | the "AI"                       | `Agent` (× party)        | 07–08  |

Two design choices to internalise:

- **The Flutter app already tolerates missing realtime.** Subscriptions are wrapped in
  try/catch with polling fallback. That's why `fakeChannel()` yields a playable game.
- **The mock function shapes match the real Blocks.** Each module swaps the
  implementation behind the same shape, so the generated Dart client (and thus the
  Flutter UI) never changes.

## Verify

Prove the backend pipeline works directly:

```bash
curl -s -X POST http://localhost:3001/aws-blocks/api \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"api.getConstants","params":[],"id":1}'
```

You get back scenarios, DM types, and class metadata.

Flutter side:

```bash
flutter analyze    # zero issues
flutter test       # all tests pass
```

---

## Checklist

- [ ] `npm create @aws-blocks/blocks-app@latest . -- --template backend` scaffolded
      `backend/aws-blocks/` (answered `y`).
- [ ] You copied `index.ts`, `index.handler.ts`, and `server.ts` from
      `../../01-scaffold/solution/`.
- [ ] `dart run build_runner build` succeeded and `lib/blocks.blocks.dart` exists.
- [ ] `npm run dev` + `flutter run` runs; you played a full turn.
- [ ] The `curl` to `api.getConstants` returns scenarios/dmTypes/classMeta.

## What you learned

- `create-blocks-app` with `--template backend` scaffolds a standalone Blocks
  backend suitable for native clients that don't share the same build toolchain.
- The native-client loop (`blocks-generate-spec` → `build_runner` → `analyze` →
  `test`) is how every backend change reaches Flutter — the spec is the typed
  contract between the two.
- The starter is deliberately all-mocks so it runs instantly, and the mocks are the
  workshop's to-do list.

## Troubleshooting

- **`tsc` error on `index.handler.ts` (`createLambdaHandler`)** — you kept the
  scaffolder's handler; copy ours (gotcha ①, the lazy-factory form).
- **Port 3001 already in use** — the React workshop's backend also defaults to
  `:3001`. Stop it before running this one; the two apps do not share data.
- **Android can't reach backend** — the emulator maps `10.0.2.2` to your host's
  `localhost`. Physical devices need `--dart-define=BLOCKS_API_URL=http://LAN_IP:3001/aws-blocks/api`.
- **`Cannot find package 'typescript'`** — `npm i -D typescript`.
- **Stale generated types / missing methods** — regenerate:
  ```bash
  cd backend
  npx blocks-generate-spec aws-blocks/index.ts ../lib/blocks.spec.json
  cd ..
  dart run build_runner build --delete-conflicting-outputs
  ```

---

**Next:** [Module 02 — Auth](../02-auth/) — replace `fakeAuth` with real `AuthBasic`
username/password sessions.
