# Build a Multiplayer AI Game with Flutter and AWS Blocks

Turn a mock-backed tabletop RPG into a cloud application one AWS Block at a
time. The Flutter app uses generated Dart bindings, while all game rules,
persistence, auth, realtime, and AI stay in the TypeScript backend.

## Shape of the workshop

```text
workshop-flutter/
├── app/                 Workshop Flutter app; backend is created in Module 01
├── 01-scaffold/         Scope + ApiNamespace
├── 02-auth/             AuthBasic
├── 03-characters/       DistributedTable
├── 04-lobby/            DistributedTable + GSI
├── 05-state/            authoritative state and chat
├── 06-realtime/         typed realtime streams
├── 07-ai-dm/            Agent-powered Dungeon Master
├── 08-companions/       one Agent per companion class
└── 09-deploy/           sandbox, Flutter web, Hosting
```

You work in one project, `app/`. Module 01 creates `app/backend/`. Every module
copies or edits one backend checkpoint, regenerates the OpenRPC contract, and
rebuilds `app/lib/blocks.blocks.dart`.

This workshop is independent from both finished applications. It does not edit
`../tabletop-flutter/aws-blocks/` or `../tabletop-app/aws-blocks/`, and its local
accounts and game data are separate. The completed standalone Flutter app is
available at [`../tabletop-flutter/`](../tabletop-flutter/).

## Prerequisites

- Flutter 3.41+ / Dart 3.12+
- Node.js 22+ and npm 10+
- Optional: Ollama for live local AI in modules 07-08
- Optional: AWS credentials and a bootstrapped CDK account for module 09

## The native-client loop

Run this after every backend API/schema change:

```bash
cd app/backend
npx blocks-generate-spec aws-blocks/index.ts ../lib/blocks.spec.json
cd ..
dart run build_runner build --delete-conflicting-outputs
flutter analyze
flutter test
```

The spec is the contract. Commit it and the generated Dart file. Never edit the
generated file.

Start with [Module 01](01-scaffold/README.md).
