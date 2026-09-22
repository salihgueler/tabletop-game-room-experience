# Troubleshooting

Every entry below maps to an error string or thrown error found in
`packages/*/src`. Error names ending in `Exception` are the `name` on the thrown
`Error`; catch them with `isBlocksError(e, XxxErrors.Foo)` from `@aws-blocks/core`.
Hosting errors are a `HostingError` whose `name` is the code shown (they also carry
a `resolution` string).

## Contents
- [Registry & installation](#registry--installation)
- [Local development](#local-development)
- [API & protocol](#api--protocol)
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
Check `~/.npmrc` — the token line must use the `//` prefix (no `https:`) and the
domain must match the registry exactly.

**404 on `npm create` / `npm install` in a new project**
Registry config must live in `~/.npmrc` (home directory), not a project-level
`.npmrc`. Scope `@aws-blocks` to the private registry so transitive deps like
`@aws-blocks/core` resolve.

## Local development

**TypeScript errors on import of `aws-blocks`**
Use `"module": "ES2022"` and `"moduleResolution": "bundler"` in `tsconfig.json`.
Do not use `nodenext`.

**`Blocks API URL not configured`**
Thrown by the client when it can't find a
config. The message lists the three things to ensure:
1. you ran `npm run deploy` (which deploys `config.json`), or
2. the SSR Lambda has the `BLOCKS_API_URL` env var, or
3. `config.json` exists at `/.blocks-sandbox/config.json`.
Locally this means the dev server (`npm run dev`) is running.

**PGlite `postmaster.pid` error**
The previous dev server didn't shut down cleanly. Delete `.bb-data/` and restart.

**DistributedTable `query()`: `Index 'X' not found`**
Message built by the DistributedTable error `indexNotFound`. The
`index` option on `query()` must be an **index name from the `indexes` config**,
not a field name. `table.query({ index: "userId", ... })` fails unless an index
literally named `"userId"` exists. Define indexes explicitly and query by those
names.

**DistributedTable: no way to list all items**
There is no scan operation. Add a constant partition key (e.g. `type: "USER"`),
create a GSI on it, and query `type: { equals: "USER" }`.

## API & protocol

**`404 Not Found` curling API endpoints REST-style**
Blocks uses JSON-RPC 2.0, not REST. All calls POST to a single endpoint,
`/aws-blocks/api` (the `BLOCKS_RPC_PREFIX` constant).
Method format is `"namespace.methodName"` with params as a positional array. Do
not curl per-method paths like `/api/greet`.

**CORS errors in production**
Set `CORS_ALLOWED_ORIGINS` on the Lambda with regex patterns (e.g.
`https://.*\.example\.com`). The Hosting construct auto-adds the CloudFront
domain; localhost is auto-allowed in dev/sandbox.

**SSR auth failures (401 in server components)**
Use `withAuth()` from `@aws-blocks/blocks/server` to forward cookies in
server-rendered pages. It throws when no cookies are found — wrap in try/catch
for graceful unauthenticated rendering.

## AsyncJob

Error names come from `AsyncJobErrors`.
The full set:

| `AsyncJobErrors.*` | `name` value | Thrown when |
|---|---|---|
| `PayloadTooLarge` | `PayloadTooLargeException` | Serialized payload exceeds 256 KB. Store large data in KVStore/S3 and pass a reference. |
| `BatchEmpty` | `BatchEmptyException` | A batch has zero payloads (must contain at least 1). |
| `BatchTooLarge` | `BatchTooLargeException` | A batch has more than 10 payloads. Split into multiple `submitBatch` calls. |
| `ValidationFailed` | `ValidationFailedException` | Schema validation of the payload fails. |
| `BatchSubmitFailed` | `BatchSubmitFailedException` | One or more messages in a batch fail to send (AWS only). |
| `Timeout` | `AsyncJobTimeoutException` | `waitUntilComplete()` gives up before the job reaches a terminal state. |
| `StatusNotTracked` | `StatusNotTrackedException` | `getStatus()` or `waitUntilComplete()` is called on a job created **without** `trackStatus: true`. This is the one you'll hit most: enable `trackStatus` on the job to use either method. |
| `InvalidOption` | `InvalidOptionException` | An `AsyncJobOptions` value is outside its supported range (thrown at synth time). |

**Jobs not executing locally**
Jobs run synchronously in-process locally. Check the dev server console for
handler errors.

## Agent

Error names come from `AgentErrors`
(`PersistenceRequired`, `InvalidModelConfig`, `ModelUnavailable`,
`BrowserNotSupported`, `StreamFailed`, `InterruptRequired`; each maps to a
`...Exception` name).

**Agent returns canned/mock responses instead of real LLM output**
By default agents use the `canned` provider locally (keyword-based mock). For
real responses, configure `model.local` (e.g. Ollama or another openai-api
compatible endpoint) and ensure it's running:
```typescript
model: {
  deployed: { provider: 'bedrock', modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0' },
  local: { provider: 'openai-api', modelId: 'llama3.1:8b', endpoint: 'http://localhost:11434/v1', apiKey: 'ollama' },
}
```
With the canned provider, tool inputs are auto-generated from Zod schemas
(`z.string()` → `"sample"`) — meaningful tool calls need a real model.

**`ModelUnavailableException` — all model candidates failed**
(`AgentErrors.ModelUnavailable`, `agent.ts`.) The agent tried every candidate and
all failed. Common causes: Ollama not running, wrong endpoint/port, model not
pulled. Falls back to `OPENAI_API_KEY` if no `apiKey` is configured.

**`InterruptRequiredException`**
(`AgentErrors.InterruptRequired`.) A tool with `needsApproval: true` paused the
run for approval, or `resume()` was called without a response / conversationId.
Provide responses via `agent.resume(...)`; reload pending approvals with
`agent.getPendingInterrupts(conversationId)`.

**`PersistenceRequiredException`**
(`AgentErrors.PersistenceRequired`.) A persistence call (`getConversation`,
`listConversations`, etc.) was made, or `userId` was omitted, on an agent
configured `inferenceOnly: true`. Remove `inferenceOnly`, pass `options.userId`,
or avoid persistence calls.

**`BrowserNotSupportedException`**
(`AgentErrors.BrowserNotSupported`.) The Agent BB
is server-side only and was imported into browser code. Import it only in the
backend (`aws-blocks/index.ts`); the frontend reaches it through API methods.

## Database

**`relation "..." does not exist`**
This is a **raw PostgreSQL/PGlite error**, not a Blocks-defined one — Blocks does
not produce this string. The `pg-error-translator` renames such errors to
`DatabaseErrors.QueryFailed` (`name = 'QueryFailedException'`) but passes the
Postgres **message** through verbatim (`bb-data/src/engines/pg-error-translator.ts`;
error set on the Database block). Cause: migrations haven't run, or the
table name is wrong. Migration files in `migrations/` need numeric prefixes (e.g.
`001_create_users.sql`).

**Transaction rolled back**
Any error inside `db.transaction()` triggers a rollback. Check for constraint
violations and NULLs in NOT NULL columns.

**Deploy fails: `Missing environment variables BLOCKS_..._CLUSTER_ARN`**
`createKyselyAdapter(db)` was called at module top level. During deploy the client
generator imports `index.ts` with `--conditions=aws-runtime`, expecting env vars
that don't exist yet. Lazy-init the adapter instead:
```typescript
let _kysely: ReturnType<typeof createKyselyAdapter<Schema>> | null = null;
function getKysely() {
  if (!_kysely) _kysely = createKyselyAdapter<Schema>(db);
  return _kysely;
}
```

**PGlite `malformed array literal` for `TEXT[]` columns**
PGlite doesn't auto-convert JS arrays to PostgreSQL array literals. Pass an
explicit literal with a cast:
```typescript
const tagsArr = `{"a","b"}`;
await db.execute(sql`INSERT INTO t (tags) VALUES (${tagsArr}::text[])`);
```

## Authentication

**`signOut()` on `authApi` doesn't exist**
`AuthStateApi` (from `@aws-blocks/blocks/ui`) exposes `getAuthState()` and
`setAuthState(input)`. `setAuthState` takes a **single action-payload object**;
sign out with:
```typescript
await authApi.setAuthState({ action: 'signOut' });
broadcastAuthChange(null);
```
Other actions follow the same shape:
`setAuthState({ action: 'signIn', username, password })`,
`{ action: 'signUp', ... }`, `{ action: 'confirmSignUp', username, code }`.

**Authenticator shows wrong state after a manual auth change**
Call `broadcastAuthChange(user)` (imported from `@aws-blocks/blocks/ui`) after
changing auth state yourself.

**Authenticator renders twice in React (strict mode)**
Strict mode double-mounts effects and the naive `appendChild`/`removeChild`
pattern's ref flag resets between unmount and remount. Clear the container before
appending:
```tsx
useEffect(() => {
  const container = ref.current;
  if (!container) return;
  container.innerHTML = "";
  container.appendChild(Authenticator(authApi));
  return () => { container.innerHTML = ""; };
}, []);
```

## Realtime

**Messages not arriving in production**
Verify namespace and channel names match exactly, and that the channel token is
still valid (tokens expire and are scoped to a specific namespace/channel — don't
reuse across channels).

## Hosting & deployment

Hosting errors are a `HostingError` whose `name` is the
code below.

**``AWS credentials could not be verified for `npm run <command>` (<errorName>).``**
A pre-synth credential check (shipped in `@aws-blocks/blocks@0.4.0`, commit
`0ac3879`, #424; still present at the current `0.6.0` pin) failed before `npm run sandbox` / `npm run deploy` provisioned
anything. It **fails fast only
on credential-class errors** — the seven names in `CREDENTIAL_ERROR_NAMES`:
`CredentialsProviderError`, `ExpiredToken`,
`ExpiredTokenException`, `InvalidClientTokenId`, `UnrecognizedClientException`,
`SignatureDoesNotMatch`, `TokenRefreshRequired`. Fix: refresh your credentials
(re-auth / `aws sso login` / renew the token) and re-run. Two non-blocking cases:
it **skips with a warning** when neither `AWS_REGION` nor `AWS_DEFAULT_REGION` is
set (no region to probe), and it **warns and continues** on non-credential errors
(network, throttling, `AccessDenied` — the identity resolved, so it lets the
deploy surface the real error).

**`BuildOutputNotFoundError` — "Build output directory not found at …"**
(`adapters/spa.ts`.) The SPA build output dir doesn't exist. Run your build first;
the adapter auto-detects `dist/`, `build/`, or `out/`, or pass an explicit
`buildOutputDir`.

**`BuildOutputEmptyError`**
(`adapters/spa.ts`.) The output dir exists but is empty — your build likely failed
silently. Run it locally and verify files land in the output directory.

**`MissingIndexHtmlError` — "No index.html found in the build output directory."**
(`adapters/spa.ts`.) The SPA adapter requires `index.html` in the build output.
SSR frameworks that don't emit one won't work as a plain SPA — use a standard
Vite + React SPA build, or a supported SSR framework via the matching adapter.
(SSR adapters throw their own output-missing errors instead:
`SvelteKitBuildOutputMissingError`, `AstroBuildOutputMissingError`,
`NitroOutputNotFoundError`, `OpenNextOutputNotFoundError`.)

**Site shows "Access Denied" right after deploy**
CloudFront propagation takes a few minutes. Hard-refresh; if it persists, confirm
the S3 bucket actually has objects.

**SSR Lambda returns 500**
Check CloudWatch Logs. Common causes: `BLOCKS_API_URL` not set, the framework
build failed, or missing runtime deps.

**`config.json` returns 404**
Pass the `api` prop to Hosting and confirm the S3 deployment completed.

**API URL is `undefined` in production ("API call failed")**
The Hosting construct needs `api: blocksStack` (the BlocksStack instance). That
wires the CloudFront proxy routing `/aws-blocks/api` to API Gateway and generates
`config.json` with the correct relative URL:
```typescript
new Hosting(blocksStack, "Hosting", { api: blocksStack });
```

**Custom domain not working — `InvalidCertificateRegionError`**
(`constructs/dns_construct.ts`.) The ACM certificate must be in `us-east-1`, DNS
must point at CloudFront, and validation can take 10–15 min. Related DNS errors
from the same construct: `MissingCertificateError`, `DuplicateDnsRecordsError`,
`InvalidDomainConfigError`.

**CSP blocks API/WebSocket connections in production**
`connect-src` must allow `https://*.amazonaws.com` and `wss://*.amazonaws.com`.
CSP does not honor double wildcards like `*.execute-api.*.amazonaws.com` — the
browser silently ignores them, so use single wildcards.

## Astro integration

**Astro: React island runs backend code at build time**
React islands with `client:load` are SSR-rendered during `astro build`. That pass
runs in Node where `aws-blocks` resolves to the backend (`index.ts`) via the
`default` export condition, so backend CDK constructs execute with no Stack in
scope. Fix: use `client:only="react"` so the island renders only on the client,
where `aws-blocks` resolves to `client.js` via the `browser` condition.

**Astro: React children in islands lose interactivity**
Astro renders slot children as static HTML, so React components passed as children
to an island become dead HTML. Compose the components within a single island file
instead of nesting islands.

**Astro: 404 on subpath navigation in production**
CloudFront + S3 doesn't resolve `/posts` → `/posts/index.html` for non-root paths
with Astro's default `build.format: "directory"`. Use `build.format: "file"` in
`astro.config.mjs` (generates `/posts.html`) and include the `.html` extension in
internal links.
