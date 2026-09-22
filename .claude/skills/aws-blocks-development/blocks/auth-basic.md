# AuthBasic

Username/password auth with bcrypt-hashed credentials, HTTP-only cookie
sessions, and a provider-agnostic state-machine API that drives the shared
`Authenticator` UI. Optional email/SMS-code signup confirmation and password
reset.

**Use it for** prototypes, MVPs, internal tools — the fastest path to a working
login. **Don't use it for** MFA, social login, groups/RBAC, or custom
attributes (that is the AuthCognito block), or sign-in through an external IdP
like Google/Okta (that is the AuthOIDC block).

## Contents

- Import paths
- Backend: construct, protect routes, export the API
- Options: `AuthBasicOptions`
- Server-side methods
- Frontend: the Authenticator UI
- Sign-out
- Errors
- What it provisions

## Import paths

- `AuthBasic`, `AuthBasicErrors`, and the types `AuthBasicUser`,
  `AuthBasicOptions`, `PasswordPolicy` — from the umbrella `@aws-blocks/blocks`
  (or `@aws-blocks/bb-auth-basic`).
- UI components (`Authenticator`, `AccountMenuBar`, `AuthenticatedContent`,
  `onAuthChange`, `broadcastAuthChange`) — from `@aws-blocks/blocks/ui`. They
  live behind the `/ui` subpath so backend bundles don't pull in the DOM code;
  the umbrella root does not export them.
- The `AuthState` / `AuthStateApi` / `AuthActionInput` types — from
  `@aws-blocks/auth-common`.

There is no `signInWith`, no `groups`, no `admin` surface on AuthBasic — those
are AuthCognito. Reaching for one is the signal you want a different block.

## Backend: construct, protect routes, export the API

```typescript
import { Scope, ApiNamespace, AuthBasic } from '@aws-blocks/blocks';

const scope = new Scope('my-app');

const auth = new AuthBasic(scope, 'auth', {
  sessionDuration: 86400,
  passwordPolicy: { minLength: 8, requireDigits: true },
});

// State-machine API the Authenticator UI drives.
export const authApi = auth.createApi();

export const api = new ApiNamespace(scope, 'api', (context) => ({
  async getTasks() {
    const user = await auth.requireAuth(context); // throws 401 if not signed in
    return { tasks: [], owner: user.username };
  },
}));
```

Auth is opt-in **per method** — call `auth.requireAuth(context)` inside the
handlers you want protected. `ApiNamespace` takes exactly `(scope, id, handler)`;
there is no auth option on the constructor.

## Options: `AuthBasicOptions`

```typescript
interface AuthBasicOptions {
  sessionDuration?: number;        // session cookie lifetime, seconds
  passwordPolicy?: PasswordPolicy;
  crossDomain?: boolean;           // SameSite=None; Secure for a separate frontend domain
  codeDelivery?: CodeDeliveryFn;   // (username, code) => Promise<void>
  logger?: ChildLogger;
}

interface PasswordPolicy {
  minLength?: number;
  requireDigits?: boolean;
  requireLowercase?: boolean;
  requireUppercase?: boolean;
  requireSpecialChars?: boolean;   // note: AuthCognito's field is requireSymbols
}
```

Reach for these in specific situations:

- **Confirmed signup** — set `codeDelivery`. Its two-arg shape
  `(username, code) => Promise<void>` differs from AuthCognito's three-arg one.
  Without it, signups complete immediately. Locally you can just
  `console.log` the code; there is no mailbox.
- **Frontend on a different registrable domain than the API** —
  `crossDomain: true` switches the session cookie to `SameSite=None; Secure`.
  Same-origin apps and the local dev proxy work on the `SameSite=Lax` default.

## Server-side methods

Every auth block implements the same `BlocksAuth` core (`requireAuth`,
`checkAuth`, `getCurrentUser`), so route code is provider-portable.

| Method | Returns | Notes |
|---|---|---|
| `requireAuth(context)` | `Promise<AuthBasicUser>` | Throws 401 if not signed in |
| `checkAuth(context)` | `Promise<boolean>` | Boolean, no throw |
| `getCurrentUser(context)` | `Promise<AuthBasicUser \| null>` | Null when signed out |
| `signUp(username, password)` | `Promise<void>` | |
| `confirmSignUp(username, code)` | `Promise<void>` | Only when `codeDelivery` is set |
| `signIn(username, password, context)` | `Promise<AuthBasicUser>` | |
| `signOut(context)` | `Promise<void>` | |
| `resetPassword(username)` | `Promise<void>` | |
| `confirmResetPassword(username, code, newPassword)` | `Promise<void>` | |

