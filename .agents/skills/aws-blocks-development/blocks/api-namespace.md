# ApiNamespace

Type-safe RPC: backend methods callable from the frontend with full TypeScript
types — no codegen, no route definitions. The entry point for almost every
Blocks app's server-side logic.

**Use it for** your app's API surface — anything the frontend calls.

**Don't use it for** raw HTTP control (webhooks, custom headers/status, file
streaming) — pair it with RawRoute for those. It is not optional for a normal
app; RawRoute complements it, it doesn't replace it.

## Contents

- Import and minimal example
- Constructor: `(scope, name, handler, options?)`
- Authentication is per method, not constructor-wired
- Methods, arguments, and the frontend call
- The `context` object
- Errors — the `ApiError` contract and the wire
- Multiple namespaces
- Wire protocol and the RPC endpoint
- No batch support
- Body size limit
- What it provisions

## Import and minimal example

```typescript
import { Scope, ApiNamespace } from '@aws-blocks/blocks';

const scope = new Scope('my-app');

export const api = new ApiNamespace(scope, 'api', (context) => ({
  async greet(name: string, times: number) {          // methods take multiple positional args
    return { message: `Hello, ${name}!`.repeat(times) };
  },
  async createPost(input: NewPost) {
    const user = await auth.requireAuth(context);      // 401 if unauthenticated
    return db.posts.create({ ...input, authorId: user.userId });
  },
}));
```

Frontend — fully typed, zero codegen:

```typescript
import { api } from 'aws-blocks';
const result = await api.greet('world', 3); // { message: string }
```

## Constructor: `(scope, name, handler, options?)`

The constructor is `new ApiNamespace(scope, name, handler, options?)`. `scope`
is required; `handler` is `(context) => ({ ...methods })`. The optional fourth
argument (`ApiNamespaceOptions`, new in `core@0.8.0` / `@aws-blocks/blocks@0.9.0`)
has exactly one field, `compute`, which places the namespace on its own
`Compute` (see below).

There is **no** `{ auth }` option. A form like
`new ApiNamespace(scope, name, { auth }, handler)` does not exist (the handler is
always the third argument), and neither does a `withAuth()` method.

### Running a namespace on its own compute

```typescript
import { ApiNamespace, Compute } from '@aws-blocks/blocks';

const reportsCompute = new Compute(scope, 'reports-compute', { type: 'serverless', memory: 4096 });

export const reports = new ApiNamespace(scope, 'reports', (context) => ({
  async build(month: string) { /* … */ },
}), { compute: reportsCompute });
```

- Only a `serverless` compute can serve a namespace. A `container` compute is a
  type error.
- Without `compute`, the namespace uses its scope's compute (`Scope` option
  `compute`), then the app's default compute.
- Routing follows the **export name** (`reports` above), not the second
  argument. The client calls `POST /aws-blocks/api/reports` and the shared
  gateway sends that path to the namespace's compute.
- API calls stay capped at about 29 seconds by API Gateway, whatever the
  compute's `maxTimeoutSeconds`. Put longer work in an `AsyncJob`.
- A separate compute is placement, not isolation: every compute runs the same
  bundle under the app's one execution role.
- In local dev every namespace still runs in the one dev server.

Full `Compute` options: [compute](compute.md).

## Authentication is per method, not constructor-wired

Every method is a **public, internet-reachable endpoint with no auth by
default** — including in the local mock, so an ungated method passes every local
check and still ships callable by anyone. Gating is opt-in **per method** by
calling an auth block at the top of the handler:

```typescript
export const api = new ApiNamespace(scope, 'api', (context) => ({
  async listPublicPosts() {                    // no requireAuth → anyone can call
    return db.posts.findPublished();
  },
  async deletePost(id: string) {
    await auth.requireRole(context, 'admins'); // gated
    return db.posts.delete(id);
  },
}));
```

`requireAuth` / `requireRole` come from your auth block (e.g.
`@aws-blocks/bb-auth-cognito`, `@aws-blocks/bb-auth-basic`) and take `context`.

## The `context` object

The handler factory receives `context: BlocksContext`. Its `request` carries:

| Field | Type | Notes |
|---|---|---|
| `request.headers` | `Headers` | Incoming request headers (cookies, auth). |
| `request.json()` / `request.text()` | `Promise<any>` / `Promise<string>` | Parse the raw body. |
| `request.body` | `ReadableStream<Uint8Array> \| null` | Raw body stream. |
| `request.url` | `URL` | Absolute request URL (host header + path + query). |
| `request.params` | `Record<string, string>` | Path params — populated for RawRoute; always `{}` for RPC methods. |
| `request.signal` | `AbortSignal \| undefined` | Fires when the Lambda is about to return a 504 timeout. **Pass it to `fetch()` / AWS SDK calls** so in-flight work is cancelled instead of running (and billing) past the client's timeout. `undefined` in local dev or with no deadline configured. |

