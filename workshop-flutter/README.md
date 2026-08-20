# Build a Multiplayer AI Game with Flutter and AWS Blocks — Workshop

Turn a **mock-backed** tabletop RPG into a real cloud application — one AWS
[Building Block](https://github.com/aws) at a time. The Flutter client uses
**generated Dart bindings** while all game rules, persistence, auth, realtime,
and AI stay in the TypeScript backend.

You start with [`app/`](app/): the **Adventurer's Guild Hall** game — a complete
Flutter frontend wired to typed RPC stubs. In Module 01 you scaffold a separate
`backend/` directory, drop in the mock game server, and generate your first Dart
client. Each subsequent module replaces one mock with a real AWS Block until the
whole thing runs on Auth, DynamoDB, WebSockets, Bedrock, and CloudFront — with
**no servers, containers, or IAM policies to hand-write**.

The finished standalone Flutter app lives in
[`../tabletop-flutter/`](../tabletop-flutter/).

---

## The model: one app, nine steps

**You work in a single project — [`app/`](app/) — the whole way through.** Set it
up once (Module 01: scaffold `backend/`, `npm install`, generate Dart). After that,
each module copies a new `solution/index.ts` into `app/backend/aws-blocks/`,
regenerates the contract, and rebuilds the typed Dart client. The Flutter UI never
changes — it already calls the methods; only the backend behind them evolves.

```text
workshop-flutter/
├─ README.md            ← you are here
├─ app/                 ← THE project: Flutter frontend + backend/ created in Module 01
│  ├─ lib/              ← Flutter app (you rarely touch this)
│  │  ├─ blocks.spec.json       ← generated OpenRPC contract
│  │  └─ blocks.blocks.dart     ← generated typed Dart client
│  ├─ backend/          ← Node/TypeScript — created by Module 01's scaffold step
│  │  └─ aws-blocks/index.ts    ← the ONE file you edit each module
│  └─ pubspec.yaml
└─ 01-scaffold/ … 09-deploy/
   └─ README.md         ← concepts, steps, verification — PLUS the changed backend
                          file(s) so you can diff / catch up
```

`app/` ships **without a `backend/` folder** on purpose — Module 01 generates it
with the official CLI. From Module 02 on, each module folder holds its guide
(`README.md`) and the checkpoint `solution/index.ts`. If you fall behind or want to
jump ahead, copy that module's solution into `app/backend/aws-blocks/index.ts`,
regenerate the Dart client, and keep going.

## Why the starter is all mocks

The backend you scaffold in Module 01 is a single file where auth, data, real-time,
and AI are faked in-memory. That's deliberate:

- **It runs instantly** — no AWS account, no API keys, no model downloads. Once
  scaffolded and generated, `npm run dev` + `flutter run` and you're playing a full
  game (solo, vs. canned AI companions).
- **The seams are the syllabus.** Each mock is clearly labelled with the module that
  replaces it (`// MOCK: auth (Module 02 → AuthBasic)`). Your job each module is to
  delete one mock and wire in the real Block behind the _same_ function shape — so
  the Flutter frontend never changes and you see exactly what a Block gives you over
  a hand-roll.

## What you'll build

A 16-bit pixel-art game room: sign in, forge a hero, gather a party in a lobby, and
play a turn-based dungeon crawl narrated by an **AI Dungeon Master** with **AI
companions** — server-authoritative, real-time-synced across players, running on
Flutter (macOS, web, Android, iOS).

## Modules

Work through them in order. Each is a runnable checkpoint.

| #   | Module                                           | Mock replaced                       | Block introduced         |
| --- | ------------------------------------------------ | ----------------------------------- | ------------------------ |
| 01  | [Scaffold & generate Dart client](01-scaffold/)  | — (setup)                           | `Scope`, `ApiNamespace`  |
| 02  | [Auth](02-auth/)                                 | `fakeAuth`                          | `AuthBasic`              |
| 03  | [Characters](03-characters/)                     | `characterStore` Map                | `DistributedTable`       |
| 04  | [Guild Hall lobby](04-lobby/)                    | `gameStore` Map                     | `DistributedTable` + GSI |
| 05  | [Game state & chat (turn engine)](05-state/)     | `gameStateStore` / `chatStore` Maps | `DistributedTable`       |
| 06  | [Realtime](06-realtime/)                         | `fakeChannel` / `publish`           | `Realtime`               |
| 07  | [AI Dungeon Master](07-ai-dm/)                   | `narrate` / `nextScene`             | `Agent`                  |
| 08  | [AI companions](08-companions/)                  | `companionDecide`                   | `Agent` × party          |
| 09  | [Deploy](09-deploy/)                             | —                                   | CDK `Hosting`            |

## Prerequisites

- **Flutter 3.41+** and **Dart 3.12+** (`flutter --version`)
- **Node.js ≥ 22** and **npm ≥ 10** (`node -v`, `npm -v`)
- A Dart/Flutter-aware editor (VS Code with Flutter extension recommended)
- _(Module 07+ only, optional)_ [Ollama](https://ollama.com) for real local AI.
  Without it the game keeps using the canned provider and stays fully playable.
- _(Module 09 only)_ An AWS account with credentials configured and CDK
  bootstrapped.

## The native-client loop

This is the regeneration cycle you repeat after every backend API/schema change:

```bash
cd app/backend
npx blocks-generate-spec aws-blocks/index.ts ../lib/blocks.spec.json
cd ..
dart run build_runner build --delete-conflicting-outputs
flutter analyze
flutter test
```

Three rules:

1. **The spec is the contract.** `blocks.spec.json` is generated from the
   TypeScript backend's exports; it defines the RPC surface the Dart client sees.
2. **Commit spec + generated Dart together.** `blocks.spec.json` and
   `blocks.blocks.dart` are a pair. Never hand-edit `blocks.blocks.dart` — it's
   regenerated from the spec by `build_runner`.
3. **Never hand-edit `blocks.blocks.dart`.** If types look wrong, fix the
   backend, regenerate, and rebuild.

## Independence

This workshop is independent from both finished applications. It does not edit
`../tabletop-flutter/aws-blocks/` or `../tabletop-app/aws-blocks/`, and its local
accounts and game data are separate. The scopes, stacks, and `.bb-data/` are
isolated — you can run all three simultaneously (just not on the same port).

## Get started

Head straight to **[Module 01](01-scaffold/)** — it walks you through scaffolding
the backend, generating the Dart client, and running your first turn:

```bash
cd app
mkdir backend && cd backend
npm create @aws-blocks/blocks-app@latest . -- --template backend
# copy the game backend from ../../01-scaffold/ (see Module 01), then:
npm install
npx blocks-generate-spec aws-blocks/index.ts ../lib/blocks.spec.json
cd ..
flutter pub get
dart run build_runner build --delete-conflicting-outputs
# Terminal 1: cd backend && npm run dev
# Terminal 2: flutter run -d macos
```

## Conventions (true for every module)

- **Only edit `backend/aws-blocks/index.ts`** for backend logic. `index.cdk.ts`,
  `index.handler.ts`, and `client.js` are generated — never hand-edit them.
- **Every top-level `export` becomes an API namespace.** The typed Dart client
  (`blocks.blocks.dart`) is generated from those exports via the spec.
- **Verify the backend before the frontend:** `npm run typecheck` → dev server →
  `curl` the method → then use the Flutter app.
- **Reset local state** any time with `rm -rf app/backend/.bb-data` (real Blocks
  persist there locally from module 03 on).
- **Android emulators** use `10.0.2.2` instead of `localhost` automatically (see
  `lib/data/services/blocks_api_url_io.dart`). Physical devices need:
  ```bash
  flutter run --dart-define=BLOCKS_API_URL=http://YOUR_LAN_IP:3001/aws-blocks/api
  ```