`AuthBasicUser` is `{ userId, username, createdAt }`.

**SSR:** in a server component, browser cookies are not auto-forwarded to
Blocks API calls, so an SSR call to a protected route silently 401s. Wrap it in
`withAuth` from `@aws-blocks/blocks/server` — see the AuthCognito block's SSR
section for the same mechanism.

## Frontend: the Authenticator UI

The `Authenticator` renders sign-up / sign-in / confirm forms from the
`AuthState` the block emits — no provider-specific frontend code.

```typescript
import { Authenticator, onAuthChange } from '@aws-blocks/blocks/ui';
import { authApi } from 'aws-blocks';

document.body.appendChild(Authenticator(authApi));

// onAuthChange fires immediately with the current user, then on every change.
onAuthChange(authApi, (user) => {
  // user is AuthUser | null
});
```

**React:** the widget is a plain DOM node, so mount it in an effect and clear
the container first — React strict mode double-mounts, and a naive
`appendChild`/`removeChild` cleanup renders it twice.

```tsx
function AuthGate() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    container.innerHTML = '';               // guard against strict-mode double-mount
    container.appendChild(Authenticator(authApi));
    return () => { container.innerHTML = ''; };
  }, []);
  return <div ref={ref} />;
}
```

**Gate content behind auth** with `AuthenticatedContent`. The unauthenticated
fallback is a positional third argument — a DOM node, not an options object:

```typescript
import { AuthenticatedContent } from '@aws-blocks/blocks/ui';

const fallback = document.createElement('p');
fallback.textContent = 'Please sign in to continue.';

document.body.appendChild(
  AuthenticatedContent(
    authApi,
    (user) => {
      const el = document.createElement('div');
      el.textContent = `Welcome, ${user.username}`;
      return el;
    },
    fallback,
  ),
);
```

`AccountMenuBar(authApi)` is the compact header variant (username + Sign Out, or
a Sign In button that opens the Authenticator in a modal).

**Styling:** the widget renders plain HTML with inline styles. Restyle with CSS
overrides scoped to a container class. The full selector / `data-testid`
contract is in `CUSTOMIZING-AUTH-UI.md` in the `@aws-blocks/auth-common` package.

## Sign-out

`AuthStateApi` has no `signOut()` method. Drive it through the state machine and
broadcast so other tabs and components react:

```typescript
import { broadcastAuthChange } from '@aws-blocks/blocks/ui';

async function signOut() {
  await authApi.setAuthState({ action: 'signOut' });
  broadcastAuthChange(null);
}
```

`setAuthState` always takes a single action-payload object
(`{ action, ...fields }`), e.g. `setAuthState({ action: 'signIn', username, password })`.

## Errors

`AuthBasicErrors` values are the wire-format names you match on:

| Constant | Value |
|---|---|
| `InvalidCredentials` | `InvalidCredentialsException` |
| `UserAlreadyExists` | `UserAlreadyExistsException` |
| `InvalidCode` | `InvalidCodeException` |
| `SessionExpired` | `SessionExpiredException` |
| `InvalidPassword` | `InvalidPasswordException` |

Two matching patterns:

```typescript
import { isBlocksError } from '@aws-blocks/core';
import { AuthBasicErrors } from '@aws-blocks/blocks';

// Thrown error (catch block)
try { await auth.signIn(u, p, context); }
catch (e) { if (isBlocksError(e, AuthBasicErrors.InvalidCredentials)) { /* ... */ } }
```

`AuthState` carries an optional `errorName` populated from the thrown
`ApiError.name`, so `hasAuthError(state, AuthBasicErrors.InvalidCredentials)`
works on a state returned from `setAuthState`.

## What it provisions

A DynamoDB table (usernames + bcrypt-hashed passwords and session records) and
the Lambda auth endpoints behind the shared execution role. Sessions are
HMAC-signed JWTs; idle cost is zero. Local dev runs entirely in-memory —
verification codes surface through the `codeDelivery` hook, no email service.
