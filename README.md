# Tabletop Game Room Experience

A 16-bit pixel-art tabletop RPG room. Sign in, forge a hero, browse, create, or
join campaigns in the Guild Hall, then play a turn-based session with a
four-seat party, an **AI Dungeon Master**, and AI companions.

The repository contains separate React and Flutter applications. Each finished
app owns its own AWS Blocks backend, local data, generated client contract, and
deployment configuration. Their clients are thin typed RPC and Realtime
consumers; game rules, persistence, auth, and AI stay server-side.

## Repository layout

```text
.
├─ tabletop-app/      # Standalone React SPA and Blocks backend
├─ tabletop-flutter/  # Standalone Flutter app and Blocks backend
├─ workshop/          # React + Blocks workshop
├─ workshop-flutter/  # Flutter + Blocks workshop
├─ designs/           # Architecture diagram and product mockups
├─ .kiro/steering/    # Repository engineering guidance
└─ README.md
```

## Choose a project

| Project | Use it for | Start here |
| --- | --- | --- |
| React app | Running or developing the browser application | [`tabletop-app/README.md`](tabletop-app/README.md) |
| Flutter app | Running or developing the independent native/web application | [`tabletop-flutter/README.md`](tabletop-flutter/README.md) |
| Flutter workshop | Building a Flutter client and Blocks backend module by module | [`workshop-flutter/README.md`](workshop-flutter/README.md) |
| React workshop | Building the original browser version module by module | [`workshop/README.md`](workshop/README.md) |

The React and Flutter backends both default to port `3001`; run only one locally
at a time. They use different Blocks scopes and `.bb-data` directories, so
accounts, games, and chat are not shared.

## React quick start

Requires Node.js 20+ and npm 10+.

```bash
cd tabletop-app
npm install
npm run dev        # client → http://localhost:3000, backend → http://localhost:3001
```

## Flutter quick start

Requires Flutter 3.41+, Dart 3.12+, Node.js 22+, and npm 10+.

```bash
cd tabletop-flutter
npm install
flutter pub get
npm run dev        # Blocks backend → http://localhost:3001
```

In another terminal, from `tabletop-flutter/`:

```bash
flutter run -d chrome
```

No AWS account is needed locally. Blocks uses local service implementations and
persists data under the selected app's `.bb-data/`. Ollama is optional; without
it, Agents use the offline canned provider.

## Documentation

| Doc | What it covers |
| --- | --- |
| [`tabletop-app/README.md`](tabletop-app/README.md) | Full product overview, architecture, tech stack, deploy, API reference, troubleshooting. |
| [`tabletop-flutter/README.md`](tabletop-flutter/README.md) | Standalone Flutter setup, architecture, code generation, verification, and deployment. |
| [`workshop-flutter/README.md`](workshop-flutter/README.md) | Nine-module Flutter and AWS Blocks workshop. |
| [`tabletop-app/AGENTS.md`](tabletop-app/AGENTS.md) | Instructions for AI coding agents working in the app. |
| [`tabletop-app/CLAUDE.md`](tabletop-app/CLAUDE.md) | Conventions, the mental model, and gotchas — read before making changes. |
| [`tabletop-app/docs/running-the-app.md`](tabletop-app/docs/running-the-app.md) | Step-by-step "getting to know the app" walkthrough. |
| [`designs/architecture.excalidraw`](designs/architecture.excalidraw) | Original React architecture diagram. |

## Shared architecture

Both applications use AWS Blocks `AuthBasic`, `DistributedTable`, `Realtime`,
and five `Agent` instances backed by Bedrock when deployed, Ollama locally, and
the canned provider offline. The React frontend uses React 18 and Vite; the
Flutter frontend uses generated Dart bindings from `lib/blocks.spec.json`.
