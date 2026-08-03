# ApiNamespace

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
