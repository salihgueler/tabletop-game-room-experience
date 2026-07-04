# Tabletop Game Room Experience

A 16-bit pixel-art tabletop RPG room. Sign in, forge a hero, browse/create/join
campaigns in the Guild Hall, then play a turn-based session with a 4-seat party, an
**AI Dungeon Master**, and AI companions. All game logic, persistence, auth, real-time
sync, and AI narration run server-side on **AWS Blocks**; the browser client is a thin,
fully-typed RPC + Realtime consumer.

## Repository layout

```text
.
├─ tabletop-app/     # The application — React 18 SPA + AWS Blocks backend (start here)
├─ designs/          # Architecture diagram (Excalidraw) and pixel-art mockups
├─ .kiro/steering/   # AI-assistant steering docs (product / tech / structure)
└─ README.md         # You are here
```

The app lives entirely in [`tabletop-app/`](tabletop-app/) — that's where you install,
run, build, and deploy.

## Quick start

```bash
cd tabletop-app
npm install
npm run dev        # client → http://localhost:3000, backend → http://localhost:3001
```

No AWS account is needed to run locally — every backend block runs as an in-memory/file
mock. For real local AI narration, optionally run [Ollama](https://ollama.com); without
it the game falls back to a deterministic canned provider and stays fully playable.

## Documentation

| Doc | What it covers |
| --- | --- |
| [`tabletop-app/README.md`](tabletop-app/README.md) | Full product overview, architecture, tech stack, deploy, API reference, troubleshooting. |
| [`tabletop-app/AGENTS.md`](tabletop-app/AGENTS.md) | Instructions for AI coding agents working in the app. |
| [`tabletop-app/CLAUDE.md`](tabletop-app/CLAUDE.md) | Conventions, the mental model, and gotchas — read before making changes. |
| [`tabletop-app/docs/running-the-app.md`](tabletop-app/docs/running-the-app.md) | Step-by-step "getting to know the app" walkthrough. |
| [`designs/architecture.excalidraw`](designs/architecture.excalidraw) | Architecture diagram (open at [excalidraw.com](https://excalidraw.com)). |

## Tech stack

React 18 + Vite 5 (SPA) · AWS Blocks (`@aws-blocks/blocks`) on Lambda · AuthBasic ·
DistributedTable (DynamoDB) · Realtime (AppSync Events) · Agent ×5 (Bedrock / Ollama /
canned) · Zod 4 · AWS CDK · TypeScript + JSX. Requires **Node.js ≥ 20** and **npm ≥ 10**.
