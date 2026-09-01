# Module 09 — Deploy to AWS (CDK `Hosting`)

**Goal:** ship the finished app to AWS. Every mock's real counterpart — DynamoDB + JWT auth,
DynamoDB tables with GSIs, API Gateway WebSocket, Bedrock via SQS/Lambda — comes online for
the first time, fronted by CloudFront + S3 serving the Flutter web build.

**Introduced:** CDK `Hosting`, the sandbox/prod deploy flow
**You edit:** `aws-blocks/index.ts` — nothing (the backend is complete). You **do** edit
`aws-blocks/index.cdk.ts` once, in step 1, to add `Hosting`.
**You'll know you're done when:** your CloudFront URL serves the Flutter web app, you can
register, create a character, play a turn, and see Realtime updates in a second tab.

---

## Prerequisites

Unlike every other module, this one needs a real AWS account and it creates resources that
cost money. Set all four up **before** step 1 — each of them fails the deploy late and
confusingly if missing:

- **AWS credentials + a region.** `aws sts get-caller-identity` should return your account.
  Everything below deploys into whatever profile/region your shell resolves.
- **CDK bootstrapped**, once per account+region: `npx cdk bootstrap`.
- **Bedrock model access enabled** for that region, in the Bedrock console. This is a hard
  requirement for the `Agent` blocks, not a post-deploy detail — without it your DM
  silently falls back to canned output (see the model-pinning gotcha below).
- **A built Flutter web app** — step 2 covers this.

> **Cost:** this provisions CloudFront, API Gateway, Lambda, DynamoDB and SQS. Idle cost is
> small but not zero, and tearing a CloudFront distribution down takes 15–40 minutes
> (disable, then delete). Read step 6 before you start, not after.

---

## Concept

You never wrote CloudFormation, IAM policies, or wiring. `aws-blocks/index.cdk.ts` reads
your backend's Blocks and provisions the matching AWS resources.

`BlocksStack.create` turns your `index.ts` into infrastructure:

| Block | Deployed as |
| --- | --- |
| AuthBasic | DynamoDB users table + JWT sessions |
| DistributedTable | DynamoDB table (+ GSIs) |
| Realtime | API Gateway WebSocket API |
| Agent | SQS + worker Lambda + Bedrock access |

### What actually changes between local and deployed

Your code is identical; the runtime underneath swaps:

| Block | Local (dev) | Deployed (AWS) |
| --- | --- | --- |
| AuthBasic | file-backed JWT | DynamoDB + JWT |
| DistributedTable | JSON in `.bb-data/` | DynamoDB (+ GSIs) |
| Realtime | local WebSocket on :3001 | API Gateway WebSocket (WSS) |
| Agent | Ollama / canned, in-process | **SQS → Lambda → Bedrock**, async |

The Agent row is the one that bites people: locally `stream()` round-trips in one process;
deployed it crosses Lambda invocations and calls Bedrock. **"Works locally, breaks
deployed" is almost always a Bedrock/IAM/model-availability issue — check CloudWatch, not
the code, first.**

## Steps

> **Working directory:** every fence below starts from `workshop-flutter/app/`. The `cd`
> lines are written so you can paste them in order from there.

### 1. Add `Hosting` to the CDK file

The scaffolder generated `aws-blocks/index.cdk.ts` with the backend stack only — it has
**no `Hosting` construct**, so a deploy right now would give you a working API and no
website. Adding `Hosting` is this module's one code change.

Open `backend/aws-blocks/index.cdk.ts`. `Hosting` ships in the module the file already
imports from, so just add it to the existing import:

```ts
import { BlocksStack, BlocksPresets, Hosting } from "@aws-blocks/blocks/cdk";
```

Then, at the end of the file, add the block — note it is **skipped in sandbox mode**,
because the sandbox deliberately has no front end:

```ts
if (!sandboxMode) {
  new Hosting(blocksStack, "Hosting", {
    root: join(__dirname, "..", ".."),
    buildCommand: "flutter build web --release",
    buildOutputDir: "build/web",
    api: blocksStack,
  });
}
```

