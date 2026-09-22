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
- Constructor — exactly `(scope, name, handler)`
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

## Constructor — exactly `(scope, name, handler)`

The constructor is three positional arguments: `new ApiNamespace(scope, name,
handler)`. `scope` is required; `handler` is `(context) => ({ ...methods })`.

There is **no** options object and **no** `{ auth }` argument. A four-argument
form like `new ApiNamespace(scope, name, { auth }, handler)` does not exist, and
neither does a `withAuth()` method.

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

## Wire protocol and the RPC endpoint

All calls are JSON-RPC 2.0 over a **single POST to `/aws-blocks/api`** (the
`BLOCKS_RPC_PREFIX` constant — namespaced under `/aws-blocks` so it never
shadows framework `/api/*` SSR routes). The `method` is `namespace.methodName`:

```
POST /aws-blocks/api
{ "jsonrpc": "2.0", "method": "public.greet", "params": ["world", 3], "id": 1 }
```

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

- API Gateway HTTP API with the single `/aws-blocks/api` POST route
- The shared Blocks handler Lambda (JSON-RPC dispatch)
- IAM execution role
