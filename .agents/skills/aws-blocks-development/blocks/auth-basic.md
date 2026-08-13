# AuthBasic

**When to use:** Prototypes, MVPs, internal tools — simple username/password auth with built-in UI widget. Fastest path to a working auth flow.

**When NOT to use:** Production apps needing MFA, social login, or advanced security (use AuthCognito). External IdP integration (use AuthOIDC).

Username/password auth with state machine API. Optional code-confirmed signup.

**Error handling patterns:**
- Thrown errors (catch block): `isBlocksError(e, 'InvalidCredentials')`
- Returned AuthState (from setAuthState): `hasAuthError(state, 'InvalidCredentials')`

`AuthState` now carries an optional `errorName` field populated from the thrown `ApiError.name`.

## Recipe: Add authentication to an app

**Step 1 — Backend (`aws-blocks/index.ts`):** Add AuthBasic + protect routes + export authApi

```typescript
import { Scope, ApiNamespace, AuthBasic } from "@aws-blocks/blocks";

const scope = new Scope("my-app");

const auth = new AuthBasic(scope, "auth", {
  sessionDuration: 86400,
  passwordPolicy: { minLength: 8, requireDigits: true },
});

// Export the auth API for the Authenticator UI component
export const authApi = auth.createApi();

export const api = new ApiNamespace(scope, "api", (context) => ({
  // All routes protected — requireAuth throws 401 if not logged in
  async getTasks() {
    const user = await auth.requireAuth(context);
    return { tasks: [], user: user.username };
  },
  async createTask(title: string) {
    const user = await auth.requireAuth(context);
    return { id: "1", title, owner: user.username };
  },
}));
```

**Step 2 — Frontend:** Add the Authenticator component + gate content behind auth

```typescript
import { Authenticator, onAuthChange } from "@aws-blocks/blocks/ui";
import { authApi } from "aws-blocks";

// onAuthChange emits a synchronous first frame immediately with the current
// auth state — no async delay before the first callback fires.
document.body.appendChild(Authenticator(authApi));
onAuthChange(authApi, (user) => {
  if (user) { /* show app content */ }
  else { /* Authenticator handles login UI */ }
});
```

**Step 3 — Verify:** Run `npm run typecheck` then `npm run dev`. Navigate to localhost:3000 — you should see the sign-up/sign-in form. Create an account, then API calls will work.

---

## API Details

```typescript
const auth = new AuthBasic(scope, 'auth', {
  sessionDuration: 86400,
  passwordPolicy: { minLength: 8, requireDigits: true },
  codeDelivery: async (username, code) => {
    console.log(`Verification code for ${username}: ${code}`);
  },
});

// Protect API routes
async protectedRoute() {
  const user = await auth.requireAuth(context); // throws 401 if not logged in
  return { hello: user.username };
}

// Export for Authenticator UI component
export const authApi = auth.createApi();
```

**Frontend (vanilla DOM component):**

```typescript
import { Authenticator, onAuthChange } from "@aws-blocks/blocks/ui";
import { authApi } from "aws-blocks";

document.body.appendChild(Authenticator(authApi));
onAuthChange(authApi, (user) => {
  console.log(user ? `Signed in as ${user.username}` : "Signed out");
});
```

**React wrapper pattern:**

```tsx
import { useEffect, useRef } from "react";
import { Authenticator } from "@aws-blocks/blocks/ui";
import { authApi } from "aws-blocks";

function AuthGate() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    // Clear first to prevent duplicates from React strict mode double-mount
    container.innerHTML = "";
    const el = Authenticator(authApi);
    container.appendChild(el);
    return () => {
      container.innerHTML = "";
    };
  }, []);
  return <div ref={ref} />;
}
```

**⚠️ React strict mode double-mount:** The naive pattern of `appendChild` + `removeChild` in cleanup causes the widget to render twice because strict mode unmounts and remounts. Always clear the container with `innerHTML = ""` before appending.

**Styling the Authenticator widget:** The widget renders plain HTML with inline styles (`border: 1px solid #ddd`, basic padding on inputs/buttons, `h3` headings). To match your app's theme, use CSS overrides with `!important` scoped to a container class. Target: `h3` for headings, `input` for fields, `button` for submit, `div[style*="color: red"]` for errors, `div[style*="margin-bottom: 16px"]` for action blocks.

**Sign-out:** The `AuthStateApi` does NOT have a `signOut()` method. Use `authApi.setAuthState({ action: "signOut" })` followed by `broadcastAuthChange(null)` to notify all listeners:

```typescript
import { broadcastAuthChange } from "@aws-blocks/blocks/ui";

async function signOut() {
  await authApi.setAuthState({ action: "signOut" });
  broadcastAuthChange(null);
}
```

Local mock: Local JWT tokens. AWS: DynamoDB + JWT.

**Auth API export:** Simply use `export const authApi = auth.createApi()`. The CDK construct automatically grants the Lambda role DynamoDB permissions. Do NOT build custom ApiNamespace wrappers for auth — it bypasses CDK's IAM wiring and causes AccessDeniedException in production.


## Common Mistakes

❌ ``auth.requireAuth(req)` with a request object`
✅ ``auth.requireAuth(context)` — context comes from ApiNamespace callback`
_Wrong parameter — context is provided by the API framework_

❌ `401 on page refresh (cookies not persisting)`
✅ `Ensure HTTPS in production. Set `SameSite=None; Secure` for cross-origin.`
_Cookie security attributes required for production_

❌ `Authenticator widget renders twice in React`
✅ `Clear container with `innerHTML = ""` before appending (React strict mode double-mounts)`
_Use cleanup pattern in useEffect_


## UI Components

All auth UI components are imported from `@aws-blocks/blocks/ui`.

| Component | Purpose |
|-----------|---------|
| `Authenticator(authApi)` | Full sign-up/sign-in form (standalone) |
| `AccountMenuBar(authApi)` | Compact menu bar with sign-in/sign-out |
| `AuthenticatedContent(authApi, renderFn, options?)` | Renders content only when authenticated |

**AuthenticatedContent fallback:**

```typescript
import { AuthenticatedContent } from '@aws-blocks/blocks/ui';

// Optional fallback content when user is NOT authenticated
const fallbackEl = document.createElement('p');
fallbackEl.textContent = 'Please sign in to continue.';

document.body.appendChild(
  AuthenticatedContent(authApi, (user) => {
    const el = document.createElement('div');
    el.textContent = `Welcome, ${user.username}`;
    return el;
  }, { fallback: fallbackEl })
);
```

**E2E testing with `data-testid`:**

All auth UI components expose stable `data-testid` attributes for e2e test targeting:
- Root container, per-action wrappers (sign-in, sign-up, etc.), heading, error display
- `AuthenticatedContent`, `AccountMenuBar`, signed-in marker
- Full selector contract documented in `CUSTOMIZING-AUTH-UI.md` (in the `@aws-blocks/blocks` package)

**Auth admin types:** `AdminOptions`, `AdminUser`, `AdminCreateInit`, `GroupAdmin`, `LifecycleAdmin`, `AdminSurface`, `AdminGetterOf`, `AdminDisabled` are now re-exported from `@aws-blocks/blocks` directly (no need to import from internal packages).

## What It Provisions

- DynamoDB table (user credentials, hashed passwords)
- Lambda function (auth endpoints)
- JWT token issuance and validation

## See Also

- [auth-cognito](./auth-cognito.md) — Production auth with MFA, groups, social federation
- [auth-oidc](./auth-oidc.md) — External identity provider integration
- [api-namespace](./api-namespace.md) — Wiring auth into your API