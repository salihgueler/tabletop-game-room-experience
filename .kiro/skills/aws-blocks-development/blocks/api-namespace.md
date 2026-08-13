# ApiNamespace

**When to use:** Every Blocks app — defines your backend API methods. Required as the entry point for all server-side logic.

**When NOT to use:** Never skip this. If you need raw HTTP control (webhooks, file uploads with custom headers), combine with RawRoute.

Type-safe RPC. Methods are callable from the frontend with full TypeScript types — no codegen, no route definitions.

```typescript
import { Scope, ApiNamespace } from '@aws-blocks/blocks';

const scope = new Scope('my-app');

export const api = new ApiNamespace(scope, "api", (context) => ({
  async myMethod(arg1: string, arg2: number) {
    return { result: arg1.repeat(arg2) };
  },
  async protectedMethod(input: string) {
    const user = await auth.requireAuth(context); // 401 if unauthenticated
    return { message: input, userId: user.userId };
  },
}));
```

Frontend (fully typed, zero codegen):

```typescript
import { api } from "aws-blocks";
const result = await api.myMethod("hello", 3); // { result: string }
```

**Key points:**
- Constructor form: `new ApiNamespace(scope, name, handler)` — scope is required
- `context` carries request metadata (cookies, headers) for auth
- All methods are **public by default** — gate with `auth.requireAuth(context)`
- Multiple namespaces: declare separate `ApiNamespace` instances with different names
- Wire protocol: JSON-RPC 2.0 over single POST to `/aws-blocks/api`
- Errors: throw `ApiError(message, statusCode, { name })` — reconstructed on client

**Multiple namespaces:**

```typescript
export const publicApi = new ApiNamespace(scope, "public", (context) => ({...}));
export const adminApi = new ApiNamespace(scope, "admin", (context) => ({...}));
```

Frontend: `import { publicApi, adminApi } from "aws-blocks";`


## Common Mistakes

❌ `Curling `/api/greet` REST-style`
✅ `POST to `/aws-blocks/api` with JSON-RPC body: `{"method": "namespace.greet", "params": [...], "id": 1}``
_Blocks uses JSON-RPC 2.0, not REST_

❌ `Forgetting `withAuth(auth)` on ApiNamespace`
✅ `Pass auth in options: `new ApiNamespace(scope, "api", { auth }, (context) => ({...}))``
_All routes return 401 without auth wiring_


## What It Provisions

- API Gateway HTTP API (single POST endpoint)
- Lambda function (JSON-RPC handler)
- IAM execution role

## See Also

- [raw-route](./raw-route.md) — Raw HTTP when JSON-RPC isn't sufficient
- [auth-basic](./auth-basic.md) — Adding authentication to your API
- [hosting](./hosting.md) — Connecting frontend to API via CloudFront proxy