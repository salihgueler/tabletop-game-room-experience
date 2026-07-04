# AGENTS.md

Instructions for AI coding agents working in **Adventurer's Guild Hall**
(`tabletop-app`). This is the nearest `AGENTS.md`, so it takes precedence for anything
under `tabletop-app/`. Read [`CLAUDE.md`](CLAUDE.md) alongside this file — it carries the
deeper mental model, the AWS Blocks conventions, and the production gotchas; this file
does not repeat them.

## Project overview

A 16-bit pixel-art, turn-based tabletop RPG room. Players sign in, forge a hero, browse
or create campaigns in the Guild Hall, then play a session with a 4-seat party, an **AI
Dungeon Master**, and AI companions. Built on **AWS Blocks**: all game logic,
persistence, auth, realtime sync, and AI run server-side. The React SPA is a thin,
fully-typed RPC + Realtime consumer with **no game logic**.

- **`aws-blocks/index.ts` is the entire backend** — Zod schemas, auth, the turn engine,
  the AI DM + companion agents, realtime channels, seed data, and every API method. Edit
  this file for all backend work.
- **`src/` is the React frontend** — `api.js` (typed RPC + auth helpers), `screens/`,
  `components/`, `data/` (presentation-only sprite manifests), `theme.css`.
- The server is authoritative; the client re-fetches state on a Realtime `state` bump
  rather than trusting pushed payloads.

For the full architecture, API reference, and gameplay flow, see
[`README.md`](README.md). For a per-file map, see [`CLAUDE.md`](CLAUDE.md).

## Build and test commands

Run everything from `tabletop-app/`.

```bash
npm install
npm run typecheck   # tsc --noEmit — the primary backend gate
npm run build       # production frontend build → dist/
npm run dev         # client :3000 + backend :3001 (long-running; do NOT run in CI/validation)
```

Deploy scripts (use the npm scripts — never call `cdk` directly):

```bash
npm run sandbox / npm run sandbox:destroy   # ephemeral AWS sandbox
npm run deploy  / npm run destroy           # production stack (Hosting + CloudFront)
```

**Verification loop for backend edits:** edit `aws-blocks/index.ts` → `npm run
typecheck` → (if an API export changed) restart `npm run dev` once to regenerate
`client.js` → curl the JSON-RPC endpoint. Do not start frontend work until the backend
typechecks clean.

## Testing instructions

- **There is currently no unit-test script.** Do **not** add tests or a test framework
  unless the user explicitly asks for it.
- Validate **backend** changes with `npm run typecheck`.
- Validate **frontend/build** changes with `npm run build`.
- Do **not** launch long-lived servers/watchers (`npm run dev`, `sandbox`, `deploy`) as
  part of automated validation — they don't terminate. Prefer `typecheck` / `build`.
- For manual playtesting, run `npm run dev` and open http://localhost:3000. Reset local
  state by deleting `.bb-data/` and restarting. See
  [`docs/running-the-app.md`](docs/running-the-app.md).

## Code style guidelines

- **Language:** TypeScript for the backend (`aws-blocks/`), JSX/JavaScript (ES modules,
  React 18) for the frontend. `"type": "module"` — use `import`/`export`, never
  `require`.
- **Formatting:** match the surrounding file — 2-space indent, single quotes, no
  semicolons in `src/` frontend files, semicolons in `aws-blocks/index.ts`. There is no
  autoformatter configured, so mirror the existing idiom rather than reformatting.
- **Validation:** define API and persistence shapes with **Zod 4** schemas in
  `index.ts`; don't hand-validate.
- **Comments:** explain *why*, not *what*. The existing code documents non-obvious AWS
  Blocks behavior and production gotchas inline — keep that density.
- **Naming:** keep AWS Blocks Scope/Realtime namespace IDs short (scope `'tt'`;
  namespaces `state`, `chat`, `thinking`) — AppSync caps namespace names at 50 chars.

## Hard rules (AWS Blocks conventions)

