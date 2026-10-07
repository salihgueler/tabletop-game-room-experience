# AWS Blocks — Core Architecture

Scope, ApiNamespace, RawRoute, the JSON-RPC wire model, the error model, CORS,
and SSR auth forwarding — the runtime plumbing every block plugs into. Per-block
API detail lives in the `blocks/<name>.md` files; this is the shared substrate.

## Contents

- [Scope](#scope)
- [ApiNamespace](#apinamespace)
- [Wire protocol — JSON-RPC 2.0](#wire-protocol--json-rpc-20)
- [RawRoute](#rawroute)
- [Error model — ApiError / isBlocksError](#error-model--apierror--isblockserror)
- [withAuth (SSR)](#withauth-ssr)
- [CORS](#cors)
- [UI components](#ui-components)
- [Runtime config resolution](#runtime-config-resolution)
- [Development modes](#development-modes)
- [Common mistakes](#common-mistakes)

---

## Scope

`Scope` is the resource boundary; every Building Block attaches to one.

```typescript
import { Scope } from '@aws-blocks/blocks';
const scope = new Scope('my-app');
```

Nested scopes namespace their resources under the parent's ID chain. Keep IDs
short — they compose into resource names and into the Realtime channel path,
which has a 1024-byte budget.

---

## ApiNamespace

Type-safe RPC with automatic frontend/backend integration. Methods become
callable from the frontend with full TypeScript types — no codegen. The
constructor is exactly `(scope, name, handler)` — three positional args; there is
no options object and no auth parameter.

```typescript
export const api = new ApiNamespace(scope, 'api', (context) => ({
  async greet(name: string) { return { message: `Hello, ${name}!` }; },
}));
```

Frontend: `import { api } from 'aws-blocks'; const r = await api.greet('World');`

Every method is a **public endpoint by default**. Gate the ones that need it, per
method:

```typescript
async createPost(input: NewPost) {
  const user = await auth.requireAuth(context); // throws 401 if unauthenticated
  return db.posts.create({ ...input, authorId: user.userId });
}
```

The local mock applies no auth either, so an ungated method passes every local
check and still ships callable by anyone.

`context.request` carries `headers`, `json()`, `text()`, `url` (absolute
request URL), `params` (RawRoute path params; always `{}` for RPC methods), and
`signal` (an `AbortSignal` that fires on the HTTP-deadline 504). `context.response`
carries `headers`, `status`, and `send()`.

---

## Wire protocol — JSON-RPC 2.0

**Single POST endpoint:** `/aws-blocks/api`.

| Environment | URL |
|---|---|
| Local dev | `http://localhost:3000/aws-blocks/api` |
| Sandbox | `http://localhost:3000/aws-blocks/api` (proxied to the deployed Lambda) |
| Deployed | `https://<api-id>.execute-api.<region>.amazonaws.com/prod/aws-blocks/api` |

**Request:** `{ "jsonrpc": "2.0", "method": "<namespace>.<method>", "params": [...args], "id": 1 }`

- **`method`** — `namespace.method` (e.g. `"api.greet"`). The parser requires a
  `.`; a method with no dot is rejected.
- **`params`** — positional. An array is used directly; an object has its
  `Object.values()` taken in insertion order. Reserved JSON-RPC codes:
  `ParseError -32700`, `InvalidRequest -32600`, `MethodNotFound -32601`,
  `InvalidParams -32602`, `InternalError -32603`.
- **Errors** — returned as HTTP **200** with a JSON-RPC `error` body (never a
  non-2xx). Check the body.

```bash
curl -X POST http://localhost:3000/aws-blocks/api \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"api.greet","params":["World"],"id":1}'
# → {"jsonrpc":"2.0","result":{"message":"Hello, World!"},"id":1}
```

**No batch support.** There is no batch handling in the code at all — Blocks does
not recognize the JSON-RPC array-batch form. A top-level JSON **array** body is
not treated as a batch and is not "refused as a batch"; it simply fails the
`jsonrpc:"2.0"` + string-`method` check in `parseRpcRequest` (an array has neither
field) and comes back as a single `-32600` Invalid Request. Send one request per
call.

**Body-size cap.** `parseRpcRequest` rejects a body over
`MAX_RPC_BODY_BYTES = 10 MiB` (`10 * 1024 * 1024`) before parsing, returning an
error whose `name` is `PayloadTooLarge` and whose code is the real HTTP status
`413` (so `e.status === 413` and `isBlocksError(e, 'PayloadTooLarge')` both work).
This guard shipped in the core RPC parser in the **0.4.0** release
(PR #390, `5bfae0a`) and is still present at the current **0.7.0** pin; it was
**not** in `0.3.1`. In production API Gateway also
rejects oversized bodies at the edge; the same limit is enforced in the parser so
the dev/mock server behaves identically.

---

## RawRoute

An escape hatch to a raw HTTP handler when JSON-RPC doesn't fit (webhooks,
health checks, redirect endpoints). Import from `@aws-blocks/blocks`.

```typescript
import { RawRoute } from '@aws-blocks/blocks';

new RawRoute(scope, 'health', {
  method: 'GET',              // 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'
  path: '/health',            // optional; '/users/{id}' captures a param, '/v1/*' a wildcard
  handler: async (context) => { context.response.send('ok'); },
});
```

`path` is optional — when omitted it is derived from the scope-chain IDs.
Path params land in `context.request.params`. Registering the same method+path
twice throws `RawRouteErrors.DuplicateRoute` (`'DuplicateRouteException'`).

---

## Error model — ApiError / isBlocksError

Typed error handling across the wire. Import both from `@aws-blocks/blocks`.

```typescript
import { ApiError, isBlocksError } from '@aws-blocks/blocks';

// Server: catch a BB error, re-throw with an HTTP status and a stable name
try {
  await store.put(key, value, { ifNotExists: true });
} catch (e) {
  if (isBlocksError(e, KVStoreErrors.ConditionalCheckFailed)) {
    throw new ApiError('Username already taken', 409, { name: e.name, cause: e });
  }
  throw e;
}

// Client: the SAME isBlocksError works — the name survives the wire
catch (e) {
  if (isBlocksError(e, KVStoreErrors.ConditionalCheckFailed)) { /* handle */ }
}
```

- **Constructor:** `new ApiError(message, status, { name?, cause?, retriable? })`.
- **Errors cross by `name`.** `isBlocksError(e, name)` narrows on `e.name` and
  works identically on server and client because the reconstructed `ApiError`
  preserves the name. When no `name` is given it defaults to `'ApiError'`
  (`DEFAULT_API_ERROR_NAME`) — carrying no BB-level meaning.
- **`status` ↔ code.** The status becomes the JSON-RPC `error.code`. On decode, a
  **positive** code maps straight back to `ApiError.status`; a reserved `-32xxx`
  code collapses to `500`.
- **`cause`** stays server-side (never serialized). **`retriable`** is a hint that
  crosses the wire (defaults `false`); it means the same action can be retried
  without restarting the broader flow (e.g. a wrong-MFA-code re-prompt).
- **`hasAuthError(state, name)`** — a separate guard for the object returned by
  `setAuthState`/`getAuthState` (a plain value, not a thrown `Error`, so
  `isBlocksError` does not apply). Import from `@aws-blocks/blocks`.
- **`broadcastAuthChange(user)`** — import from `@aws-blocks/blocks/ui`, not the
  root.

### What reaches the client (`core@0.6.0`)

The RPC serializer sorts every throw from an API method into three cases:

| Thrown | Client receives |
|---|---|
| `ApiError` | Verbatim: `status`, `message`, `name`, `retriable` |
| A Building Block error (`KVStoreErrors.*`, `DatabaseErrors.*`, …) | Its BB `name` and BB-authored `message`, so `isBlocksError` still matches |
| Anything else: bare `Error`, AWS SDK / driver exception, non-`Error` throw | Generic `500`, `"Internal error"`, no `name` |

The full error (with `cause`) is always logged server-side. This is a
**behavior change**: before `core@0.6.0` a plain `throw new Error('Todo not found')`
showed its message to the client. Now it collapses to `"Internal error"`, and a
custom `Error` subclass loses its `.name` on the wire. Throw `ApiError` for every
error the user should see:

```typescript
// ❌ client sees 500 "Internal error"
throw new Error('Todo not found');
// ✅ client sees 404, the message, and the name
throw new ApiError('Todo not found', 404, { name: 'TodoNotFoundException' });
```

BB errors cross because they carry a non-enumerable wire-safe brand, not
because their `name` differs from `'Error'`. `brandBlocksError(err)` and
`isWireSafeError(e)` (exported from `@aws-blocks/core`) are that brand; they are
meant for Building Block authors. App code should use `ApiError`. A branded
message never contains raw driver or SDK text (for example `bb-data` re-tags a
driver failure as `QueryFailed` with "The database query failed"; Cognito SDK
failures in `bb-auth-cognito` get a BB-authored message per exception name), so
the raw text is only in server logs.

---

## withAuth (SSR)

**Package:** `@aws-blocks/blocks/server` (server-only — never bundled for the
browser).

During SSR, the inbound browser cookies aren't automatically attached to API
calls. `withAuth` forwards them via an `AsyncLocalStorage` the framework
populates.

```typescript
import { withAuth } from '@aws-blocks/blocks/server';

// Next.js — cookies detected automatically in a server component
const posts = await withAuth(() => api.listMyPosts());

// Other frameworks — pass the cookie header explicitly
const posts = await withAuth(() => api.listMyPosts(), request.headers.get('cookie'));
```

- Next.js and Nuxt/Nitro cookie providers are registered by default; add others
  with `registerCookieProvider`.
- The API URL itself comes from `BLOCKS_API_URL` (or `BLOCKS_CONFIG`), which the
  Hosting construct injects into the SSR Lambda on deploy — see
  [runtime config resolution](#runtime-config-resolution).

---

## CORS

Two channels feed the allowlist:

- **`CORS_ALLOWED_ORIGINS`**: your regex patterns, comma-separated. The usual
  way to set it is `defaults.allowedOrigins` on `BlocksStack.create` (the default
  compute writes it to the env var). `BlocksPresets.sandbox` allows localhost
  (`^https?://(localhost|127\.0\.0\.1)(:\d+)?$`); `BlocksPresets.production`
  allows none.
- **`CORS_HOSTING_ORIGINS`**: the Hosting distribution's own origin, injected by
  the framework as a **raw** (literal) origin and escaped once at runtime, so the
  dots in `d123.cloudfront.net` match literally. Never set it yourself, and never
  pre-escape it.

**Anchoring (`core@0.6.0`).** Every `CORS_ALLOWED_ORIGINS` entry is compiled as
`^(?:<entry>)$`, so it must match the **whole** origin, including every branch
of a top-level `|`. Before 0.6.0 an entry starting with `^` had no end anchor,
so `^https://app\.example\.com` also matched `https://app.example.com:8443` and
`https://app.example.com.extra`. If you relied on that prefix match, add the
suffix explicitly: `^https://app\.example\.com(:\d+)?`. Escape literal dots
(`app\.example\.com`); `.*` still works as a wildcard.

| Scenario | Handling |
|---|---|
| Hosting construct | Automatic: same-origin, plus the distribution origin via `CORS_HOSTING_ORIGINS` |
| Local dev | `blocks-backend` allows `^https?://(localhost\|127\.0\.0\.1)(:\d+)?$` |
| Sandbox | `BlocksPresets.sandbox.allowedOrigins` covers localhost |
| Separate frontend origin | Add it to `defaults.allowedOrigins` |

```typescript
const blocksStack = await BlocksStack.create(app, stackName, {
  backendHandlerPath, backendCDKPath,
  defaults: {
    ...BlocksPresets.production,
    allowedOrigins: ['https://myapp\\.com', 'https://.*\\.myapp\\.com'],
  },
});
```

Preflight (`OPTIONS`) responses allow the `Content-Type`, `Authorization` and
`x-blocks-user-agent` request headers, both deployed and in the local dev server
(`core@0.6.0`; local dev previously allowed only `Content-Type`, which broke
bearer-token calls locally).

An unmatched origin gets no `Access-Control-Allow-Origin` header (the browser
blocks the call) plus a `[CORS]` CloudWatch warning.

---

## UI components

From `@aws-blocks/blocks/ui` — framework-agnostic (vanilla DOM):

| Export | Description |
|---|---|
| `Authenticator(api)` | Provider-agnostic auth UI (state-machine driven) |
| `AuthenticatedContent(api, render)` | Renders only when signed in; auto-updates |
| `AccountMenuBar(api)` | Header bar: username + Sign Out, or Sign In |
| `onAuthChange(api, cb)` | Subscribe to auth changes (same window + cross-tab) |
| `broadcastAuthChange(user)` | Broadcast changes from a custom auth UI |

```typescript
import { Authenticator, AuthenticatedContent, onAuthChange } from '@aws-blocks/blocks/ui';
import { authApi } from 'aws-blocks';

document.getElementById('auth')!.appendChild(Authenticator(authApi));
document.getElementById('main')!.appendChild(
  AuthenticatedContent(authApi, (user) => { /* render */ }),
);
onAuthChange(authApi, (user) => console.log(user ? 'in' : 'out'));
```

---

## Runtime config resolution

The frontend client discovers the API URL through `resolveApiUrl`, in this order:

1. **`process.env.BLOCKS_API_URL`** — injected into the SSR Lambda by the Hosting
   construct; also what you set for local Next.js dev
   (`http://localhost:3000/aws-blocks/api`). A value containing an unresolved CDK
   `${Token[...]}` throws with the "add `export const dynamic = 'force-dynamic'`"
   fix.
2. **`process.env.BLOCKS_CONFIG`** — full config JSON as an env var.
3. **`.blocks-sandbox/config.json`** on the filesystem (Node).
4. **`GET /.blocks-sandbox/config.json`** from the hosting origin (browser).

| Environment | Served by | Contents |
|---|---|---|
| Local dev | Dev server (automatic) | `{ "apiUrl": "http://localhost:3000" }` |
| Sandbox / Production | CloudFront | `{ "apiUrl": "https://<api>.execute-api..." }` |

The config path is `/.blocks-sandbox/config.json` (note the leading dot on the
directory), **not** `/config.json`. A `{"_placeholder":true}` in build output is
the synth-time stub — the real `apiUrl` is still an unresolved CloudFormation
token at build time and is filled in during deploy.

---

## Development modes

### `npm run dev` — local mocks

- Every Building Block runs on a **local mock** (no AWS credentials).
- Unified front door on **port 3000** (backend + frontend, same origin).
- Mock data persists under `.bb-data/` — delete to reset.
- Ready line: `AWS Blocks local server running on http://localhost:3000`
  (match the substring `local server running on`).

### `npm run sandbox` — AWS-deployed backend

- Deploys the backend to AWS (Lambda + API Gateway); **no Hosting** (backend
  only).
- Frontend served locally, proxied to the deployed backend
  (`BLOCKS_API_URL` set by `sandbox.ts`, so the dev server proxies to it).
- Config auto-discovered from `/.blocks-sandbox/config.json`.

---

## Common mistakes

1. **REST-style endpoints.** There is no `GET /api/getData`. Every call is
   `POST /aws-blocks/api` via JSON-RPC; the namespace is in `method`, not the URL.
2. **Not exporting the API.** The frontend only sees `export`ed symbols from
   `aws-blocks/index.ts`.
3. **Expecting non-200 on error.** JSON-RPC errors are HTTP 200 with an `error`
   body — check the body, then branch on `isBlocksError(e, name)`.
4. **Forgetting `requireAuth`.** Every method is public by default.
5. **Passing auth to the `ApiNamespace` constructor.** It takes
   `(scope, name, handler)` only; auth is per-method.
6. **Reaching for `Database` when `DistributedTable` suffices** — Aurora has cold
   starts and an idle floor; DynamoDB scales to zero.
7. **Blocking the API with long work** — offload to `AsyncJob`.
8. **Not renaming the scaffolded package** — CDK derives the stack name from it.
9. **Throwing a plain `Error` for a user-facing failure.** Since `core@0.6.0` its
   message never reaches the client (`500 "Internal error"`). Throw `ApiError`.
