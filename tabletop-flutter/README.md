# Adventurer's Guild Hall for Flutter

A standalone Flutter and AWS Blocks application. The Flutter client, Blocks
backend, generated API contract, local data, and deployment configuration all
live in this directory.

## Project layout

```text
tabletop-flutter/
├── aws-blocks/          # Auth, data, Realtime, Agents, API, and deployment
├── lib/                 # Flutter application and generated Dart client
├── .blocks/config.json  # Independent stack identity
├── package.json         # Backend, codegen, sandbox, and deploy commands
└── pubspec.yaml         # Flutter dependencies
```

## Features

- AuthBasic sign-in and registration
- Character creation with all 20 pixel sprites
- Public/private Guild Hall games
- Responsive game table, turn order, actions, chat, dice, and timer
- Realtime state/chat/thinking subscriptions with polling fallback
- Host-only AI companion turn stepping
- Android, iOS, macOS, and web targets

## Prerequisites

- Flutter 3.41+ and Dart 3.12+
- Node.js 22+ and npm 10+
- Chrome, an emulator, or a supported desktop toolchain for the chosen target
- Optional: Ollama for live local model inference
- Optional: AWS credentials and a bootstrapped CDK environment for deployment

No AWS account or model API key is needed for local development.

## Architecture

```text
Flutter UI
  -> ViewModels -> Repository -> generated Blocks RPC client
                                      |
                                      v
aws-blocks/index.ts
  -> AuthBasic
  -> DistributedTable (characters, games, state, chat)
  -> Realtime (state, chat, thinking)
  -> Agent (Dungeon Master and four companion personas)
```

The backend is authoritative. Flutter sends commands and renders returned
state; it does not roll dice, advance turns, or generate outcomes locally.

## Run locally

Install dependencies once:

```bash
cd tabletop-flutter
npm install
flutter pub get
```

Start this app's Blocks backend:

```bash
npm run dev
```

Then run Flutter from another terminal in the same directory:

```bash
flutter run -d chrome
```

Use `-d macos`, `-d ios`, or an Android device as needed. The default API is
`http://localhost:3001/aws-blocks/api`; Android emulators use `10.0.2.2`
automatically. Physical devices need a reachable host URL:

```bash
flutter run \
  --dart-define=BLOCKS_API_URL=http://YOUR_LAN_IP:3001/aws-blocks/api
```

The React backend also defaults to port `3001`. Stop it before starting this
app's backend; the two applications do not share services or data.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start this app's local Blocks backend on port 3001 |
| `npm run typecheck` | Type-check `aws-blocks/` |
| `npm run generate` | Regenerate the OpenRPC spec and formatted Dart bindings |
| `npm run verify` | Type-check, analyze, test, and build Flutter web |
| `dart run tool/blocks_chat_smoke.dart` | Test auth, history, and Realtime against a running backend |
| `npm run sandbox` | Deploy an isolated AWS sandbox |
| `npm run deploy` | Deploy the backend and Flutter web Hosting |

## Regenerate the typed client

After changing `aws-blocks/index.ts`, regenerate the spec and Dart client:

```bash
npm run generate
```

Never edit `lib/blocks.blocks.dart` by hand.

The generation path is:

```text
aws-blocks/index.ts
  -> lib/blocks.spec.json
  -> lib/blocks.blocks.dart
```

Commit the backend, spec, and generated Dart file together. API removals and
renames are breaking changes for the Flutter client.

## Verify

```bash
npm run verify
```

For an end-to-end local Blocks check, keep `npm run dev` running and execute:

```bash
dart run tool/blocks_chat_smoke.dart
```

## Local data

Local Blocks data belongs to this application and is stored in `.bb-data/`.
Deleting that directory resets local users, characters, games, and chat:

```bash
npm run cleanup
rm -rf .bb-data
```

Do not copy `.bb-data/` from `tabletop-app`; the applications have independent
scope IDs and contracts.

## AI behavior

The Dungeon Master and companion Agents use Ollama locally when available and
fall back to the Blocks canned provider offline. Deployed Agents use Amazon
Bedrock.

For live local inference:

```bash
ollama serve
ollama pull llama3.1:8b
```

Fixed or generic narration may indicate either the canned Agent provider or the
backend's deterministic safety fallback.

## Deploy

```bash
npm run sandbox          # deploy an isolated AWS sandbox
npm run sandbox:destroy  # remove the sandbox
npm run deploy           # deploy Blocks plus Flutter web Hosting
npm run destroy          # remove the production stack
```

Use the API URL printed by the sandbox when running Flutter locally:

```bash
flutter run -d chrome \
  --dart-define=BLOCKS_API_URL=https://YOUR_API/aws-blocks/api
```

Production Hosting builds Flutter with `flutter build web --release` and serves
`build/web` with the Blocks API on the same origin. Use the npm deployment
scripts rather than invoking CDK directly.

## Troubleshooting

- **Connection refused on port 3001:** start `npm run dev` in this directory.
- **Port 3001 is already in use:** stop the React backend or another local
  Blocks process.
- **Android cannot reach localhost:** use the emulator mapping, or provide a LAN
  URL through `BLOCKS_API_URL` for a physical device.
- **Generated API types are stale:** run `npm run generate`, then
  `npm run verify`.
- **Chat updates stop:** polling keeps state usable; restart the backend and run
  the chat smoke command to check the Realtime subscription.
- **Reset local accounts and games:** stop the backend, run `npm run cleanup`,
  then delete `.bb-data/`.

The app follows a UI/ViewModel/Repository/Service structure under `lib/`. Its
backend is independently namespaced with Blocks scope `tf` and stack ID
`tabletop-flutter`.
