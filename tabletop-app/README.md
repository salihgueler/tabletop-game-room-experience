# Adventurer's Guild Hall — Tabletop Game Room

A 16-bit pixel-art tabletop RPG room experience. Sign in, forge a hero from 20
character sprites, browse/create/join campaigns in the Guild Hall, then play a
turn-based session with a 4-seat party and an **AI Dungeon Master** plus AI
companions.

Built on **AWS Blocks** — all game logic, persistence, auth, real-time sync, and
AI narration run server-side. No mock data; the client is a thin typed RPC +
Realtime consumer.

> New to the codebase? Read [`CLAUDE.md`](CLAUDE.md) for conventions, the mental
> model, and gotchas before making changes.

## Contents

- [Adventurer's Guild Hall — Tabletop Game Room](#adventurers-guild-hall--tabletop-game-room)
  - [Contents](#contents)
  - [Features](#features)
  - [Architecture](#architecture)
  - [Tech stack](#tech-stack)
  - [Prerequisites](#prerequisites)
  - [Run (local)](#run-local)
  - [Local AI setup (Ollama)](#local-ai-setup-ollama)
  - [Deploy (AWS)](#deploy-aws)
  - [Gameplay flow](#gameplay-flow)
  - [API reference](#api-reference)
  - [Realtime channels](#realtime-channels)
  - [Project structure](#project-structure)
  - [Configuration](#configuration)
  - [Troubleshooting](#troubleshooting)

## Features

- **AI Dungeon Master** — narrates every action outcome in character, and generates
  contextual, scene-specific action choices each turn (not a fixed class menu).
- **Multi-agent parties** — each AI seat is its own agent with a distinct class
  persona; on its turn it reasons, picks an action, and speaks an in-character line.
- **Watch the AI think** — DM and companion reasoning tokens stream live to the table
  before actions unlock.
- **Real-time multiplayer** — up to 4 seats per room; live state, chat, and turn
  updates broadcast to everyone via WebSocket.
- **Authoritative turn engine** — server rolls a d20 vs a per-round difficulty class,
  resolves the action, and advances the turn. The client never invents state.
- **Lobbies & matchmaking** — public Guild Hall list, private games by access code,
  fill-with-AI or wait-for-humans, and a 15-minute session timer.
- **Persistent characters** — pick from 20 sprites across 4 classes; saved to your
  account.
- **Runs anywhere** — real Bedrock models when deployed, local Ollama for dev, and a
  deterministic canned provider so the game is fully playable offline.

## Architecture

Diagram: [`../designs/architecture.excalidraw`](../designs/architecture.excalidraw)
(open at [excalidraw.com](https://excalidraw.com)).

```
   ┌───────────────────────────────────────────┐
   │  🌐 Browser — React SPA (src/)             │
   │  Auth · Guild Hall · Game Room · Chat      │
   └───────────────────────────────────────────┘
        │  typed RPC                ▲  Realtime
        ▼  api.*()                  │  (WebSocket)
   ┌───────────────────────────────────────────┐
   │  ⚙  AWS Blocks Backend · aws-blocks/index.ts│
   │  one Lambda — all game logic lives here     │
   │                                             │
   │  AuthBasic   DistributedTable×4             │
   │  Realtime    Agent×5 (1 DM + 4 companions)  │
   └───────────────────────────────────────────┘
        │  inference
        ▼
   ┌───────────────────────────────────────────┐
   │  🧠 AI Model — first available wins         │
   │  Bedrock (Sonnet 4.6) → Ollama → canned     │
   └───────────────────────────────────────────┘
```

- **Multi-agent games**: every game session runs **one AI Dungeon Master agent
  plus one AI companion agent per bot party member** (distinct Paladin / Sorcerer
  / Rogue / Ranger personas). On a companion's turn its agent chooses an action
  and speaks an in-character line in chat; the DM agent narrates the outcome. All
  agents are stateless (`inferenceOnly`) one-shot calls, so many games run
  concurrently, each fully isolated.
- **Models**: all agents use **Bedrock Claude Sonnet 4.6** deployed (pinned via an
  explicit inference-profile ID — see the note in [`CLAUDE.md`](CLAUDE.md)), **Ollama
  `llama3.1:8b`** locally, and a canned provider as an offline fallback. Configured
  in `aws-blocks/index.ts`.
- **Local vs deployed**: every block runs as an in-memory/file mock locally and as a
  real AWS service when deployed (Agent → SQS + Lambda + Bedrock, Realtime → AppSync
  Events, DistributedTable → DynamoDB). "Works locally, breaks deployed" is almost
  always a Bedrock/IAM/model issue — check CloudWatch first.
- The frontend imports the fully-typed `api` / `authApi` clients from the
  `aws-blocks` workspace package. `client.js` is auto-generated — never edit it.

## Tech stack

| Layer      | Choice                                                              |
| ---------- | ------------------------------------------------------------------- |
| Frontend   | React 18 + Vite 5 (SPA), plain CSS design system (`theme.css`)      |
| Backend    | AWS Blocks (`@aws-blocks/blocks`) — single `ApiNamespace` on Lambda |
| Auth       | AuthBasic (username/password + HttpOnly session cookie)             |
| Data       | DistributedTable ×4 (DynamoDB + GSIs when deployed)                 |
| Realtime   | Realtime ×3 namespaces (AppSync Events / local WebSocket)           |
| AI         | Agent ×5 (Strands) — Bedrock / Ollama / canned fallback chain       |
| Validation | Zod 4                                                               |
| Infra      | AWS CDK (`aws-cdk-lib`) via the Blocks deploy scripts               |
| Language   | TypeScript (backend), JSX (frontend)                                |

## Prerequisites

- **Node.js ≥ 20** and **npm ≥ 10**
- _(Optional, for real local AI)_ [Ollama](https://ollama.com): `ollama serve` +
  `ollama pull llama3.1:8b`
- _(Optional, for deployment)_ AWS credentials configured, and CDK bootstrapped in the
  target account/region (`npx cdk bootstrap`). Bedrock model access must be enabled.

## Run (local)

```bash
npm install
npm run dev        # client http://localhost:3000, backend http://localhost:3001
npm run typecheck  # type-check the backend (run after any aws-blocks/index.ts edit)
npm run build      # production frontend build to dist/
```

The client runs on **:3000** and proxies API/auth/realtime to the backend on
**:3001** (same-origin so the session cookie sticks — see `vite.config.js`).

Local dev uses in-memory/file mocks for every block (persists to `.bb-data/` —
`rm -rf .bb-data` to reset). For real AI DM responses locally, run Ollama (see below).
Otherwise the canned provider keeps the game playable offline.

## Local AI setup (Ollama)

Ollama is **optional**. Without it, the game falls back to the deterministic canned
provider and stays fully playable — but the AI DM won't generate scene-specific
narration or contextual actions. To get real local AI responses:

1. **Install Ollama** — download from [ollama.com](https://ollama.com) (or
   `brew install ollama` on macOS). Confirm the CLI is on your PATH:

   ```bash
   ollama --version
   ```

2. **Start the server** — leave this running in its own terminal (it serves on
   `http://localhost:11434`, where the backend expects it):

   ```bash
   ollama serve
   ```

3. **Pull the model** — the agents use `llama3.1:8b` (matches `OllamaModels.SMALL` in
   `aws-blocks/index.ts`). Download it once (~4.7 GB):

   ```bash
   ollama pull llama3.1:8b
   ```

4. **Verify** — the model should appear in the list, and a test prompt should return a
   completion:

   ```bash
   ollama list                       # llama3.1:8b is listed
   ollama run llama3.1:8b "hello"    # returns a response
   ```

With Ollama serving and the model pulled, start the app (`npm run dev`) and play a
turn — the DM narration and 3–4 contextual action choices confirm local AI is live. If
actions stay generic, see [Troubleshooting](#troubleshooting).

> **Note:** Ollama is for **local dev only**. Deployed environments use Bedrock — there
> is no Ollama in AWS. See [Deploy (AWS)](#deploy-aws).

## Deploy (AWS)

```bash
npm run sandbox          # ephemeral sandbox (Lambda + API GW + DynamoDB + AppSync)
npm run sandbox:destroy  # tear the sandbox down
npm run deploy           # production deploy with Hosting (CloudFront + S3)
npm run destroy          # tear the production stack down
```

Use the npm scripts — do **not** run `cdk deploy` directly. After deploy, confirm the
AI is healthy by playing a turn (contextual actions appear) or by checking the Handler
Lambda log group for `runAgent done` rather than `runAgent error`.

## Gameplay flow

1. **Auth** — themed username/password sign-in / register (AuthBasic).
2. **Character Select** — pick one of 20 sprites across 4 classes (Paladin, Sorcerer,
   Rogue, Ranger); persisted to your account.
3. **Guild Hall** (`homepage.png`) — public game list (seeded on first load),
   Create-a-Game (scenario, AI DM type, public toggle, fill-with-AI or wait-for-humans),
   and Join Private by access code.
4. **Game Room** (`gamepage.png`) — turn-order rail, stone-tile dungeon board with
   glowing character discs (nameplate + HP + ability icons), AI DM tab, narration
   overlay + action list, chat, inventory, and dice tray.

**A turn:** on your turn the DM "thinks" (streamed), then unlocks 3–4 contextual
actions → you choose one → the server rolls a **d20 vs the round DC** → the **AI DM
narrates** the outcome → AI companions take their turns one at a time → Realtime
broadcasts the new state to everyone at the table. Rooms move `lobby → live → ended`,
and a session lasts at most **15 minutes** before the DM closes the tale.

## API reference

All methods live in the `api` namespace in `aws-blocks/index.ts` and are called as
typed RPC from the frontend (`api.methodName(...)`). Every method except `getConstants`
requires auth.

| Method                                                                 | Purpose                                                                     |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `getConstants()`                                                       | Scenarios, DM types, and class metadata (no auth).                          |
| `saveCharacter(input)` / `getCharacter()`                              | Persist / fetch the caller's chosen hero.                                   |
| `listGames()`                                                          | Public lobby list with occupancy and status (finished games sorted last).   |
| `createGame(input)`                                                    | Create a game; `fillMode: 'ai'` starts live, `'humans'` waits in the lobby. |
| `joinPrivate(accessCode)`                                              | Resolve a private game by its access code.                                  |
| `joinGame(gameId)`                                                     | Claim an open seat (or become a spectator if full).                         |
| `startWithAi(gameId)`                                                  | Host fills remaining seats with AI and starts now.                          |
| `getState(gameId)`                                                     | Authoritative game state + the caller's seat/spectator view.                |
| `takeAction(gameId, action)`                                           | Resolve the current human's turn (roll → narrate → advance).                |
| `advanceBotTurn(gameId)`                                               | Resolve exactly one AI companion's turn (client loops with pacing).         |
| `sendChat(gameId, text)`                                               | Post a chat message.                                                        |
| `getChatHistory(gameId)`                                               | Full readable transcript for a game.                                        |
| `getStateChannel` / `getChatChannel` / `getThinkingChannel` `(gameId)` | Realtime channel handles to subscribe to.                                   |

## Realtime channels

Three Realtime namespaces (keyed per `gameId`) push live updates:

- **`state`** — a version bump signaling the client to refetch `getState` (server is
  authoritative; payloads aren't trusted blindly).
- **`chat`** — every DM narration, action, dice roll, and player message.
- **`thinking`** — streamed reasoning tokens for the currently-acting DM or companion,
  with `start` / `delta` / `end` phases, so players watch the AI think.

## Project structure

```
tabletop-app/
├─ aws-blocks/
│  ├─ index.ts          # THE backend: schemas, auth, turn engine, AI agents, API
│  ├─ index.cdk.ts      # CDK entry (generated — don't edit)
│  ├─ index.handler.ts  # Lambda handler (generated — don't edit)
│  ├─ client.js         # typed RPC client (generated — don't edit)
│  └─ scripts/          # dev server, sandbox, deploy, destroy, console, cleanup
├─ src/
│  ├─ api.js            # frontend RPC/auth helpers (api, authApi, sign-in/up/out)
│  ├─ App.jsx, main.jsx # app shell + entry
│  ├─ screens/          # AuthScreen, Login (character select), GuildHall, GameRoom
│  ├─ components/       # Cabinet, Frame, Chat, Sprite (with error fallback)
│  ├─ data/             # classes.js, dice.js — sprite manifests (presentation only)
│  └─ theme.css         # design system: palette vars, wooden cabinet, pixel fonts
├─ public/
│  ├─ sprites/          # 20 character + 48 d20 dice sprites
│  └─ ui/               # background, crest, title banner, floor tile
├─ CLAUDE.md            # conventions, mental model, gotchas
└─ vite.config.js       # port 3000 + same-origin proxy to backend :3001
```

`aws-blocks/index.ts` is the only place game logic lives. The frontend imports the
typed `api` / `authApi` from the `aws-blocks` workspace package and never reaches into
backend internals.

## Configuration

- **`SESSION_MINUTES`** — session length in minutes (default `15`). Handy for testing
  the expiry/game-over flow quickly.
- **`BLOCKS_SANDBOX`** — set to `true` in sandbox mode so auth cookies use cross-domain
  attributes (frontend on localhost, API on API Gateway). Set automatically by the
  sandbox flow.
- **Deployed AI model** — pinned in `aws-blocks/index.ts` as `DEPLOYED_MODEL`
  (`us.anthropic.claude-sonnet-4-6`). See the ⚠️ note in [`CLAUDE.md`](CLAUDE.md) for
  why we pin an explicit inference-profile ID instead of a `BedrockModels.*` preset.

## Troubleshooting

- **AI actions/narration look generic after deploy, but work locally** — the deployed
  Bedrock model is being rejected (often a "Legacy model" access-denied). Agent errors
  are swallowed into static fallbacks, so the only symptom is degraded output. Check
  the Handler Lambda log group for `runAgent error` and confirm `DEPLOYED_MODEL` is a
  current, invokable inference profile.
- **Sign-in fails locally but sign-up seemed to work** — the session cookie was dropped
  by a cross-origin request. Run through the dev server on :3000 (the Vite proxy keeps
  everything same-origin); don't hit :3001 directly.
- **Agent returns canned/mock responses locally** — Ollama isn't running or the model
  isn't pulled. Run `ollama serve` and `ollama pull llama3.1:8b`, or accept the canned
  provider for offline play.
- **Stale/odd local state** — delete `.bb-data/` and restart `npm run dev`.
- **Type errors after editing the backend** — run `npm run typecheck` and fix before
  starting the dev server. Run dev once after adding/removing an API export to
  regenerate `client.js`.

For a deeper list of AWS Blocks issues, see the troubleshooting guide bundled with the
`aws-blocks-development` skill.
