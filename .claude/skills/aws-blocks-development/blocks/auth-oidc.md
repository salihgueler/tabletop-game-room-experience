# AuthOIDC

**When to use:** Apps where users sign in via an external identity provider (Google, GitHub, Okta, Auth0, Microsoft Entra) without Cognito in the middle.

**When NOT to use:** Apps needing Cognito features (MFA, groups, custom attributes) — use AuthCognito with social federation instead.

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

### Server-Initiated OIDC Sign-In

For server-rendered apps or CLI/native flows where you can't use the client-side PKCE API, AuthOIDC mounts a GET route per configured provider:

```
GET /aws-blocks/auth/signin/<provider>
```

**Flow:** Browser → GET route → 302 redirect to IdP → IdP authenticates → callback to `/aws-blocks/auth/callback` → sets `pending-auth` cookie → final redirect to `postSignInPath` with session cookie.

**Error shape:** On failure, returns JSON `{ "error": "<ErrorName>", "message": "..." }` with appropriate HTTP status.

**Important:**
- One route is mounted per configured provider name. An undeclared provider name returns **404** (not `ProviderNotConfiguredException` — that error comes from `getSignInUrl()`).
- Sign-out route: `GET /aws-blocks/auth/signout` — clears session, returns 200.
- Use `client.signIn('google')` (client-side PKCE) for SPAs. Use the server GET route for server-rendered apps, CLI tools, or when you need a simple link/redirect.

---

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


## What It Provisions

- Lambda function (OIDC callback handler)
- DynamoDB table (session storage)
- API Gateway route for callback URL
- JWT validation middleware

## See Also

- [auth-cognito](./auth-cognito.md) — When you need MFA/groups alongside social login
- [auth-basic](./auth-basic.md) — Simple username/password without any IdP
- [api-namespace](./api-namespace.md) — Wiring auth into API routes