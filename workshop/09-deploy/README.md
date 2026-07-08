# Module 09 — Deploy to AWS (CDK `Hosting`)

**Goal:** ship the finished app to AWS. Every mock's real counterpart — Cognito-less auth
on DynamoDB, DynamoDB tables, AppSync Events, Bedrock, SQS/Lambda — comes online for the
first time, fronted by CloudFront + S3.

**Introduced:** CDK `Hosting`, the sandbox/prod deploy flow
**Time:** ~45 minutes (plus AWS provisioning wait)
**Prerequisites:** an AWS account with credentials configured, CDK bootstrapped
(`npx cdk bootstrap`), and Bedrock model access enabled in your region.
**You edit:** nothing in `index.ts` — the backend is complete. This module is about the
deploy glue and going live.

---

## Concept

You never wrote CloudFormation, IAM policies, or wiring. The generated
`aws-blocks/index.cdk.ts` reads your backend's Blocks and provisions the matching AWS
resources; `Hosting` adds a CloudFront + S3 front end for the built SPA.

```ts
// aws-blocks/index.cdk.ts (generated glue — do not hand-edit)
const blocksStack = await BlocksStack.create(app, stackName, {
  backendHandlerPath: join(__dirname, "index.handler.ts"),
  backendCDKPath: join(__dirname, "index.ts"),
});

if (!sandboxMode) {
  new Hosting(blocksStack, "Hosting", {
    root: join(__dirname, ".."),
    buildCommand: "npm run build",
    buildOutputDir: "dist",
    api: blocksStack,
  });
}
```

`BlocksStack.create` turns your `index.ts` into infrastructure: `AuthBasic` → a DynamoDB
users table + JWT sessions, each `DistributedTable` → a DynamoDB table (+ GSIs),
`Realtime` → AppSync Events, each `Agent` → SQS + a worker Lambda + Bedrock access.

### What actually changes between local and deployed

Your code is identical; the runtime underneath swaps:

| Block            | Local (dev)                 | Deployed (AWS)                    |
| ---------------- | --------------------------- | --------------------------------- |
| AuthBasic        | file-backed JWT             | DynamoDB + JWT                    |
| DistributedTable | JSON in `.bb-data/`         | DynamoDB (+ GSIs)                 |
| Realtime         | local WebSocket on :3001    | AppSync Events (WSS)              |
| Agent            | Ollama / canned, in-process | **SQS → Lambda → Bedrock**, async |

The Agent row is the one that bites people: locally `stream()` round-trips in one process;
deployed it crosses Lambda invocations and calls Bedrock. **"Works locally, breaks
deployed" is almost always a Bedrock/IAM/model-availability issue — check CloudWatch, not
the code, first.**

## Steps

### 1. Sandbox first (ephemeral, fast)

The sandbox deploys the backend (Lambda + API Gateway + DynamoDB + AppSync) without the
CloudFront/S3 front end, with hot reload — ideal for a first real-cloud smoke test:

```bash
cd app
npm run sandbox          # provisions an ephemeral stack, watches for changes
```

The sandbox sets `BLOCKS_SANDBOX=true`, which flips two things you already coded for:

- **`auth`'s `crossDomain`** turns on (frontend on localhost, API on API Gateway are
  different registrable domains, so the session cookie needs cross-domain attributes).
- Removal policies are relaxed so `sandbox:destroy` can tear everything down cleanly.

Play a turn against the sandbox. If AI narration is generic, that's the model gotcha
below — the game still runs.

```bash
npm run sandbox:destroy  # tear it all down when done
```

### 2. Production deploy (with Hosting)

```bash
npm run deploy           # builds the SPA, provisions the full stack + CloudFront/S3
```

Use the npm scripts — **do not run `cdk deploy` directly** (the scripts pass the CDK
context, project root, and removal policies the Blocks tooling expects). When it finishes
you get a CloudFront URL serving the built front end, talking to the same-origin API.

```bash
npm run destroy          # tear down the production stack
```

### 3. Confirm AI is healthy

After deploy, play a turn: contextual (scene-specific) action options mean Bedrock is
answering. Generic options + a fixed class menu mean the agent fell back to canned —
check the Handler Lambda's CloudWatch log group for agent errors.

You can smoke-test the deployed API the same way you did locally — the endpoint is now your
CloudFront domain, and `getConstants` is public (no session needed):

```bash
curl -s -X POST https://YOUR_CLOUDFRONT_DOMAIN/aws-blocks/api \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"api.getConstants","params":[],"id":1}'
```

On Windows (cmd.exe), one line with escaped quotes:

```cmd
curl -s -X POST https://YOUR_CLOUDFRONT_DOMAIN/aws-blocks/api -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"method\":\"api.getConstants\",\"params\":[],\"id\":1}"
```

> Replace `YOUR_CLOUDFRONT_DOMAIN` with the URL printed by `npm run deploy`. In PowerShell
> use `curl.exe`. Protected methods (`getCharacter`, `listGames`, `getState`, …) still need
> a session — sign in first with `authApi.setAuthState` and reuse the cookie (`-c`/`-b`),
> exactly as in modules 03–08.

### ⚠️ The model-pinning gotcha (revisited)

This is the one that cost the reference app real debugging time. Agent errors are swallowed
into the canned fallback, so a rejected model shows up **only** as degraded output, never a
crash. The usual cause: a `BedrockModels.*` preset resolves to a model Bedrock has since
retired ("Legacy model", access-denied). Fixes:

1. Check the Handler Lambda logs for agent/Bedrock errors first.
2. Confirm Bedrock model access is enabled for your account/region.
3. If a preset is stale, pin an explicit **current** inference-profile id on the `dm` (and
   companion) agents instead of the preset, then redeploy.

---

## Checklist

- [ ] `npm run sandbox` provisions and the game is playable against real AWS.
- [ ] `npm run deploy` yields a working CloudFront URL.
- [ ] Deployed AI produces scene-specific options (Bedrock healthy), or you've diagnosed
      the fallback via CloudWatch.
- [ ] You tore down what you don't want to keep (`sandbox:destroy` / `destroy`).

## What you learned

- Blocks generates all infrastructure from your `index.ts` — no hand-written CFN/IAM.
- `Hosting` fronts the SPA with CloudFront + S3; the backend is Lambda + API Gateway.
- The local↔deployed swap is transparent _except_ for the Agent's async Bedrock path —
  the first place to look when deployed behavior differs.
- LLM fallbacks that hide errors make model problems invisible; pin current model ids and
  watch CloudWatch.

## You're done 🎉

You built a real-time, multiplayer, multi-agent AI application on AWS Blocks — auth, a
NoSQL data layer, WebSocket sync, a streaming DM agent, a party of companion agents, and a
production deploy — starting from an all-mock backend and replacing one fake at a time.
The result matches the reference app in [`../../tabletop-app/`](../../tabletop-app/).

Where to go next: add a `KnowledgeBase` so the DM can pull lore via RAG, swap `AuthBasic`
for `AuthCognito` (social/MFA), or add `Metrics`/`Dashboard` to watch agent latency in
production.
