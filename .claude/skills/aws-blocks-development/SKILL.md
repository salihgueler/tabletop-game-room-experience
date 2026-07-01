---
name: building-aws-blocks-apps
description: Builds fullstack TypeScript applications on AWS using @aws-blocks/blocks. Provides correct import paths, API signatures, project scaffolding, and deployment patterns. Use when working with @aws-blocks/blocks, any Building Block (KVStore, DistributedTable, Agent, AuthBasic, AuthCognito, AuthOIDC, Realtime, Database, DistributedDatabase, AsyncJob, CronJob, KnowledgeBase, AppSetting, FileBucket, EmailClient, Logger, Metrics, Tracer, Dashboard), ApiNamespace, BlocksStack, RawRoute, Pipeline, Hosting, or the create-blocks-app CLI.
---

# AWS Blocks Development

## Prerequisites

- **Node.js ≥ 22**
- **npm ≥ 10**
- For AWS deployment (optional):
  - AWS CLI configured with credentials
  - CDK bootstrapped in your account (`npx cdk bootstrap`)
- Dev dependencies: `typescript`, `tsx`, `vite`, `concurrently`, `aws-cdk-lib`, `constructs`, `@types/node`

## Decision guide

**Creating a new project?**
→ `npm create @aws-blocks/blocks-app@latest my-app`
→ Templates: `default` (Vite SPA), `react` (React SPA), `nextjs` (Next.js SSR), `demo` (todo + auth), `auth-cognito` (Cognito MFA/groups), `amplify` (Amplify Gen 2 migration), `backend` (API-only, no frontend), `bare` (minimal empty scaffold)

**Adding to an existing project?**
→ Scaffold into a temp dir, copy only `aws-blocks/` folder, then manually merge workspace config, scripts, and dependencies. The scaffolder overwrites root `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`.

**Which auth?**
- Simple username/password + built-in UI → [AuthBasic](blocks/auth-basic.md)
- Passwordless, MFA, social federation, Cognito features → [AuthCognito](blocks/auth-cognito.md)
- External IdP (Google, GitHub, Okta, Auth0, Entra) → [AuthOIDC](blocks/auth-oidc.md)

**Which storage?**
- Simple key-value (preferences, flags, caches) → [KVStore](blocks/kv-store.md)
- Structured data + indexes (**default choice**) → [DistributedTable](blocks/distributed-table.md)
- SQL JOINs / transactions → [Database](blocks/database.md)
- Multi-region SQL / serializable transactions → [DistributedDatabase](blocks/distributed-database.md)
- Binary files / presigned URLs → [FileBucket](blocks/file-bucket.md)

**Which AI?**
- Conversational agent with tools + streaming → [Agent](blocks/agent.md)
- RAG over documents (vector search) → [KnowledgeBase](blocks/knowledge-base.md)

## Core concepts

Architecture overview (Scope, ApiNamespace, JSON-RPC, CORS, withAuth): See [CORE-ARCHITECTURE.md](CORE-ARCHITECTURE.md)

## Block references

Read the relevant file when working with a specific block:

| Category | Block | Reference |
|----------|-------|-----------|
| Core | ApiNamespace | [blocks/api-namespace.md](blocks/api-namespace.md) |
| Core | RawRoute | [blocks/raw-route.md](blocks/raw-route.md) |
| Auth | AuthBasic | [blocks/auth-basic.md](blocks/auth-basic.md) |
| Auth | AuthCognito | [blocks/auth-cognito.md](blocks/auth-cognito.md) |
| Auth | AuthOIDC | [blocks/auth-oidc.md](blocks/auth-oidc.md) |
| Data | KVStore | [blocks/kv-store.md](blocks/kv-store.md) |
| Data | DistributedTable | [blocks/distributed-table.md](blocks/distributed-table.md) |
| Data | Database | [blocks/database.md](blocks/database.md) |
| Data | DistributedDatabase | [blocks/distributed-database.md](blocks/distributed-database.md) |
| Storage | FileBucket | [blocks/file-bucket.md](blocks/file-bucket.md) |
| Messaging | Realtime | [blocks/realtime.md](blocks/realtime.md) |
| Messaging | EmailClient | [blocks/email-client.md](blocks/email-client.md) |
| Compute | AsyncJob | [blocks/async-job.md](blocks/async-job.md) |
| Compute | CronJob | [blocks/cron-job.md](blocks/cron-job.md) |
| AI | Agent | [blocks/agent.md](blocks/agent.md) |
| AI | KnowledgeBase | [blocks/knowledge-base.md](blocks/knowledge-base.md) |
| Config | AppSetting | [blocks/app-setting.md](blocks/app-setting.md) |
| Observability | Tracer | [blocks/tracer.md](blocks/tracer.md) |
| Observability | Logger | [blocks/logger.md](blocks/logger.md) |
| Observability | Metrics | [blocks/metrics.md](blocks/metrics.md) |
| Observability | Dashboard | [blocks/dashboard.md](blocks/dashboard.md) |
| Hosting | Hosting | [blocks/hosting.md](blocks/hosting.md) |
| CI/CD | Pipeline | [blocks/pipeline.md](blocks/pipeline.md) |

