# AuthBasic

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
