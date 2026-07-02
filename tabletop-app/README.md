# Adventurer's Guild Hall — Tabletop Game Room

A 16-bit pixel-art tabletop RPG room experience. Sign in, forge a hero from 20
character sprites, browse/create/join campaigns in the Guild Hall, then play a
turn-based session with a 4-seat party and one **AI Dungeon Master**.

Built on **AWS Blocks** — all game logic, persistence, auth, real-time sync, and
AI narration run server-side. No mock data.

## Architecture

```
Frontend (React SPA, src/)  ── typed RPC + Realtime ──▶  aws-blocks/index.ts
                                                          ├─ AuthBasic        (login/sessions)
                                                          ├─ DistributedTable (games, gameStates, chat, characters)
                                                          ├─ Realtime         (live state + chat per game)
                                                          └─ Agent            (AI DM narration)
```

- **Multi-agent games**: every game session runs **one AI Dungeon Master agent
  plus one AI companion agent per bot party member** (distinct Paladin / Sorcerer
  / Rogue / Ranger personas). On a companion's turn its agent chooses an action
  and speaks an in-character line in chat; the DM agent narrates the outcome. All
  agents are stateless (`inferenceOnly`) one-shot calls, so many games run
  concurrently, each fully isolated.
- **Models**: DM uses Bedrock Claude Sonnet deployed; companions use Bedrock
  Claude Haiku (FAST) deployed. Both use **Ollama `llama3.1:8b`** locally, with a
  canned provider as an offline fallback. Configured in `aws-blocks/index.ts`.
- The frontend imports the fully-typed `api` / `authApi` clients from the
  `aws-blocks` workspace package. `client.js` is auto-generated — never edit it.

## Run (local)

```bash
npm install
npm run dev        # client http://localhost:3000, backend http://localhost:3001
npm run typecheck  # type-check the backend
npm run build      # production frontend build to dist/
```

Local dev uses in-memory/file mocks for every block (persists to `.bb-data/` —
delete to reset). For real AI DM responses locally, run Ollama:
`ollama serve && ollama pull llama3.1:8b`. Otherwise the canned provider keeps
the game playable offline.

## Deploy (AWS)

```bash
npm run sandbox          # ephemeral sandbox (Lambda + API GW + DynamoDB + AppSync)
npm run sandbox:destroy
npm run deploy           # production deploy with Hosting
npm run destroy
```

## Flow

1. **Auth** — themed username/password sign-in / register (AuthBasic).
2. **Character Select** — pick one of 20 sprites; persisted to your account.
3. **Guild Hall** (`homepage.png`) — public game list (seeded on first load),
   Create-a-Game (scenario, AI DM type, public toggle), Join Private by code.
4. **Game Room** (`gamepage.png`) — turn-order rail, stone-tile dungeon board with
   glowing character discs (nameplate + HP + ability icons), AI DM tab, narration
   overlay + action list, chat, inventory, dice tray. On your turn: choose an
   action → server rolls a d20 vs the round DC → **AI DM narrates** → bots
   auto-resolve → Realtime broadcasts the new state to everyone at the table.

## Structure

- `aws-blocks/index.ts` — **the backend**: schemas, auth, turn engine, AI DM,
  realtime, seed data, and all API methods. The only place game logic lives.
- `src/api.js` — frontend RPC/auth helpers (`api`, `authApi`, sign-in/up/out).
- `src/theme.css` — design system: palette CSS variables, wooden cabinet + gold
  corners, slate-navy panels, amber buttons, Press Start 2P / VT323 fonts.
- `src/components/` — `Cabinet`, `Frame`, `Chat`, `Sprite` (with error fallback).
- `src/screens/` — `AuthScreen`, `Login` (character select), `GuildHall`, `GameRoom`.
- `src/data/classes.js`, `src/data/dice.js` — sprite manifests (presentation only).
- `public/sprites/` — 20 character + 48 d20 dice sprites.
- `public/ui/` — tavern background, skull crest, title banner, floor tile.
```
