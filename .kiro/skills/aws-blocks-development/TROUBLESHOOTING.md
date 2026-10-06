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

**Database / DistributedDatabase fails on the first local query after upgrading**
`bb-data@0.3.1` / `bb-distributed-data@0.2.1` (in `@aws-blocks/blocks@0.7.0`)
moved PGlite from 0.2 (embedded Postgres 16) to 0.5.8 (embedded Postgres 18).
A `.bb-data` directory created by the old version still *looks* initialized, so
nothing is recreated and the mismatch only shows up at the first query, with no
automatic recovery. Delete that block's `.bb-data/` folder (or all of
`.bb-data/`) and restart; local data is recreated by your migrations. CI starts
clean and `.bb-data` is gitignored, so only existing local checkouts hit this.

**`npm run dev` now rejects an `AppSetting` that used to work**
Since `bb-app-setting@0.3.1` the local mock runs the same option checks as CDK
synth and throws `ValidationFailedException` for: `secret` + `schema`, `schema`
without `value`, `kmsKeyArn` without `secret: true` or empty, a `secret` with a
`value`, `external` with a `value` or without `name`, and a non-secret with no
`value`. The last one is the usual culprit: it used to become an empty string
locally and only failed at deploy. Give it a `value` (or make it a secret).

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
Add the frontend origin to `defaults.allowedOrigins` (regex patterns, e.g.
`https://.*\.example\.com`; they become `CORS_ALLOWED_ORIGINS`). The Hosting
construct adds its own CloudFront origin; localhost is allowed in dev and by the
sandbox preset.

**CORS broke after upgrading to `@aws-blocks/blocks@0.7.0`**
`core@0.6.0` anchors every allowlist entry as `^(?:<entry>)$`. An entry that
used to match as a prefix, such as `^https://app\.example\.com` for
`https://app.example.com:8443`, no longer does. Add the suffix you need:
`^https://app\.example\.com(:\d+)?`. Also check that literal dots are escaped.

**Client shows `500 "Internal error"` where it used to show your message**
Since `core@0.6.0` only an `ApiError` or a Building Block error carries its
message to the client. A plain `throw new Error('...')` (or a raw AWS SDK /
database driver error) is logged server-side and replaced with a generic 500.
Throw `new ApiError(message, status, { name })` for errors the user should see.
See CORE-ARCHITECTURE.md § What reaches the client.

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
not produce this string. The Database block re-tags such errors as
`DatabaseErrors.QueryFailed` (`name = 'QueryFailedException'`). Since
`@aws-blocks/blocks@0.7.0` the raw Postgres text appears **only in server logs**
(as the error's `cause`); the client sees the stable message "The database query
failed". Look in the dev-server output or CloudWatch for the real message. Cause:
migrations haven't run, or the table name is wrong. Migration files in
`migrations/` need numeric prefixes (e.g. `001_create_users.sql`).

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
reuse across channels). Since `bb-realtime@0.3.0` the client reconnects by
itself after a drop, but messages published during the gap are lost (pub/sub is
not durable): backfill in `onReconnect`. A subscription older than ~1h (channel
token) or ~2h (connect token) cannot reconnect without a `refresh` callback and
ends with `onDisconnect('error')`.

**`publish` throws `ValidationFailed` for a large message**
The limit is 128 KiB (131,072 bytes) for the whole serialized envelope, channel
path included. Versions before `bb-realtime@0.3.0` wrongly capped it at 32 KB.

## Hosting & deployment

Hosting errors are a `HostingError` whose `name` is the
code below.

**``AWS credentials could not be verified for `npm run <command>` (<errorName>).``**
A pre-synth credential check (shipped in `@aws-blocks/blocks@0.4.0`, commit
`0ac3879`, #424; still present at the current `0.7.0` pin) failed before `npm run sandbox` / `npm run deploy` provisioned
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
The SPA build output dir doesn't exist. Run your build first;
the adapter auto-detects `dist/`, `build/`, or `out/`, or pass an explicit
`buildOutputDir`.

**`BuildOutputEmptyError`**
The SPA output dir exists but is empty — your build likely failed
silently. Run it locally and verify files land in the output directory.

**`MissingIndexHtmlError` — "No index.html found in the build output directory."**
The SPA adapter requires `index.html` in the build output.
SSR frameworks that don't emit one won't work as a plain SPA — use a standard
Vite + React SPA build, or a supported SSR framework via the matching adapter.
(SSR adapters throw their own output-missing errors instead:
`SvelteKitBuildOutputMissingError`, `AstroBuildOutputMissingError`,
`NitroOutputNotFoundError`, `OpenNextOutputNotFoundError`.) An Astro
server/hybrid build with no static assets leaves `dist/client` empty; since
`hosting@0.4.0` that is valid (only `dist/server/entry.mjs` is required), so
`AstroBuildOutputMissingError` for an empty `dist/client` means you are on an
older version.

**`SsrCacheKeyCredentialsRequiredError` at synth**
`ssrDefaultTtl` is above 0 but no credential is in the SSR cache key
(`hosting@0.4.0` fails closed). Add `cacheKeyCookies: ['<session cookie>']`
and/or `cacheKeyHeaders: ['authorization']`, or remove `ssrDefaultTtl`. See
`blocks/hosting.md` § SSR edge caching.

**Synth error after upgrading: `snsTopicArn` / `monitoringTopic` does not exist**
Both were removed in `hosting@0.4.0`. Use
`monitoring: { subscriptions: [new EmailSubscription('oncall@example.com')] }`,
and `hosting.monitoring.alarms` / `.alarmTopics` instead of `monitoringTopic`.

**Synth warning: CloudFront alarm skipped**
The stack is outside us-east-1 and its account is unresolved, so the us-east-1
support stack for the CloudFront 5xx alarm can't be built. Set
`env: { account, region }` on the stack.

**Synth warning: end-of-life Node.js runtime**
A compute pins `nodejs18.x` or `nodejs20.x`, both past their Lambda deprecation
dates. It still synthesizes; move to `nodejs22.x` / `nodejs24.x` or drop the
runtime option to use the default.

**`cdk synth --strict` fails on a wrapped `KVStore`**
`KVStore` with `table: KVStore.fromExisting(...)` now warns when you also pass
`removalPolicy`, `deletionProtection`, `ttl`, `pointInTimeRecovery` or
`encryption`; `--strict` turns the warning into a failure. Remove those options.

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
The ACM certificate must be in `us-east-1`, DNS
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
Do **not** switch to `build.format: "file"`. The Hosting edge router resolves
directory indexes (`/posts` → `/posts/index.html`) for Astro's default
`output: 'static'` + `build.format: "directory"`. A 404 usually means the site is
served under a sub-path: set Hosting `basePath` to match. See
`blocks/hosting.md` § `basePath` and Astro subpaths.
