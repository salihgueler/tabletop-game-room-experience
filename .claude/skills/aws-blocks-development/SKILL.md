---
name: aws-blocks-development
description: Builds fullstack TypeScript apps on AWS with @aws-blocks/blocks — scaffolding, correct import paths, the JSON-RPC API model, and deployment. Use when working with @aws-blocks/blocks, the create-blocks-app CLI, or any Building Block (KVStore, DistributedTable, Database, DistributedDatabase, FileBucket, Realtime, EmailClient, AsyncJob, CronJob, Agent, KnowledgeBase, AppSetting, AuthBasic, AuthCognito, AuthOIDC, Logger, Metrics, Tracer, Dashboard), and with Scope, ApiNamespace, RawRoute, BlocksStack, Hosting, or Pipeline.
---

# AWS Blocks Development

Fullstack TypeScript on AWS: a typed JSON-RPC backend and a frontend that calls
it with no codegen, both defined in one `aws-blocks/` workspace and deployed with
CDK. This file is the map — it routes you to the right block file and the
top-level references; per-block API detail lives in those files, not here.

**Pinned version.** This skill targets published `@aws-blocks/blocks@0.7.0`
(2026-10-05, npm `latest`). Every API claim here is written against that release.
Individual Building Blocks version independently under the umbrella (e.g.
`bb-agent@0.5.0`, `bb-kv-store@0.3.0`, `bb-realtime@0.3.0`, `core@0.6.0`,
`hosting@0.4.0`); when a claim is version-sensitive it names the component
version inline.

## Contents

- Prerequisites
- Decision guide (which auth / which storage / which AI)
- Block index
- Package entry points (subpath exports)
- Project structure
- Quick start
- Verification workflow
- Running the dev server & sandbox safely
- Deployment
- Ejecting a block: `blocks-vendorize`
- Key rules
- More references

## Prerequisites

- **Node.js ≥ 22**, **npm ≥ 10** (templates set `"engines": { "node": ">=22" }`).
- For AWS deploy only: AWS CLI credentials, and CDK bootstrapped once
  (`npx cdk bootstrap`). Local dev (`npm run dev`) needs neither — every block
  runs on a local mock.
- Dev deps the templates install: `typescript`, `tsx`, `vite` (SPA templates),
  `esbuild`, `aws-cdk-lib`, `constructs`.

## Decision guide

**Creating a project?**

```bash
npx @aws-blocks/create-blocks-app my-app --template react
```

Templates (run `--help` for the live list — the CLI reads each template's
`blocksTemplateDescription`, so it is the source of truth): `default`
(Vite + lit-html, auth + DynamoDB + realtime), `react`, `nextjs` (App Router,
SSR), `demo` (todo + auth), `auth-cognito`, `amplify` (add to an Amplify Gen 2
app), `backend` (bare backend stub, no frontend), `api-only` (headless JSON API:
public health check + auth-gated `DistributedTable` CRUD), `sql` (PostgreSQL on
the `Database` block with `.sql` migrations, foreign keys and a transaction),
`bare` (minimal). `api-only` and `sql` are new in `create-blocks-app@0.2.0`.
Adding to an existing
project or Amplify app: run it in the project root (`npx @aws-blocks/create-blocks-app .`).
See [PROJECT-SCAFFOLDING.md](PROJECT-SCAFFOLDING.md) for what fresh vs. existing-project mode does.

**Which auth?** All three implement one `BlocksAuth` interface, so the frontend
UI code is identical across them.
- Username/password with built-in hashing + cookie sessions → AuthBasic.
- Cognito features — MFA, user-pool groups, custom attributes → AuthCognito.
- An external IdP (Google, GitHub, Okta, Auth0, Entra, any OIDC) → AuthOIDC.

**Which storage?**
- Single-key get/put/delete (preferences, flags, sessions, caches) → KVStore.
- Structured records with secondary indexes — **the default** → DistributedTable.
- Full PostgreSQL: JOINs, transactions, foreign keys, RLS → Database (Aurora
  Serverless v2). Has cold starts and an idle floor.
- Serverless SQL, scale-to-zero, optional multi-region writes, and you do **not**
  need FK/RLS/triggers → DistributedDatabase (Aurora DSQL, a strict PostgreSQL
  subset — not CockroachDB, not Aurora v2).
- Binary files, presigned upload/download URLs → FileBucket.

