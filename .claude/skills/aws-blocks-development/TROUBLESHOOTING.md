# Troubleshooting

## Contents
- [Registry & installation](#registry--installation)
- [Local development](#local-development)
- [API & Protocol](#api--protocol)
- [AsyncJob](#asyncjob)
- [Agent](#agent)
- [Database](#database)
- [Authentication](#authentication)
- [Realtime](#realtime)
- [Hosting & deployment](#hosting--deployment)
- [Astro integration](#astro-integration)

---

## Registry & installation

**401 on `npm view @aws-blocks/blocks`**
Check `~/.npmrc` — token line must use `//` prefix (no `https:`), domain must match exactly.

**404 on `npm create` or `npm install` in new project**
Registry config must be in `~/.npmrc` (home directory), not project-level `.npmrc`.

**Can't resolve `@aws-blocks/core`**
Transitive dependency. Ensure `.npmrc` scopes `@aws-blocks` to the private registry.

## Local development

**Dev server won't start**
Requires Node ≥ 22 and `tsx` as dev dependency.

**TypeScript errors on import**
Use `"module": "ES2022"` and `"moduleResolution": "bundler"` in tsconfig.json. Do NOT use `nodenext`.

**"Blocks API URL not configured"**
Client can't find config.json. The dev server now serves `/.blocks-sandbox/config.json` automatically (fixed in Jun 2026). Ensure dev server is running (`npm run dev`). In production, check `/.blocks-sandbox/config.json` is accessible. For Next.js, the template now includes a sandbox config route — if you scaffolded before this fix, add a route handler that proxies `/.blocks-sandbox/config.json` to the Blocks dev server.

**PGlite "postmaster.pid" error**
Previous dev server didn't shut down cleanly. Delete `.bb-data/` and restart.

**DistributedTable `query()`: "Index 'X' not found"**
The `index` property on `query()`'s options object must be an index name from the `indexes` config — not a field name. `table.query({ index: "userId", where: {...} })` fails if there's no index named `"userId"`. Define indexes explicitly and use those names.

**DistributedTable: no way to list all items**
There's no scan operation. To query all items, add a constant partition key (e.g., `type: "USER"`) and create a GSI on it. Then query with `type: { equals: "USER" }`.

**Scaffolder overwrites root files in existing projects**
Running `npm create @aws-blocks/blocks-app@latest` in a directory with an existing project overwrites `package.json`, `tsconfig.json`, `vite.config.ts`, and `.gitignore`. Always scaffold into a temp directory and copy `aws-blocks/` files manually when adding to an existing project.

**WSL2: dev server binds to all interfaces**
The dev server now binds to `0.0.0.0` (all interfaces) for WSL2 compatibility. No manual `--host` flag needed.

## Authentication

**401 on refresh (cookies not persisting)**
Production requires `SameSite=None; Secure`. Ensure HTTPS and same-origin or proper CORS.

**"User not confirmed" on sign in**
With `codeDelivery` configured, users must confirm email first. Call `auth.confirmSignUp(username, code)`.

**Authenticator shows wrong state**
Call `broadcastAuthChange(user)` after manual auth state changes.

**Authenticator renders twice in React**
React strict mode double-mounts effects. The naive `appendChild`/`removeChild` pattern fails because the ref flag resets between unmount and remount. Fix: clear the container with `innerHTML = ""` before appending:

```tsx
useEffect(() => {
  const container = ref.current;
  if (!container) return;
  container.innerHTML = "";
  const el = Authenticator(authApi);
  container.appendChild(el);
  return () => {
    container.innerHTML = "";
  };
}, []);
```

**`authApi.signOut()` doesn't exist**
The `AuthStateApi` interface only has `getAuthState()` and `setAuthState()`. Sign out via:

```typescript
await authApi.setAuthState("signOut", {});
broadcastAuthChange(null);
```

**Authenticator widget looks unstyled / doesn't match app theme**
The widget renders plain HTML with inline styles. Override with `!important` CSS scoped to a container class. Key selectors: `h3` (heading), `input` (fields), `button` (submit), `div[style*="color: red"]` (errors).

## AsyncJob

**Jobs not executing locally**
Jobs run synchronously in-process. Check dev server console for errors.

**"PayloadTooLarge"**
SQS limit is 256KB. Store large data in KVStore/S3 and pass a reference.

**"BatchTooLarge"**
`submitBatch` max is 10 items. Split into multiple calls.

## Agent

**Agent returns canned/mock responses instead of real LLM output**
By default, agents use the `canned` provider locally (keyword-based mock). For real responses, configure `model.local` with Ollama or another openai-api compatible endpoint:
```typescript
model: {
  deployed: { provider: 'bedrock', modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0' },
  local: { provider: 'openai-api', modelId: 'llama3.1:8b', endpoint: 'http://localhost:11434/v1', apiKey: 'ollama' },
}
```
Ensure Ollama is running: `ollama serve` + `ollama pull llama3.1:8b`.

**"ModelUnavailable" error — all model candidates failed**
Check logs for specific failure per candidate. Common causes: Ollama not running, wrong endpoint/port, model not pulled. Health checks ping `GET /v1/models` at the configured endpoint (now respects global API prefix — fixed in Jun 2026). Uses `OPENAI_API_KEY` env var fallback if no `apiKey` configured. The agent tries candidates in order — if all fail (including the implicit `canned` fallback for local), this error fires.

**Agent stream hangs / no chunks arrive on frontend**
The Agent routing architecture is: `stream()` → `AsyncJob.submit()` → (async) `runAgent()` → publishes chunks to `Realtime`. Locally, AsyncJob runs in-process and Realtime uses a local WebSocket on the same port (3001). **Important:** Subscribe to the channel BEFORE calling `stream()` — early chunks may be lost otherwise. If chunks don't arrive:
- Check dev server console for errors in the AsyncJob handler
- Ensure your frontend subscribes to the correct `channelId` returned by `stream()`
- Ensure you `await sub.established` before calling `stream()` (or use the `useChat` hook which handles ordering)
- Verify WebSocket connection to `ws://localhost:3001` is not blocked

**Tools declared as plain array — "Type '...' is not assignable" compile error**
`tools` must use the callback pattern: `tools: (tool) => ({ name: tool({...}) })`. A plain array/object is rejected at compile time. The callback enables TypeScript to infer typed `input` from Zod schemas. Handler signature is `async ({ input, context }) =>` (destructured), not `async (input) =>`.

**"InterruptRequired" error**
Agent paused for tool approval (a tool with `needsApproval: true` was called). Use `agent.resume(channelId, responses)` to provide user responses and continue. Call `agent.getPendingInterrupts(conversationId)` to reload pending approvals after page refresh.

**"PersistenceRequired" error**
You called a conversation CRUD method (`getConversation`, `listConversations`, etc.) on an agent configured with `inferenceOnly: true`. Inference-only agents are stateless — remove `inferenceOnly` or avoid persistence calls.

**"BrowserNotSupported" error**
Agent was instantiated in browser code. The Agent BB is server-side only — ensure it's only imported in `aws-blocks/index.ts` (backend), never in frontend. Frontend accesses the agent via API methods exposed through `ApiNamespace`.

**Agent tool calls produce wrong/random inputs**
With the canned provider, tool inputs are auto-generated from Zod schemas (`z.string()` → `"sample"`, `z.number()` → `1`). This is by design — canned doesn't reason about inputs. Use a real model (Ollama/Bedrock) for meaningful tool calls.

**Conversation data lost between dev server restarts**
Mock persistence uses `.bb-data/` (local disk). If this folder is deleted or you're in `inferenceOnly` mode, data won't persist. Check `.bb-data/` exists. For a fresh start: `rm -rf .bb-data`.

## API & Protocol

**"404 Not Found" when curling API endpoints REST-style**
AWS Blocks uses JSON-RPC 2.0, not REST. All API calls go to a single POST endpoint: `/aws-blocks/api`. Method format: `"namespace.methodName"`, params as positional array. Do NOT curl individual paths like `/api/greet`.

**"Not fixed scaffolded package.json name" — CDK stack name collision**
CDK derives stack names from `package.json` `name` field. After scaffolding, rename it from the default to your app name to avoid collisions with other sandboxes.

**CORS errors in production**
Set `CORS_ALLOWED_ORIGINS` env var on the Lambda with regex patterns (e.g. `https://.*\.example\.com`). Hosting construct auto-adds CloudFront domain. Localhost patterns are auto-allowed in dev/sandbox.

**SSR auth failures (401 in server components)**
Use `withAuth()` from `@aws-blocks/blocks/server` to forward cookies in server-rendered pages. Auto-detects Next.js. Throws 401 when no cookies found — wrap in try/catch for graceful unauthenticated rendering.

## Database

**"relation does not exist"**
Migrations haven't run or table name is wrong. Check `migrations/` folder — files need numeric prefixes (e.g., `001_create_users.sql`).

**Transaction rolled back**
Any error inside `db.transaction()` triggers rollback. Check constraint violations, null values in NOT NULL columns.

**Aurora timeout in sandbox**
Aurora Serverless v2 takes 10-30s to wake from pause. First request may timeout; subsequent are fast.

**Deploy fails: "Missing environment variables BLOCKS*undefined*...\_CLUSTER_ARN"**
`createKyselyAdapter(db)` is called at module top level. During deploy, the client code generator imports `index.ts` with `--conditions=aws-runtime`, which expects env vars that don't exist yet. Fix: lazy-init the Kysely adapter.

```typescript
// BAD — crashes during deploy
const kysely = createKyselyAdapter<Schema>(db);

// GOOD — created on first API call
let _kysely: ReturnType<typeof createKyselyAdapter<Schema>> | null = null;
function getKysely() {
  if (!_kysely) _kysely = createKyselyAdapter<Schema>(db);
  return _kysely;
}
// Then use getKysely() instead of kysely in API methods
```

**PGlite "malformed array literal" for TEXT[] columns**
PGlite doesn't auto-convert JavaScript arrays to PostgreSQL array literals. Use explicit PostgreSQL array format with `::text[]` cast.

```typescript
// BAD — PGlite rejects JS arrays
await db.execute(sql`INSERT INTO t (tags) VALUES (${["a", "b"]})`);

// GOOD — PostgreSQL array literal format
const tagsArr = `{"a","b"}`;
await db.execute(sql`INSERT INTO t (tags) VALUES (${tagsArr}::text[])`);
```

**PGlite errors in Next.js dev:next terminal**
During SSR of client components, Next.js resolves `aws-blocks` via the `default` export condition to `index.ts`, which imports Database and triggers PGlite in the wrong context. These are terminal warnings, not actual failures — the browser-side code uses `client.js` correctly. Server components use the `react-server` condition and work fine.

**Database CDK construct: "Cannot find entry file at .../src/migration-lambda.ts"**
Known bug: the Database CDK construct hardcodes `src/migration-lambda.ts` but the published package only ships `dist/`. Workaround: create a re-export shim at the expected path:

```bash
mkdir -p node_modules/@aws-blocks/bb-data/src
echo 'export { handler } from "../dist/migration-lambda.js";' > node_modules/@aws-blocks/bb-data/src/migration-lambda.ts
```

Note: this file will be lost on `npm install`. Add a `postinstall` script to automate it.

**Realtime "channelNamespaceName must be between 1 and 50 characters"**
AppSync has a 50-char limit on channel namespace names. The full name is `{stackName}-{scopeId}-{realtimeId}-{namespaceName}`. With long sandbox stack names, this easily exceeds 50 chars. Fix: use short Realtime IDs (e.g., `"rt"` not `"live"`) and short namespace names (e.g., `"match"` not `"matchmaking"`).

## Hosting & deployment

**"Build output directory not found"**
Provide `buildCommand` in Hosting props, or ensure output directory exists before deploy.

**"No index.html found in the build output directory" (MissingIndexHtmlError)**
The Hosting SPA adapter requires `index.html` in the build output. SSR frameworks like TanStack Start don't produce one. Either switch to a standard SPA build (Vite + React) or use `framework: "nextjs"` for supported SSR frameworks.

**"Invariant failed" after deploying TanStack Start app**
TanStack Start's client bundle uses `hydrateStart` which expects server-rendered HTML. Serving it as a static SPA (with a generated `index.html`) fails because there's no SSR context to hydrate against. Solution: convert to a standard Vite + React SPA if all data fetching is client-side. See HOSTING-REFERENCE.md for details.

**Site shows "Access Denied" after deploy**
CloudFront propagation takes 2-3 minutes. Hard refresh. If persists, check S3 bucket has objects.

**Brief 403 during redeployment**
Fixed: Hosting now uses atomic redeploys — S3 assets are uploaded atomically with no gap where old assets are deleted before new ones are available. Update to the latest version if you still see this.

**SSR Lambda returns 500**
Check CloudWatch Logs. Common: `BLOCKS_API_URL` not set, Next.js build failed, missing runtime deps. The Next.js template now includes the sandbox config route by default (previously missing, causing "API URL not configured" locally).

**config.json returns 404**
Ensure `api` prop was provided to Hosting. Check S3 deployment completed.

**API URL is `undefined` in production (client gets "API call failed")**
The Hosting construct requires `api: blocksStack` (the BlocksStack instance). This sets up the CloudFront proxy that routes `/api/*` to API Gateway and generates `config.json` with the correct relative URL. The old `apiUrl` string prop was removed in Blocks 0.4.0.

```typescript
new Hosting(blocksStack, "Hosting", {
  api: blocksStack, // ✅ BlocksStack instance — sets up CloudFront proxy
});
```

**Custom domain not working**
Certificate must be in `us-east-1`. DNS must point to CloudFront. Allow 10-15 min for validation.

**CSP blocks API/WebSocket connections in production**
`connect-src` must allow `https://*.amazonaws.com` and `wss://*.amazonaws.com` for API Gateway and AppSync Realtime. CSP does NOT support double wildcards like `*.execute-api.*.amazonaws.com` — the browser silently ignores them. Use single wildcards only.

## Realtime

**WebSocket fails locally**
Check nothing else is using port 3001.

**Messages not arriving in production**
Check channel token validity (tokens expire). Verify namespace and channel names match exactly.

**"Invalid token" on subscribe**
Tokens are scoped to specific namespace/channel. Don't reuse across channels.

## Astro integration

**Astro: "ShouldBeCreatedInStackScope" during deploy**
React islands with `client:load` are SSR-rendered during `astro build`. The SSR pass runs in Node.js where `aws-blocks` resolves to `index.ts` (the backend) via the `default` export condition. The backend code creates CDK constructs (`AuthBasic`, `Database`) which fail because there's no CDK Stack in the build context. Fix: use `client:only="react"` to skip SSR. Islands render only on the client where `aws-blocks` correctly resolves to `client.js` via the `browser` condition.

**Astro: React children in islands lose interactivity**
Astro renders slot children as static HTML. React components passed as children to a React island become dead HTML — hooks don't run, state doesn't initialize. Fix: compose React components within the same island file. For example, instead of `<AuthGate client:only="react"><AdminEditor /></AuthGate>`, create a combined `AdminPage.tsx` that imports both `AuthGate` logic and `AdminEditor` as a single React island.

**Astro: 404 on subpath navigation in production**
CloudFront + S3 doesn't resolve `/posts` → `/posts/index.html`. Astro's default `build.format: "directory"` generates `/posts/index.html`, but CloudFront only resolves `index.html` for the root path. Fix: use `build.format: "file"` in `astro.config.mjs` which generates `/posts.html` instead. Update all internal links to include the `.html` extension.

## Angular integration

**Angular: "Blocks API URL not configured" during local dev**
Angular's `ng serve` doesn't serve `.blocks-sandbox/config.json`. The Blocks client fetches `/.blocks-sandbox/config.json` to discover the API URL, but Angular's dev server only serves files from `src/`. Fix: add `config.json` as a static asset in `angular.json` (`"assets": [{ "glob": "**/*", "input": "src/.blocks-sandbox", "output": ".blocks-sandbox" }]`) and/or add a `proxy.conf.json` to forward `/.blocks-sandbox/*` and `/api` requests to `localhost:3001`.
