# CLAUDE.md

Guidance for working in this repo. Read once before making changes.

## What this is

**Adventurer's Guild Hall** — a 16-bit pixel-art tabletop RPG room. Sign in, forge
a hero, browse/create/join campaigns in the Guild Hall, then play a turn-based
session with a 4-seat party and an **AI Dungeon Master**. Built on **AWS Blocks**:
all game logic, persistence, auth, realtime sync, and AI run server-side.

Architecture diagram: `../designs/architecture.excalidraw` (open at excalidraw.com).

## Commands

```bash
npm run dev        # client :3000 + backend :3001 (concurrently). Never blocks-run in CI.
npm run typecheck  # tsc --noEmit — run this after ANY backend edit before anything else
npm run build      # production frontend build → dist/
npm run sandbox            # ephemeral AWS sandbox (hot reload)
npm run sandbox:destroy
npm run deploy             # production deploy (Hosting + CloudFront)
npm run destroy
```

The verification loop for backend changes: **edit `aws-blocks/index.ts` → `npm run
typecheck` → restart dev server → curl the JSON-RPC endpoint.** Do not touch frontend
work until the backend typechecks clean.

## Layout

- `aws-blocks/index.ts` — **the entire backend**: Zod schemas, auth, the turn engine,
  the AI DM + companion agents, realtime channels, seed data, and every API method.
  This is the only place game logic lives. **Edit this for all backend work.**
- `aws-blocks/index.cdk.ts`, `index.handler.ts`, `client.js` — **generated. Never edit.**
  `client.js` is regenerated when you run dev after adding/removing an API export.
- `src/` — React SPA. `api.js` (typed RPC client + auth helpers), `screens/`
  (`AuthScreen`, `Login` = character select, `GuildHall`, `GameRoom`), `components/`,
  `theme.css`, `data/` (sprite manifests — presentation only, no game logic).
- `public/sprites/`, `public/ui/` — pixel-art assets.

## Hard rules (AWS Blocks conventions)

- **Only edit `aws-blocks/index.ts` for backend logic.** The `.cdk.ts` / `.handler.ts`
  / `client.js` files are codegen.
- **Every top-level `export` in `index.ts` becomes an API namespace.** Domain constants
  are intentionally NOT exported — they're returned via `getConstants()`. Don't add
  stray exports.
- **Auth:** use `auth.createApi()` and `auth.requireAuth(context)`. Don't hand-roll
  auth wrappers.
- **DistributedTable has no scan.** List via a constant partition key + a GSI (see the
  `byCreated` index on `games`, queried with `listKey: { equals: 'all' }`).
- **Short Scope/Realtime IDs.** The scope is `'tt'` and namespaces are short (`state`,
  `chat`, `thinking`) because AppSync caps channel namespace names at 50 chars.
- The frontend imports the typed `api` / `authApi` from the `aws-blocks` workspace
  package — never reaches into backend internals.

## How the game runs (mental model)

- **Server is authoritative.** The client is a typed RPC + Realtime consumer with no
  game logic. State lives in `gameStates` (one item per game); the client re-fetches on
  a Realtime `state` bump rather than trusting pushed payloads.
- **Rooms:** `lobby` (gathering the party) → `live` (all seats filled, turns run) →
  `ended` (15-min clock expired; see `SESSION_MS`). `finalizeIfExpired` is idempotent
  and called on reads/mutations.
- **Turns:** on a human's turn they pick an action → server rolls a d20 vs the round DC
  → the DM narrates → the client steps AI companion turns one at a time
  (`advanceBotTurn`) for visible pacing. AI seats are gated to the host's stepper.
- **`transcribe()`** is the single helper that writes every DM line, action, and roll to
  BOTH the board log and the persistent chat transcript, and broadcasts them.

## Multi-agent AI (the interesting part)

Each session runs **one DM agent + one companion agent per AI seat** (distinct Paladin /
Sorcerer / Rogue / Ranger personas). All are `inferenceOnly` (stateless one-shot),
so many games run concurrently and isolated. Agents stream their reasoning to the
`thinking` Realtime channel so players watch them think.

- **`nextScene()` is the "action generator"** — it asks the DM agent to set the scene
  for the next actor and emit 3–4 contextual action `options`. If the model errors it
  silently falls back to a generic prompt + fixed class actions. So *when the model is
  unavailable, the game still runs but options stop being scene-specific* — that
  degradation is the tell that inference is failing, not a logic bug.
- **`companionDecide()`** — a companion agent picks one action + speaks an in-character
  line; falls back to a random valid action on error.

### ⚠️ Model config gotcha (bit us in production)

Deployed agents point at an **explicit Bedrock inference-profile ID**
(`DEPLOYED_MODEL` = `us.anthropic.claude-sonnet-4-6`), NOT a `BedrockModels.*` preset.
The presets in the installed `@aws-blocks/blocks` still resolve to Claude Sonnet 4 /
Haiku 4.5, which Bedrock now rejects as **"Legacy" (access denied)** — that failure is
swallowed by the fallbacks above, so the only visible symptom is degraded/static
actions in prod while local (Ollama) looks fine. If agents "stop working when
deployed," check the deployed Lambda logs for `runAgent error` first, then confirm the
model ID is a current, invokable profile. Model fallback chain: **deployed → Bedrock**,
**local → Ollama `llama3.1:8b`**, **offline → canned** (deterministic).

## Local vs deployed (why "works locally, breaks deployed" happens)

Blocks run as in-memory/file mocks locally (persist to `.bb-data/` — `rm -rf` to reset)
but as real AWS services when deployed:

| Block        | Local                          | Deployed                             |
|--------------|--------------------------------|--------------------------------------|
| Agent        | Ollama or canned, in-process   | **SQS → Lambda → Bedrock**, async    |
| Realtime     | local WebSocket on :3001       | AppSync Events (WSS)                 |
| DistributedTable | file mock                  | DynamoDB (+ GSIs)                    |
| AsyncJob     | runs synchronously in-process  | separate SQS-triggered invocation    |

The Agent's `stream()` enqueues an AsyncJob and `complete()` waits for a `done` chunk
over Realtime. Locally that round-trips in one process; deployed it crosses Lambda
invocations. Anything that works locally but not deployed is almost always a
Bedrock/IAM/model-availability issue — check CloudWatch, not the code, first.