**Which AI?**
- Conversational agent with tools, streaming, and persisted history → Agent.
- Semantic search / RAG over your own documents → KnowledgeBase (Bedrock KB on an
  S3 Vectors store — serverless, scales to zero).

## Block index

Read the block file when you work with that block; each is self-contained.
Core (`api-namespace`, `raw-route`) and the JSON-RPC wire model are in
[CORE-ARCHITECTURE.md](CORE-ARCHITECTURE.md).

| Category | Blocks |
|---|---|
| Core / API | [api-namespace](blocks/api-namespace.md), [raw-route](blocks/raw-route.md) |
| Auth | [auth-basic](blocks/auth-basic.md), [auth-cognito](blocks/auth-cognito.md), [auth-oidc](blocks/auth-oidc.md) |
| Data | [kv-store](blocks/kv-store.md), [distributed-table](blocks/distributed-table.md), [database](blocks/database.md), [distributed-database](blocks/distributed-database.md) |
| Storage | [file-bucket](blocks/file-bucket.md) |
| Messaging | [realtime](blocks/realtime.md), [email-client](blocks/email-client.md) |
| Compute | [async-job](blocks/async-job.md), [cron-job](blocks/cron-job.md) |
| AI | [agent](blocks/agent.md), [knowledge-base](blocks/knowledge-base.md) |
| Config | [app-setting](blocks/app-setting.md) |
| Observability | [logger](blocks/logger.md), [metrics](blocks/metrics.md), [tracer](blocks/tracer.md), [dashboard](blocks/dashboard.md) |
| Hosting / CI-CD | [hosting](blocks/hosting.md), [pipeline](blocks/pipeline.md) |

