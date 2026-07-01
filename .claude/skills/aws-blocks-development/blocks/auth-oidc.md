# AuthOIDC

OAuth 2.0 / OpenID Connect auth with external identity providers (Google, GitHub, custom OIDC/OAuth2). Sessions are long-lived and refresh transparently.

**Error handling:** `signIn()` failures are now surfaced as structured errors (not swallowed). The client receives typed `ApiError` with a `name` field (e.g., `'ProviderUnavailable'`, `'InvalidCallback'`) that can be caught with `isBlocksError(e, 'ErrorName')`.

**Cross-tab auth sync:** `handleRedirectCallback()` now fires `broadcastAuthChange(user)` on success. `onAuthChange` from `@aws-blocks/auth-common` works with OIDC for cross-tab auth state sync.

**React StrictMode safety:** `handleRedirectCallback()` is idempotent under React StrictMode double-mount — concurrent invocations share the same promise.

```typescript
import { Scope, ApiNamespace, AppSetting, AuthOIDC, google, github, customOidc, stubIdp } from '@aws-blocks/blocks';

const googleClientId = new AppSetting(scope, 'google-id', { secret: true });
const googleSecret = new AppSetting(scope, 'google-secret', { secret: true });

const auth = new AuthOIDC(scope, 'auth', {
  providers: [
    google({ clientId: () => googleClientId.get(), clientSecret: () => googleSecret.get() }),
    github({ clientId: '...', clientSecret: '...' }),
    customOidc('okta', {
      clientId: '...', clientSecret: '...',
      issuerUrl: 'https://dev-xxx.okta.com',
    }),
  ],
  postSignInPath: '/dashboard',
  onSignIn: async (user) => {
    // Upsert profile on sign-in
  },
});

export const authApi = auth.createApi();
```

**Frontend:**

```typescript
import { authApi } from "aws-blocks";

const client = await authApi.getClient();
client.signIn('google');             // redirects to Google
client.signIn('google', { redirectPath: '/auth-return' }); // custom callback page
client.onAuthStateChange((user) => { /* ... */ });
await client.signOut();
```

**Server-side:**
- `auth.requireAuth(context)` — returns `{ userId, username, provider, email }` or throws 401
- `auth.checkAuth(context)` — returns user or `null`

**Provider helpers:**
- `providers` — array of provider configs via helper functions
  - `google({ clientId, clientSecret, scopes? })`
  - `github({ clientId, clientSecret, scopes? })`
  - `customOidc({ name, issuerUrl, clientId, clientSecret, scopes?, attributeMapping? })` — Okta, Auth0, Cognito, Entra
  - `customOauth2({ name, authUrl, tokenUrl, userInfoUrl, clientId, clientSecret, scopes, mapClaims })` — bare OAuth 2.0
  - `stubIdp({ name })` — zero-config local sign-in (see below)

**Options:**
- `crossDomain` — `true` for cross-origin deployments (sets `SameSite=None; Secure; Partitioned`)
- `allowBearerAuth` — token-based auth for native clients
- `postSignInPath` — redirect after sign-in (default: `/`)
- `onSignIn` / `onSignOut` — lifecycle hooks
- `allowedRelayOrigins` — for native/CLI OIDC relay flows

### Local Development (AuthOIDC)

**⚠️ Real providers talk to real IdPs locally.** A `google()` provider hits real Google during `npm run dev`. No silent stub fallback. You need:
- Redirect URI registered with IdP (`http://localhost:3000/aws-blocks/auth/callback`)
- Real `clientId`/`clientSecret` in `.bb-data` (via AppSetting)
- Network access to IdP

**Zero-config local sign-in with `stubIdp()`:**

For offline/deterministic development without real credentials, use `stubIdp()` explicitly:

```typescript
import { AuthOIDC, stubIdp } from '@aws-blocks/bb-auth-oidc';

const auth = new AuthOIDC(scope, 'auth', {
  providers: [stubIdp({ name: 'google' })],
});
// Auto-approves with deterministic users, works offline, no credentials needed
```

`stubIdp()` is opt-in only — it never silently replaces a real provider.

Local: real IdPs (or `stubIdp()` for zero-config). AWS: Lambda + DynamoDB sessions + OIDC flows.
