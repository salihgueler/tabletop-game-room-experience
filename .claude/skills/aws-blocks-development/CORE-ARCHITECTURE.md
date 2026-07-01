# AWS Blocks — Core Architecture

## Contents

- [Scope](#scope)
- [ApiNamespace](#apinamespace)
- [ApiError / isBlocksError](#apierror--isblockserror)
- [withAuth (SSR)](#withauth-ssr)
- [CORS](#cors)
- [UI Components](#ui-components)
- [Development Modes](#development-modes)
- [Common Mistakes to Avoid](#common-mistakes-to-avoid)

---

## Scope

`Scope` defines the resource boundary for your backend. Every Building Block attaches to a scope.

```typescript
import { Scope } from '@aws-blocks/blocks';
const scope = new Scope('my-app');
```

**Nested scopes** organize related resources logically. Child scopes inherit context and namespace their resources under the parent's ID chain.

---

## ApiNamespace

Type-safe RPC with automatic frontend/backend integration. Methods become callable from the frontend with full TypeScript types — no codegen.

```typescript
export const api = new ApiNamespace(scope, 'api', (context) => ({
  async greet(name: string) { return { message: `Hello, ${name}!` }; }
}));
```

Frontend (fully typed): `import { api } from 'aws-blocks'; const r = await api.greet('World');`

### Wire Protocol — JSON-RPC 2.0

**Single POST endpoint:** `/aws-blocks/api`

| Environment | URL |
|---|---|
| Local dev | `http://localhost:3001/aws-blocks/api` |
| Sandbox | `http://localhost:3000/aws-blocks/api` (proxied to Lambda) |
| Deployed | `https://<api-id>.execute-api.<region>.amazonaws.com/prod/aws-blocks/api` |

**Request:** `{ "jsonrpc": "2.0", "method": "<namespace>.<methodName>", "params": [...args], "id": 1 }`

- **`method`** — `namespace.methodName` (e.g., `"api.greet"`)
- **`params`** — positional array of arguments
- **Errors** — HTTP **200** with JSON-RPC `error` body (never non-2xx)

```bash
curl -X POST http://localhost:3001/aws-blocks/api \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"api.greet","params":["World"],"id":1}'
# → {"jsonrpc":"2.0","result":{"message":"Hello, World!"},"id":1}
```

### Authentication

Every method is **public by default**. Gate with `requireAuth`:

```typescript
async createPost(input: NewPost) {
  const user = await auth.requireAuth(context); // throws 401 if unauthenticated
  return db.posts.create({ ...input, authorId: user.userId });
}
```

---

## ApiError / isBlocksError

Typed error handling across the wire (server → client).

```typescript
import { ApiError, isBlocksError } from '@aws-blocks/blocks';

// Server: throw with status and error name
throw new ApiError('Not found', 404, { name: 'ItemNotFoundException' });

// Client: catch with type narrowing
catch (e) {
  if (isBlocksError(e, 'ItemNotFoundException')) { /* handle */ }
}
```

Errors serialize into the JSON-RPC error body and reconstruct on the client as typed `ApiError` instances.

---

## withAuth (SSR)

**Package:** `@aws-blocks/blocks/server`

During SSR, browser cookies aren't auto-attached to API calls. `withAuth` reads and forwards them.

```typescript
import { withAuth } from '@aws-blocks/blocks/server';

// Next.js — auto-detects cookies()
const posts = await withAuth(() => api.listMyPosts());

// Other frameworks — pass cookies explicitly
const posts = await withAuth(() => api.listMyPosts(), request.headers.get('cookie'));
```

- Auto-detects Next.js `cookies()` — zero config in server components
- **Throws `401` `ApiError`** when no cookies are found
- For non-Next.js: pass cookies as 2nd arg or use `registerCookieProvider`

---

## CORS

Controlled by **`CORS_ALLOWED_ORIGINS`** env var. Each entry is a **regex pattern** (anchored `^...$`).

| Scenario | Handling |
|---|---|
| **Hosting construct** | Automatic — CloudFront domain added by construct |
| **Local dev** | `localhost` / `127.0.0.1` auto-allowed |
| **Sandbox** | CLI sets localhost patterns automatically |
| **Separate frontend** | Set `CORS_ALLOWED_ORIGINS` on Lambda manually |

```typescript
blocksStack.handler.addEnvironment(
  'CORS_ALLOWED_ORIGINS',
  'https://myapp\\.com,https://.*\\.myapp\\.com'
);
```

Unmatched origins → header omitted (browser blocks) + `[CORS]` CloudWatch warning.

---

## UI Components

From `@aws-blocks/blocks/ui` — framework-agnostic (vanilla DOM):

| Export | Description |
|---|---|
| `AccountMenuBar(api)` | Header bar: "👤 username \| Sign Out" or "Sign In" with modal |
| `Authenticator(api)` | Provider-agnostic auth UI (state-machine driven) |
| `AuthenticatedContent(api, render)` | Renders only when signed in, auto-updates |
| `onAuthChange(api, cb)` | Subscribe to auth changes (same window + cross-tab) |
| `broadcastAuthChange(user)` | Broadcast changes for custom auth UIs |

```typescript
import { Authenticator, AuthenticatedContent, onAuthChange } from '@aws-blocks/blocks/ui';
import { authApi } from 'aws-blocks';

document.getElementById('auth')!.appendChild(Authenticator(authApi));
document.getElementById('main')!.appendChild(
  AuthenticatedContent(authApi, (user) => { /* render */ })
);
onAuthChange(authApi, (user) => console.log(user ? 'in' : 'out'));
```

---

## Development Modes

### `npm run dev` — Local mocks

- All Building Blocks use **local mocks** (no AWS credentials needed)
- Server on **port 3001**; frontend proxy on internal port 3100
- Mock data persists to `.bb-data/` — delete to reset
- Use for: rapid iteration, local testing

### `npm run sandbox` — AWS-deployed

- Deploys backend to AWS (Lambda + API Gateway)
- Frontend served locally, proxied to deployed backend
- Config auto-discovered from `/.blocks-sandbox/config.json`
- Use for: testing real AWS services, pre-production validation

---

## Common Mistakes to Avoid

1. **Curling REST-style endpoints** — No `GET /api/getData`. All calls → `POST /aws-blocks/api` via JSON-RPC. Namespace is in `method`, not the URL.

2. **Forgetting to export the API** — Frontend only sees `export`ed symbols from `aws-blocks/index.ts`.

3. **Expecting non-200 HTTP errors** — JSON-RPC errors return HTTP 200 with an `error` body. Check the body, not the status.

4. **Omitting `requireAuth`** — Every method is public by default. No auth = callable by anyone.

5. **Using `Database` when `DistributedTable` suffices** — Aurora has cold starts and idle costs. Default to DynamoDB unless you need JOINs/transactions.

6. **Blocking the API with long work** — Use `AsyncJob` for anything > a few seconds.

7. **Not reading READMEs from `node_modules`** — Installed docs match your version. Web docs may differ.

8. **Not fixing scaffolded `package.json` name** — CDK derives stack names from it. Rename before deploying.