**Why `join(__dirname, "..", "..")`:** this file lives at `app/backend/aws-blocks/`, so two
levels up is `app/` — your Flutter project root, the directory that contains `build/web`.
Get this wrong and synth fails with `Build output directory not found`. (The finished
reference app in `../../tabletop-flutter/` uses a single `".."` because there `aws-blocks/`
sits directly beside `lib/` — don't copy that path here, the layouts differ.)

`api: blocksStack` is what makes the deployed app talk to a **same-origin** API: CloudFront
routes the RPC prefix to API Gateway, so there is no CORS and no URL to configure.

### 2. Sandbox first (ephemeral, fast)

The sandbox deploys the backend (Lambda + API Gateway + DynamoDB + WebSocket API) without the
CloudFront/S3 front end, with hot reload — ideal for a first real-cloud smoke test:

```bash
cd backend
npm run sandbox
```

The sandbox sets `BLOCKS_SANDBOX=true`, which flips auth's `crossDomain` — essential for
Flutter clients, including mobile on another origin, where the frontend and API live on
different registrable domains. Without it, session cookies are rejected cross-origin.

**Run Flutter against the sandbox** (second terminal, from `app/`):

```bash
flutter run -d chrome \
  --dart-define=BLOCKS_API_URL=https://YOUR_API/aws-blocks/api
```

Replace `YOUR_API` with the API Gateway URL printed by `npm run sandbox`. Play a turn to
confirm the backend is live. If AI narration is generic, that's the model gotcha below —
the game still runs.

When you're done with the sandbox, from `app/backend`:

```bash
npm run sandbox:destroy
```

### 3. Pre-deploy: regenerate and build locally

Before deploying, make sure the generated spec and Flutter web build are fresh. `Hosting`
runs `flutter build web` itself during synth, but it does **not** run the spec generator or
`build_runner` — a stale client here ships a stale app:

```bash
cd backend
npx blocks-generate-spec aws-blocks/index.ts ../lib/blocks.spec.json
cd ..
dart run build_runner build --delete-conflicting-outputs
flutter build web --release
flutter analyze
flutter test
```

### 4. Production deploy (with Hosting)

From `app/`:

```bash
cd backend
npm run deploy
```

Use the npm scripts — **do not run `cdk deploy` directly** (the scripts pass the CDK
context, project root, and removal policies the Blocks tooling expects). When it finishes
you get a CloudFront URL serving the built Flutter web app, talking to the same-origin API.

### 5. Post-deploy verification

Open the CloudFront URL and confirm the full flow:

1. **Register** a new account.
2. **Create a character** — pick a class and sprite.
3. **Play a turn** — roll dice, pick an action, see narration.
4. **Realtime** — open a second browser tab to the same game. Actions in one tab should
   appear in the other within seconds (state + chat channels).
5. **AI health** — if action options are scene-specific, Bedrock is answering. If they're
   the fixed class menu, the agent fell back to canned. Check CloudWatch (the Handler
   Lambda's log group) for agent errors.

### ⚠️ The model-pinning gotcha (revisited)

This is the one that cost the reference app real debugging time. Agent errors are swallowed
into the canned fallback, so a rejected model shows up **only** as degraded output, never a
crash. The usual cause: a `BedrockModels.*` preset resolves to a model Bedrock has since
retired. Fixes:

1. Check the Handler Lambda logs for agent/Bedrock errors first.
2. Confirm Bedrock model access is enabled for your account/region.
3. If a preset is stale, pin an explicit **current** inference-profile id on the `dm` (and
   companion) agents instead of the preset, then redeploy.

### 6. Tear down

This is the step people skip and then get billed for — the resources you deployed keep
costing money until you remove them. Note the sandbox and the production stack come down with
different commands: `npm run sandbox:destroy` (step 2) for the ephemeral sandbox,
`npm run destroy` below for the full production stack. Deleting the CloudFront distribution is
slow (roughly 15–40 minutes, as the cost note above warns), so a destroy that looks stuck part
way through is almost always normal — let it finish rather than killing it.

```bash
npm run destroy
```

Use `npm run destroy` when the environment is no longer needed. This removes the
CloudFront distribution, S3 bucket, Lambda functions, DynamoDB tables, and all other
provisioned resources.

---

## Verify

- `npm run sandbox` provisions and the game is playable against real AWS via
  `--dart-define=BLOCKS_API_URL`.
- `npm run deploy` yields a working CloudFront URL.
- Deployed AI produces scene-specific options (Bedrock healthy), or you've diagnosed the
  fallback via CloudWatch.
- Realtime syncs across tabs.

## Checklist

- [ ] `npm run sandbox` provisions and the Flutter app works against the sandbox.
- [ ] `npm run deploy` yields a working CloudFront URL.
- [ ] Register, character creation, turn play, and chat all work on the deployed URL.
- [ ] Realtime updates propagate across browser tabs.
- [ ] Deployed AI produces scene-specific options, or you've confirmed the fallback cause
      via CloudWatch logs.
- [ ] You tore down what you don't want to keep (`sandbox:destroy` / `destroy`).

## What you learned

- Blocks generates all infrastructure from your `index.ts` — no hand-written
  CloudFormation or IAM.
- `Hosting` fronts the Flutter web build with CloudFront + S3; the backend is Lambda + API
  Gateway.
- The sandbox's `BLOCKS_SANDBOX=true` flips `crossDomain` on auth — essential for Flutter
  clients on a different origin (including mobile).
- The local ↔ deployed swap is transparent _except_ for the Agent's async Bedrock path —
  the first place to look when deployed behavior differs.
- LLM fallbacks that hide errors make model problems invisible; pin current model ids and
  watch CloudWatch.

## Troubleshooting

- **`npm run deploy` fails on CDK bootstrap** — run `npx cdk bootstrap` in your account/
  region first.
- **Flutter web build fails** — run `flutter build web --release` locally first and fix any
  Dart errors before deploying.
- **Realtime not connecting** — check that the WebSocket API Gateway was provisioned
  (visible in the CloudFormation stack outputs). Client falls back to polling if WSS fails.
- **AI generic on deployed but fine locally** — the model-pinning gotcha. Lambda logs are
  your first stop.
- **Auth cookies rejected in sandbox** — `crossDomain` is not flipping. Confirm
  `BLOCKS_SANDBOX=true` is set in the sandbox environment.

---

## You're done 🎉

You built a real-time, multiplayer, multi-agent AI application on AWS Blocks — auth, a
NoSQL data layer, API Gateway WebSocket sync, a streaming DM agent, a party of companion
agents, and a production deploy — starting from an all-mock backend and replacing one fake
at a time. The Flutter client consumes the same generated API contract throughout.

The result matches the reference app in
[`../../tabletop-flutter/`](../../tabletop-flutter/).

Where to go next: add a `KnowledgeBase` so the DM can pull lore via RAG, swap `AuthBasic`
for `AuthCognito` (social/MFA), or add `Metrics`/`Dashboard` to watch agent latency in
production.