`context.response` exposes `headers`, `status`, and `send(body)` (mainly used by
RawRoute; RPC methods return a value instead).

## Errors — the `ApiError` contract and the wire

Throw `ApiError` to send a typed, status-carrying error to the client
(imported from `@aws-blocks/core`):

```typescript
import { ApiError, isBlocksError } from '@aws-blocks/core';

async createUser(username: string) {
  try {
    await store.put(username, {}, { ifNotExists: true });
  } catch (e) {
    if (isBlocksError(e, KVStoreErrors.ConditionalCheckFailed)) {
      throw new ApiError('Username already taken', 409, { name: e.name, cause: e });
    }
    throw e;
  }
}
```

Full contract: `new ApiError(message, status, options?)` where `options` is
`{ name?: string; cause?: unknown; retriable?: boolean }`. `status` is the HTTP
status; `name` defaults to `'ApiError'`; `retriable` defaults to `false`.

**What crosses the wire:** `message`, `status`, `name`, and `retriable` are
serialized to the client, and `ApiError` is reconstructed there — so the client
branches on the **`name`** with the same `isBlocksError(e, SomeErrors.X)` call
that works server-side. `cause` stays **server-side only** (it is not
serialized). Match on `name`/error constants, never on the human `message`.

`retriable` marks whether the caller can retry the same action without
restarting the broader flow (e.g. a wrong MFA code in a multi-step auth
challenge) — meaningful mainly to state-machine flows.

## Multiple namespaces

Declare separate instances with different names:

```typescript
export const publicApi = new ApiNamespace(scope, 'public', (context) => ({ /* ... */ }));
export const adminApi  = new ApiNamespace(scope, 'admin',  (context) => ({ /* ... */ }));
```

Frontend: `import { publicApi, adminApi } from 'aws-blocks';`

The generated client names each namespace by its **export name** (`publicApi`,
`adminApi`), and uses that name in both the request path and the JSON-RPC
`method`.

## Wire protocol and the RPC endpoint

All calls are JSON-RPC 2.0 over POST under `/aws-blocks/api` (the
`BLOCKS_RPC_PREFIX` constant — namespaced under `/aws-blocks` so it never
shadows framework `/api/*` SSR routes). The `method` is `namespace.methodName`.

As of `@aws-blocks/blocks@0.9.0` the typed client POSTs to a **per-namespace
path**, `/aws-blocks/api/{namespace}`, where `{namespace}` is the backend export
name. This is what lets one gateway route different namespaces to different
computes:

```
POST /aws-blocks/api/publicApi
{ "jsonrpc": "2.0", "method": "publicApi.greet", "params": ["world", 3], "id": 1 }
```

The body still carries `namespace.method`, and that is what the server
dispatches. The path namespace must match it exactly, or the request is rejected
with `-32600` Invalid Request. The bare `POST /aws-blocks/api` still works for
raw HTTP callers and older native clients, and always runs on the default
compute.

`params` may be an array (positional, the normal case) or an object (its values
are taken in order). On error the response carries `error.code` = the HTTP status
for application errors (e.g. `409`) or a reserved `-32xxx` for protocol errors,
and `error.data.name` carries the error name the client matches on.

## No batch support

There is no JSON-RPC batch support. A request body that is a non-object or an
array (a batch) simply fails the `jsonrpc` + `method` check and comes back as
`InvalidRequest` (`-32600`). Send one method call per request.

## Body size limit

As of the **0.4.0** release (PR #390, `5bfae0a`): request bodies are capped at
10 MiB (`MAX_RPC_BODY_BYTES`) at the shared parser. An oversized body is rejected
with HTTP `413` and `error.data.name` `'PayloadTooLarge'` — match with
`isBlocksError(e, 'PayloadTooLarge')` or check `e.status === 413`. In production
API Gateway also rejects ~10 MB bodies at the edge; the parser guard exists so
the dev/mock server enforces the same limit. This guard was **not** in the
`0.3.1` release.

## What it provisions

- Routes on the stack's one shared API Gateway REST API: `/aws-blocks/api` and
  `/aws-blocks/api/{proxy+}` reach the default compute, and each namespace on a
  non-default compute gets its own literal `/aws-blocks/api/{namespace}` resource
  that reaches that compute's function
- The shared Blocks handler Lambda (JSON-RPC dispatch)
- IAM execution role (one role shared by every compute)
