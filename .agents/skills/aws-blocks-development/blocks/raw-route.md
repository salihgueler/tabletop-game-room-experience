# RawRoute

Path-based HTTP routing for endpoints needing full request/response control.

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

**File download (wildcard):**
```typescript
new RawRoute(scope, 'Files', { method: 'GET', path: '/files/*',
  handler: async (ctx) => ctx.response.send({ path: ctx.request.params['*'] }),
});
```

## Local Mock vs AWS

| Aspect | Local | AWS |
|--------|-------|-----|
| Dispatch | Dev server matches method+path | API Gateway proxy → Lambda router |
| Context shape | Same `BlocksContext` | Same `BlocksContext` |
| Duplicates | Throws at startup | Same — detected at construction |
| CloudFront | N/A | Hosting auto-adds behaviors |