Top-level references: [CORE-ARCHITECTURE.md](CORE-ARCHITECTURE.md) (Scope,
ApiNamespace, JSON-RPC, error model, CORS, `withAuth` SSR),
[PROJECT-SCAFFOLDING.md](PROJECT-SCAFFOLDING.md),
[TESTING-REFERENCE.md](TESTING-REFERENCE.md),
[EXTENDING-EXISTING-RESOURCES.md](EXTENDING-EXISTING-RESOURCES.md) (adopting
existing AWS resources), [COMPOSITION-RECIPES.md](COMPOSITION-RECIPES.md),
[NATIVE-CLIENTS.md](NATIVE-CLIENTS.md) (Swift/Kotlin/Dart),
[TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Package entry points (subpath exports)

`@aws-blocks/blocks` exposes distinct entry points; import each symbol from the
right one (not everything is on the root). The published subpath exports:

| Import path | What it provides |
|---|---|
| `@aws-blocks/blocks` | All Building Blocks, `Scope`, `ApiNamespace`, `RawRoute`, and the error model (`ApiError`, `isBlocksError`, `hasAuthError`). Root has a browser condition so it is frontend-safe. |
| `@aws-blocks/blocks/cdk` | CDK-only surface: `BlocksStack`, `Hosting`, `BlocksPresets`, `Pipeline` (also re-exported), CDK helpers. Used from `index.cdk.ts`. |
| `@aws-blocks/blocks/client` | The generated frontend client factory (`generateClient`) — normally you import from the app's own `aws-blocks` workspace, not this directly. |
| `@aws-blocks/blocks/server` | SSR helpers: `withAuth`, `registerCookieProvider`, `clearCookieProviders`. |
| `@aws-blocks/blocks/ui` | Framework-agnostic auth UI: `Authenticator`, `AuthenticatedContent`, `AccountMenuBar`, `onAuthChange`, `broadcastAuthChange`. |
| `@aws-blocks/blocks/utils` | Test/dev helpers only — exactly `installCookieJar` and `isServerRunning`. Auth state is **not** here: `setAuthState` is a method on `auth.createApi()`, not a `/utils` export. |
| `@aws-blocks/blocks/lambda-handler` | The Lambda entry the generated `index.handler.ts` wires up — you rarely import it by hand. |
| `@aws-blocks/blocks/scripts` | Programmatic access to the dev-server / client-gen / spec scripts the npm scripts call. |
| `@aws-blocks/blocks/vendorize` | The eject engine behind the `blocks-vendorize` bin (see below). |

Some symbols are **not** on the root and must come from their own package:
`createKyselyAdapter` (`@aws-blocks/bb-data`), `RealtimeErrors`
(`@aws-blocks/bb-realtime`). Each block file states its correct import path.

## Project structure

```
my-app/
├── aws-blocks/
│   ├── index.ts           # Backend: Building Blocks + exported API (you edit this)
│   ├── index.cdk.ts       # CDK entry — BlocksStack + Hosting (edit for deploy config)
│   ├── index.handler.ts   # Lambda handler (generated)
│   ├── client.js          # Generated frontend client (never edit)
│   ├── package.json       # Workspace package with conditional exports
│   └── scripts/           # server.ts, sandbox.ts, sandbox-destroy.ts,
│                          #   deploy.ts, destroy.ts, console.ts, cleanup.ts
├── src/                   # Frontend (any framework)
├── package.json           # Root, "workspaces": ["aws-blocks"]
└── tsconfig.json
```

Backend logic goes in `aws-blocks/index.ts`. The frontend imports from the
`aws-blocks` workspace package. All lifecycle scripts live under
`aws-blocks/scripts/` — there is no top-level `deploy.ts`.

## Quick start

`aws-blocks/index.ts`:

```typescript
import { Scope, ApiNamespace, KVStore, AuthBasic } from '@aws-blocks/blocks';

const scope = new Scope('my-app');

const auth = new AuthBasic(scope, 'auth', {
  passwordPolicy: { minLength: 8 },
});
export const authApi = auth.createApi();  // auto-wires the auth endpoints

const store = new KVStore(scope, 'settings', {});

// ApiNamespace is exactly (scope, name, handler) — three positional args.
// Auth is opt-in PER METHOD; there is no auth option on the constructor.
export const api = new ApiNamespace(scope, 'api', (context) => ({
  async greet() {
    const user = await auth.requireAuth(context); // throws 401 if unauthenticated
    return { message: `Hello, ${user.username}!` };
  },
}));
```

Frontend:

```typescript
import { api } from 'aws-blocks';
const result = await api.greet(); // fully typed, no codegen
```

Every method is a public endpoint by default — gate the ones that need it with
`requireAuth`. Full API model (JSON-RPC wire format, error handling, SSR): see
[CORE-ARCHITECTURE.md](CORE-ARCHITECTURE.md).

## Verification workflow

After any change to `aws-blocks/index.ts`:

1. `npm run typecheck` (`tsc --noEmit`) — catch type errors before starting the
   server.
2. Start the dev server: `npm run dev` (runs `tsx watch aws-blocks/scripts/server.ts`,
   all blocks on local mocks, no AWS creds). Wait for the ready line — match on
   the substring **`local server running on`** (the full line is
   `AWS Blocks local server running on http://localhost:3000`; the project's own
   e2e tests match that substring). **If you are an agent, do not run `npm run dev`
   (or `sandbox`) in the foreground — it never exits and will hang you.** Launch it
   detached and poll for the ready line — see [Running the dev server & sandbox
   safely](#running-the-dev-server--sandbox-safely).
3. Type errors → fix → re-typecheck → restart.
4. Smoke-test a method — the endpoint is `POST /aws-blocks/api` (JSON-RPC, never
   REST):
   ```bash
   curl -X POST http://localhost:3000/aws-blocks/api \
     -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","method":"api.greet","params":[],"id":1}'
   ```
   JSON-RPC errors come back as **HTTP 200** with an `error` body — check the
   body, not the status.

`client.js` is regenerated on `dev`, `sandbox`, **and** `deploy` — so a newly
added/exported method is picked up by any of the three, not `dev` alone. Never
edit `client.js` by hand.

Do not move on to frontend work until the backend verifies clean.

## Running the dev server & sandbox safely

`npm run dev`, `npm run sandbox`, and any blocking server **do not exit** — running
one in the foreground hangs an autonomous agent indefinitely. Launch it detached,
poll for the ready line, do your work, then tear it down.

```bash
# 1. Start detached
tmux new-session -d -s blocks 'npm run dev'

# 2. Poll until ready (match the ready substring)
for i in $(seq 1 30); do
  sleep 3
  tmux capture-pane -t blocks -p | grep -q "local server running on" && { echo READY; break; }
done

# 3. …run typecheck / curl the endpoint / drive e2e…

# 4. Stop it
tmux kill-session -t blocks
```

For a **sandbox** the deploy takes 2–3 minutes (CDK / CloudFormation) — same
detached-poll pattern, and **always `npm run sandbox:destroy` (or `npm run destroy`)
when you're done** so you don't leave AWS resources running. For `sandbox` and
`deploy`, poll for the line starting `BLOCKS_DEPLOYED` (e.g.
`BLOCKS_DEPLOYED url=https://… api=https://…`): it is printed last, only on
success, and carries the URLs.

## Deployment

```bash
npm run sandbox          # ephemeral AWS sandbox (backend only — no Hosting)
npm run sandbox:destroy  # tear the sandbox down
npm run deploy           # production deploy (backend + Hosting frontend)
npm run destroy          # tear the production stack down (ships in the template)
```

Never run `cdk deploy` directly. Sandbox is backend-only by design — the
scaffolded `index.cdk.ts` constructs `Hosting` only when not in sandbox mode.

`aws-blocks/index.cdk.ts` (production frontend via Hosting):

```typescript
import { Hosting, BlocksStack, BlocksPresets } from '@aws-blocks/blocks/cdk';
import { join } from 'node:path';

const sandboxMode = app.node.tryGetContext('sandboxMode') === 'true';
const blocksStack = await BlocksStack.create(app, 'my-app', {
  backendHandlerPath: join(__dirname, 'index.handler.ts'),
  backendCDKPath: join(__dirname, 'index.ts'),
  // Required. Start from a preset; override fields with a spread.
  defaults: sandboxMode ? BlocksPresets.sandbox : BlocksPresets.production,
});

new Hosting(blocksStack, 'Hosting', {
  root: join(__dirname, '..'),
  buildCommand: 'npm run build',
  api: blocksStack,                 // wires the /aws-blocks/* CloudFront proxy
  // framework is auto-detected; compute.memorySize defaults to 512 (SSR only)
});
```

Custom domain takes a `certificate: ICertificate` object (BYO,
`Certificate.fromCertificateArn(...)`, still us-east-1) — there is no
`certificateArn` string prop. Full `HostingProps` and the SSR runtime detail
(Next.js is OpenNext; Nuxt/Astro/SvelteKit use the Lambda Web Adapter) are in
the hosting block file. Multi-stage CI/CD (per-branch CodePipeline, approvals,
cross-account) is the pipeline block file.

**Next.js server components** need the API URL at request time. The frontend
client reads it from the `BLOCKS_API_URL` env var; the Hosting construct injects it into the
SSR Lambda automatically on a real deploy. For **local** Next.js dev, point it at
the full RPC endpoint — `http://localhost:3000/aws-blocks/api`, never `/api`:

```json
{ "dev:next": "BLOCKS_API_URL=http://localhost:3000/aws-blocks/api next dev" }
```

SSR cookie forwarding (so a signed-in user's session reaches the API during
render) is handled by `withAuth` from `@aws-blocks/blocks/server` — see the
`withAuth (SSR)` section of [CORE-ARCHITECTURE.md](CORE-ARCHITECTURE.md).

### Production checklist

Before a real `deploy`, confirm each of these:

- **CORS:** list extra origins in `defaults.allowedOrigins` (anchored regexes;
  each entry must match the whole origin as of `core@0.6.0`). Never use a wildcard.
  The Hosting construct is same-origin so it needs none; a separate frontend
  origin does. See [CORE-ARCHITECTURE.md](CORE-ARCHITECTURE.md) § CORS.
- **Rate limiting / WAF:** API Gateway stage throttling comes from
  `defaults.throttling` (production preset 1000 rps / 2000 burst, sandbox
  200 / 400); raise it with a spread if you expect more. AWS WAF is **not** added
  for the API; wire it via CDK for a public-facing app (Hosting has its own `waf`
  prop for the CloudFront side).
- **Cross-domain auth:** pass `crossDomain: true` to an auth constructor when the
  frontend and API are on different domains (AuthCognito/AuthOIDC set
  `SameSite=None; Secure; Partitioned`; AuthBasic sets `SameSite=None; Secure`).
- **Monitoring:** Hosting `monitoring` is **on by default** (`{ enabled: true }`) —
  confirm you haven't disabled it, and add `monitoring.subscriptions` (e.g. an
  `EmailSubscription`) so CloudFront 5xx / SSR Lambda alarms reach someone. For a
  stack outside us-east-1, set `env: { account, region }` or the CloudFront alarm
  is skipped. `snsTopicArn` was removed in `hosting@0.4.0`. See `blocks/hosting.md`.
- **Errors:** throw `ApiError` for anything the client should see. A plain
  `throw new Error('...')` from an API method reaches the client as a generic
  `500 "Internal error"` (`core@0.6.0`). See CORE-ARCHITECTURE.md.
- **KVStore cost:** under the `production` preset every `KVStore` now has
  Point-in-Time Recovery on and uses the `aws/dynamodb` KMS key (`bb-kv-store@0.3.0`),
  which adds backup storage and KMS request charges.
- **IAM:** do not hand-write broad `*` IAM policies — each block already grants
  least-privilege scoped to its own resources.

## Ejecting a block: `blocks-vendorize`

`@aws-blocks/blocks` ships a `blocks-vendorize` bin (templates expose it as the
`vendorize` npm script). It copies a block's source into your project so you can
fork and customise it, rather than consuming the published package — the eject
path when a block is close but not exactly what you need. The umbrella package's
`aws-blocks.vendorize` map lists which symbol comes from which package, so the
tool knows what to vendor. Reach for it only when overriding via options is not
enough.

## Key rules

- **Always scaffold** with `create-blocks-app`; don't hand-assemble the
  `aws-blocks/` workspace.
- **Only edit `aws-blocks/index.ts`** for backend logic; edit `index.cdk.ts` for
  deploy configuration.
- **`ApiNamespace` is `(scope, name, handler)`** — three positional args, no auth
  option. Gate per method with `await auth.requireAuth(context)`.
- **Use `auth.createApi()`** to expose an auth block's endpoints; don't wrap them
  in a hand-rolled ApiNamespace.
- **Frontend imports from `'aws-blocks'`** — the workspace's conditional exports
  pick the browser vs. server build.
- **`client.js` is generated** on dev/sandbox/deploy — never edit it.
- **Hosting has no `certificateArn`** — `domain` takes `certificate?: ICertificate`,
  so pass an object: `certificate: Certificate.fromCertificateArn(scope, 'Cert', arn)`
  (import `Certificate` from `aws-cdk-lib/aws-certificatemanager`). The cert must be
  in **us-east-1**. See `blocks/hosting.md`.
- **`DistributedTable.query({ index, where, limit? })`** — `index` must be one
  declared in `indexes`. To enumerate a table you may also use `scan(options?)`,
  which is a public method returning `AsyncIterable<T>` (consume with `for await`
  or `Array.fromAsync`); it is a full-table read, so prefer a query on a GSI —
  e.g. a constant partition key — for hot paths.
- **Realtime channel budget:** the full channel path
  `{fullId}/{namespace}/{channel}` must be ≤ **1024 UTF-8 bytes** (DynamoDB
  sort-key limit) and each published message ≤ **131,072 bytes (128 KiB)**,
  envelope included (`bb-realtime@0.3.0`; earlier versions capped it at 32 KB).
  Keep Scope IDs
  short so the path fits — there is no separate namespace-length limit.
- **Secrets live in `AppSetting`, not `.env`.** Store API keys / credentials with
  `new AppSetting(scope, id, { secret: true })` — never hardcode them or read them
  from `.env`. See `blocks/app-setting.md`.
- **`Logger` does not redact.** Never pass raw credentials, tokens, or secrets to
  Logger methods — it provides serialization safety, not redaction. Sanitize the
  context object before logging. See `blocks/logger.md`.
- **Route constraints:** no root `/` route, and a wildcard must be the **last**
  path segment (`/v1/*`, not `/v1/*/x`) — API Gateway rejects otherwise. See
  `blocks/raw-route.md`.
- **Inject block config with `registerConfig()`**, never `handler.addEnvironment()`
  (Lambda env has a ~4 KB cap). The **`BLOCKS_` env prefix is framework-reserved** —
  don't use it for app code.
- **JSON-RPC errors are HTTP 200** with an `error` body — check the body.

## More references

- Project setup & templates → [PROJECT-SCAFFOLDING.md](PROJECT-SCAFFOLDING.md)
- Testing patterns → [TESTING-REFERENCE.md](TESTING-REFERENCE.md)
- Brownfield / existing AWS resources → [EXTENDING-EXISTING-RESOURCES.md](EXTENDING-EXISTING-RESOURCES.md)
- Multi-block recipes → [COMPOSITION-RECIPES.md](COMPOSITION-RECIPES.md)
- Common errors & fixes → [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- Native mobile/desktop clients → [NATIVE-CLIENTS.md](NATIVE-CLIENTS.md)