**Hosting & deployment:** See [blocks/hosting.md](blocks/hosting.md)
**Common errors & fixes:** See [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
**Native mobile/desktop clients:** See [NATIVE-CLIENTS.md](NATIVE-CLIENTS.md)

## Project structure

```
my-app/
├── aws-blocks/
│   ├── index.ts           # Backend: Building Blocks + API (edit this)
│   ├── index.cdk.ts       # CDK entry point (generated, don't edit)
│   ├── index.handler.ts   # Lambda handler (generated, don't edit)
│   ├── deploy.ts          # Production deploy script
│   ├── package.json       # Workspace package with conditional exports
│   └── scripts/           # Dev server, sandbox, cleanup scripts
├── src/                   # Frontend (any framework)
├── package.json           # Root with "workspaces": ["aws-blocks"]
└── tsconfig.json
```

Backend lives in `aws-blocks/index.ts`. Frontend imports from `'aws-blocks'` (workspace package). The `client.js` is auto-generated — never edit it.

## Quick start

```typescript
import { Scope, ApiNamespace, KVStore, AuthBasic } from "@aws-blocks/blocks";

const scope = new Scope("my-app");
const auth = new AuthBasic(scope, "auth", {
  sessionDuration: 86400,
  passwordPolicy: { minLength: 8, requireDigits: true },
});
const store = new KVStore(scope, "settings", {});

export const authApi = auth.createApi();

export const api = new ApiNamespace(scope, "api", (context) => ({
  async greet(name: string) {
    const user = await auth.requireAuth(context);
    return { message: `Hello, ${user.username}!` };
  },
}));
```

Frontend:
```typescript
import { api } from "aws-blocks";
const result = await api.greet("World"); // fully typed
```

**Running Agents locally:** See [blocks/agent.md](blocks/agent.md)

## Verification workflow

After any code change to `aws-blocks/index.ts`:

1. Run `npm run typecheck` (or `npx tsc --noEmit`) to catch type errors before starting the server
2. Start dev server (tmux) → look for **"Blocks local server running"**
3. If type errors appear → fix → rerun typecheck → restart
4. After adding new exports → run dev once to regenerate `client.js`
5. Test API call: `curl -X POST http://localhost:3001/aws-blocks/api -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"api.methodName","params":[],"id":1}'`
6. Verify response is correct

**Do not proceed to frontend work until the backend verifies clean.**

## Deployment

```bash
npm run sandbox          # Deploy ephemeral sandbox to AWS (hot reload, fast CDK watch)
npm run sandbox:destroy  # Tear down sandbox resources
npm run deploy           # Production deploy with Hosting (full CDK deployment)
npm run destroy          # Tear down production deployment
```

Do NOT run `cdk deploy` directly.

**CDK imports for hosting/deployment** (`aws-blocks/index.cdk.ts`):
```typescript
import { Hosting, BlocksStack } from '@aws-blocks/blocks/cdk';
import { join } from 'node:path';

const blocksStack = await BlocksStack.create(app, 'my-app', { /* ... */ });
new Hosting(blocksStack, 'Hosting', {
    root: join(__dirname, '..'),
    buildCommand: 'npm run build',
    framework: 'nextjs', // or omit for SPA auto-detection
    api: blocksStack,
    compute: { memorySize: 1024, timeout: 30 }, // SSR Lambda config
    domain: { domainName: 'app.example.com', certificateArn: '...' }, // optional
    waf: { enabled: true }, // optional
});
```

**Frontend UI imports** (Authenticator widget):
```typescript
import { Authenticator, onAuthChange, broadcastAuthChange } from "@aws-blocks/blocks/ui";
```

**Next.js local dev** — set `BLOCKS_API_URL` env var for server components:
```json
{ "dev:next": "BLOCKS_API_URL=http://localhost:3001/api next dev" }
```

## Key rules

- **Always scaffold** — `npm create @aws-blocks/blocks-app@latest`
- **Only edit `aws-blocks/index.ts`** for backend logic
- **Use `auth.createApi()`** for auth — auto-wires IAM. Do NOT build custom ApiNamespace wrappers
- **Use `npm run sandbox`** to deploy — handles CDK context, removal policies
- **Frontend imports from `'aws-blocks'`** — conditional exports handle browser vs server
- **`client.js` is auto-generated** — run dev to regenerate, never edit manually
- **DistributedTable `query()` takes `{ index, where, limit? }`** — index must be from `indexes` config
- **To list all items, use a constant partition key** with a GSI — no scan operation
- **Use short Scope IDs** (2-3 chars) — Realtime namespace names must stay under 50 chars
- **Run `npm run dev` once after adding new exports** to regenerate `client.js`
- **Create `aws-blocks/destroy.ts` manually** — scaffolder doesn't include production destroy

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common errors and fixes.

## Additional references

- **Project setup & templates:** [PROJECT-SCAFFOLDING.md](PROJECT-SCAFFOLDING.md)
- **Testing patterns:** [TESTING-REFERENCE.md](TESTING-REFERENCE.md)
- **Brownfield / existing resources:** [EXTENDING-EXISTING-RESOURCES.md](EXTENDING-EXISTING-RESOURCES.md)
