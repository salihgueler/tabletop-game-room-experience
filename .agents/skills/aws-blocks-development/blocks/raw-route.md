# RawRoute

**When to use:** Raw HTTP endpoints outside JSON-RPC — webhook receivers, file upload endpoints, health checks, anything needing custom HTTP method/headers/status codes.

**When NOT to use:** Standard app API methods (use ApiNamespace — it handles auth, CORS, typing automatically).

Path-based HTTP routing for endpoints needing full request/response control.

## Contents

- When to use / when not to use
- Constructor
- Path patterns
- Handler signature
- Examples
- Registration rules
- `ctx.request` / `ctx.response` reference
- Local mock vs AWS
- What it provisions

## When to Use

Webhooks, REST endpoints, health checks, file downloads, OAuth callbacks — any protocol that doesn't fit the `ApiNamespace` RPC model.

## When NOT to Use

Typed RPC calls from the frontend → use `ApiNamespace` instead.

## Constructor

```typescript
import { RawRoute } from '@aws-blocks/blocks';
new RawRoute(scope, id, { method, path?, handler })
```

| Param | Type | Description |
|-------|------|-------------|
| `method` | `HttpMethod` | `'GET'` \| `'POST'` \| `'PUT'` \| `'DELETE'` \| `'PATCH'` \| `'HEAD'` \| `'OPTIONS'` |
| `path` | `string?` | URL pattern — derived from scope-chain IDs when omitted |
| `handler` | `(ctx: BlocksContext) => Promise<void>` | Request handler |

## Path Patterns

| Pattern | Params | Notes |
|---------|--------|-------|
| `/health` | `{}` | Exact match |
| `/users/{id}` | `{ id: '42' }` | Named param (one segment, URL-decoded) |
| `/files/*` | `{ '*': 'img/logo.png' }` | Wildcard (must be last, only one) |

Path auto-derived from scope-chain IDs when omitted (e.g. `Scope('v1')` → `RawRoute('users')` = `/v1/users`). ⚠️ Use explicit `path` for routes that must stay stable across refactors.

## Handler Signature

```typescript
handler: async (ctx) => {
  ctx.request.params.id;          // path parameters
  ctx.request.headers.get('x-h'); // headers
  await ctx.request.json();       // parse body
  ctx.response.status = 201;
  ctx.response.send({ ok: true });
}
```

## Examples

**Health check:**
```typescript
new RawRoute(scope, 'health', { method: 'GET', handler: async (ctx) => ctx.response.send({ status: 'ok' }) });
```

**Webhook receiver:**
```typescript
new RawRoute(scope, 'StripeWebhook', {
  method: 'POST',
  path: '/webhooks/stripe',
  handler: async (ctx) => { const body = await ctx.request.text(); ctx.response.send({ received: true }); },
});
```

**Wildcard path capture:**
```typescript
// The response surface sends JSON or a string body (ctx.response.send) — it
// cannot stream a binary file. For real downloads, hand the client a
// FileBucket presigned URL instead of serving bytes through a RawRoute.
new RawRoute(scope, 'Files', { method: 'GET', path: '/files/*',
  handler: async (ctx) => ctx.response.send({ requestedPath: ctx.request.params['*'] }),
});
```

## Registration Rules

- **Reserved paths:** `/aws-blocks`, `/aws-blocks/api`, and anything under `/aws-blocks/api/` are reserved for RPC dispatch. Registering a RawRoute at one of these throws at construction. Registering at `/` also throws (API Gateway's proxy resource can't handle root — use a sub-path).
- **Duplicate routes:** Two routes with the same method + path throw at construction time (both locally and in AWS), as `RawRouteErrors.DuplicateRoute` (`'DuplicateRouteException'`) — catch with `isBlocksError(e, RawRouteErrors.DuplicateRoute)`.
- **Register-during-load:** All RawRoute instances must be created during module load (top-level or in the Scope constructor callback). The route registry is locked by `lockRouteRegistry()` immediately after the handler is created, so a route registered afterwards (e.g. inside an API handler) is **not** silently dropped — it throws `Routes must be registered during initialization. Cannot register routes after handler creation.`
- **Hosting integration:** When a Hosting block is present, RawRoute paths are automatically added as CloudFront behaviors (no manual origin config needed).

## ctx.request / ctx.response Reference

The handler receives a single `BlocksContext` with exactly these members — there
is no `arrayBuffer()`, no `method`, and no `sendRaw()`:

- `ctx.request`:
  - `.headers` — `Headers` object
  - `.body` — `ReadableStream<Uint8Array> | null` (the raw request body stream)
  - `.json()` — `Promise<any>`, parse body as JSON
  - `.text()` — `Promise<string>`, read body as text
  - `.url` — `URL` (absolute request URL, useful for query-string parsing / OIDC redirect URIs)
  - `.params` — `Record<string, string>` (path params; `{}` for RPC methods)
  - `.signal` — `AbortSignal | undefined` (fires when the Lambda is about to return a 504; pass to `fetch`/SDK calls)
- `ctx.response`:
  - `.headers` — `Headers` object (set with `.set(key, val)`)
  - `.status` — `number`
  - `.send(body)` — send a JSON or string body

There is no HTTP method on the request (the method is fixed by the route's
`method` option at construction) and no raw-buffer response writer.

## Local Mock vs AWS

| Aspect | Local | AWS |
|--------|-------|-----|
| Dispatch | Dev server matches method+path | API Gateway proxy → Lambda router |
| Context shape | Same `BlocksContext` | Same `BlocksContext` |
| Duplicates | Throws at startup | Same — detected at construction |
| CloudFront | N/A | Hosting auto-adds behaviors |


## What It Provisions

- API Gateway HTTP API route (custom method + path)
- Lambda function (raw request handler)
- IAM execution role

For standard typed API methods, prefer ApiNamespace. For presigned browser
uploads you may not need a RawRoute at all — FileBucket returns upload handles
directly.