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
npx blocks-generate-spec aws-blocks/index.ts ../lib/blocks.spec.json
cd ..            # now in app/
flutter pub get
dart run build_runner build --delete-conflicting-outputs
flutter analyze
```

Inspect `lib/blocks.blocks.dart`: you'll see `Blocks.api` and `Blocks.authApi` with
fully typed methods generated from the backend exports.

> **Don't use `npm run spec`.** The scaffolder writes that script as bare
> `blocks-generate-spec`, with no arguments. It finds `aws-blocks/index.ts` correctly, but
> writes the spec to `backend/aws-blocks/blocks.spec.json` — a stray file next to your
> backend code that the Flutter app never reads. It leaves `app/lib/blocks.spec.json`
> untouched, so `build_runner` regenerates from the old spec and your Dart client silently
> stays stale. Always pass the two paths explicitly, as above: the spec has to land in
> `app/lib/`, next to the Dart code that consumes it.

### 4. Run

Terminal one (backend):

```bash
cd backend # make sure you go to backend folder
npm run dev
```

Terminal two (Flutter):

```bash
cd app # make sure you go to app folder
flutter run -d chrome
```

> The app maps Android localhost to `10.0.2.2` automatically (see `lib/data/services/blocks_api_url_io.dart`).

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
```

### The Flutter side

You just ran `blocks-generate-spec` → `build_runner` and got `lib/blocks.blocks.dart`.
That file is the whole point of this module for a Flutter developer, so open it now and
read it — you never wrote a line of it, and you never will.

Open `app/lib/blocks.blocks.dart`. The very first line is your warning label:

```dart
// Generator: blocks-codegen
```

and just below it `// GENERATED CODE — DO NOT MODIFY BY HAND`. **Never hand-edit this
file.** Every backend change re-runs the generator and overwrites it; your edits vanish.
The way you "change" this file is to change `aws-blocks/index.ts` and regenerate.

Three things to find:

1. **`class Blocks` (around L2836).** This is your entry point. It exposes exactly two
   fields — one per top-level `export` namespace in the backend:

   ```dart
   late final ApiApi api;
   late final AuthApiApi authApi;
   ```

   That is the rule to internalise: **every `ApiNamespace` you `export` from the backend
   becomes one Api class on the Dart client.** `export const api = ...` → `Blocks.api`;
   `export const authApi = ...` → `Blocks.authApi`. No routes, no URLs, no manual wiring —
   the namespace name is the field name.

2. **`class ApiApi` (around L2102).** Every backend method is a typed Dart method here.
   Read `getCharacter`:

   ```dart
   Future<GetCharacterResult?> getCharacter() async { ... }
   ```

   The return type, the parameters, the nullability — all inferred from the TypeScript.
   `getState({required String gameId})` forces you to pass a `gameId`; forget it and the
   Dart analyzer stops you before the app ever runs. This is the payoff of the spec: the
   backend contract is a compile-time contract on the client too.

3. **A result type — `class GetCharacterResult` (around L1492).** One Dart class per
   backend return shape, with `fromJson`/`toJson` written for you. Its fields
   (`userId`, `name`, `classKey`, `spriteId`, `sprite`) are exactly the fields the backend
   returns.

**The `num` gotcha — the one thing that will bite you.** TypeScript has a single `number`
type, so the generator cannot tell an `int` from a `double`. It plays it safe and emits
**`num`**, not `int`. Look at `GetStateResult` (around L452): `hp`, `slot`, `turnIndex`,
`version` are all `final num`. That is why the repository you'll meet next module is full
of `.toInt()` calls — e.g. `hp: player.hp.toInt()` in `game_repository.dart`. Whenever a
backend number needs to be a Dart `int` (a list index, a widget count, a
`DateTime.fromMillisecondsSinceEpoch` argument), you call `.toInt()` yourself. Expect it;
it is not a bug.

You don't build a `Blocks` by hand — the app's service layer does — but knowing these
three shapes (namespace → Api class, method → typed method, return → result class) means
you can read any generated symbol the rest of the workshop throws at you.

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
- **Stale generated types / missing methods** — re-run the regeneration loop in step 3.

---

**Next:** [Module 02 — Auth](../02-auth/) — replace `fakeAuth` with real `AuthBasic`
username/password sessions.