These are load-bearing. Violating them breaks codegen or deploys. Fuller explanations
live in [`CLAUDE.md`](CLAUDE.md).

- **Only edit `aws-blocks/index.ts` for backend logic.** `index.cdk.ts`,
  `index.handler.ts`, and `client.js` are **generated — never edit them.** `client.js`
  regenerates when you run `npm run dev` after adding/removing an API export.
- **Every top-level `export` in `index.ts` becomes an API namespace.** Don't add stray
  exports; return domain constants via `getConstants()` instead of exporting them.
- **Auth:** use `auth.createApi()` and `auth.requireAuth(context)`. Don't hand-roll auth
  wrappers.
- **DistributedTable has no scan.** List via a constant partition key + a GSI (see
  `byCreated` on `games`, queried with `listKey: { equals: 'all' }`).
- The frontend imports the typed `api` / `authApi` from the `aws-blocks` workspace
  package — it must never reach into backend internals.

## Security considerations

- **Never hardcode secrets, credentials, AWS account IDs, client IDs, or deployed
  endpoints** in source or docs. Auth uses AuthBasic (username/password → HttpOnly
  session cookie); don't weaken cookie/session handling.
- **The server is authoritative.** Never move game-outcome logic (dice rolls, DC checks,
  turn advancement, seat assignment) to the client, and never trust client-supplied
  state — validate inputs server-side with Zod and re-derive outcomes on the server.
- **Local `.bb-data/`** holds mock users/state and is git-ignored. Don't commit it or any
  generated artifact (`client.js`, `blocks.spec.json`, `cdk.out/`, `dist/`).
- **Deploys touch real AWS resources.** Treat `npm run deploy` / `destroy` as
  destructive/outward-facing: only run them on explicit user request, and prefer the
  sandbox for experiments. Assume any unlabeled AWS resource is production.
- **AI agent errors are swallowed into fallbacks** (see the ⚠️ model-config note in
  [`CLAUDE.md`](CLAUDE.md)), so a broken model shows up as degraded output, not an
  exception. When agent behavior looks off after deploy, check the Handler Lambda logs
  for `runAgent error` — don't assume it's a code bug.

## Commit & pull request guidelines

- **Scope commits to one package.** This repo tracks `tabletop-app/` and top-level
  `designs/` + `.kiro/`; keep unrelated changes out of a commit.
- **Commit messages:** imperative mood, concise subject describing the effect (e.g.
  "Fix multiplayer sync: subscribe to state channel"). Match the existing `git log`
  style.
- **Never commit generated or local files:** `node_modules/`, `dist/`, `cdk.out/`,
  `.bb-data/`, `.blocks-sandbox/`, `aws-blocks/client.js`, `aws-blocks/blocks.spec.json`,
  `*.log`. They're covered by `.gitignore` — don't force-add them.
- **Before opening a PR:** `npm run typecheck` (backend) and `npm run build` (frontend)
  must pass. Summarize gameplay/behavior impact and note any deploy steps.
- **Don't commit, push, or deploy unless the user asks.** Confirm hard-to-reverse or
  outward-facing actions first.

## Extra notes

- **Local vs deployed drift is expected.** Blocks run as in-memory/file mocks locally but
  as real AWS services when deployed (Agent → SQS + Lambda + Bedrock, Realtime → AppSync
  Events, DistributedTable → DynamoDB). "Works locally, breaks deployed" is almost always
  a Bedrock / IAM / model-availability issue — check CloudWatch first, not the code.
- **Session length** is controlled by `SESSION_MINUTES` (default `15`) in `index.ts` —
  lower it to test the expiry/game-over flow quickly.
- **Same-origin dev.** The client on :3000 proxies API/auth/realtime to the backend on
  :3001 (see `vite.config.js`) so the session cookie stays same-origin. Don't hit :3001
  directly, or sign-in cookies get dropped.
- **Reference material:** the `aws-blocks-development` skill bundles a deeper AWS Blocks
  troubleshooting guide and API patterns.
