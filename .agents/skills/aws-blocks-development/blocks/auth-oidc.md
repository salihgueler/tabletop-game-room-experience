# AuthOIDC

OAuth 2.0 / OpenID Connect sign-in through an external identity provider
(Google, GitHub, Okta, Auth0, Microsoft Entra, or a Cognito Hosted UI) with no
credential storage of your own. Sessions outlive the IdP's ~1-hour ID-token TTL
via transparent background refresh; sign-out invalidates the session
server-side. Two lifecycle hooks (`onSignIn`, `onSignOut`) give you the seam for
profile upserts and audit logging.

**Use it for** "sign in with <IdP>". **Don't use it for** flows that need
Cognito's own features — MFA, pool groups, custom attributes — where AuthCognito
(optionally with its Cognito-hosted social federation) is the block. Note
`cognitoFederated()` below bridges the two: AuthOIDC delegating to a Cognito
Hosted UI.

## Contents

- Import paths
- Backend: construct with providers
- Provider helpers
- Options: `AuthOIDCOptions`
- Server-side methods and the `OIDCUser` shape
- Frontend: the PKCE client
- `handle401()` client helper
- Server-initiated (server-rendered / CLI) flow
- Native/CLI relay: `relayOrigin()` / `allowedRelayOrigins`
- Errors
- Local development
- What it provisions

## Import paths

- `AuthOIDC`, `AuthOIDCErrors`, the provider helpers (`google`, `github`,
  `customOidc`, `customOauth2`, `stubIdp`, `cognitoFederated`), `relayOrigin`,
  and the types `OIDCUser`, `MappedClaims`, `RelayOrigin`, `AuthOIDCErrorName` —
  from the umbrella `@aws-blocks/blocks` (or `@aws-blocks/bb-auth-oidc`).
- `handle401` — from `@aws-blocks/bb-auth-oidc` (browser entry).
- UI helpers (`onAuthChange`, `broadcastAuthChange`) — from
  `@aws-blocks/blocks/ui`.

## Backend: construct with providers

```typescript
import { Scope, ApiNamespace, AppSetting, AuthOIDC, google, github, customOidc } from '@aws-blocks/blocks';

const scope = new Scope('my-app');
const googleClientId = new AppSetting(scope, 'google-id', { secret: true });
const googleSecret = new AppSetting(scope, 'google-secret', { secret: true });

const auth = new AuthOIDC(scope, 'auth', {
  providers: [
    google({ clientId: () => googleClientId.get(), clientSecret: () => googleSecret.get() }),
    github({ clientId: '...', clientSecret: '...' }),
    customOidc({
      name: 'okta',                              // name is a FIELD in the options object
      issuerUrl: 'https://my-org.okta.com/oauth2/default',
      clientId: '...', clientSecret: '...',
    }),
  ],
  postSignInPath: '/dashboard',
  onSignIn: async (user, ctx) => { /* upsert profile */ },
});

export const authApi = auth.createApi();
```

## Provider helpers

Each helper takes a **single options object** (no positional name overload) and
brands `name` as a literal, so `client.signIn('typo')` is a compile error.

- `google({ clientId, clientSecret, scopes? })` — OIDC; default scopes
  `openid`, `email`, `profile`.
- `github({ clientId, clientSecret, scopes? })` — OAuth 2.0 (GitHub issues no ID
  token); ships a built-in `mapClaims`; default scopes `read:user`,
  `user:email`.
- `customOidc({ name, issuerUrl, clientId, clientSecret, scopes?, attributeMapping? })`
  — any OIDC IdP (Okta, Auth0, Entra, or a Cognito pool pointed at its issuer).
  Discovers `{issuerUrl}/.well-known/openid-configuration`.
- `customOauth2({ name, authUrl, tokenUrl, userInfoUrl, clientId, clientSecret, scopes, mapClaims })`
  — a bare OAuth 2.0 IdP with no ID token; you supply `mapClaims`.
- `cognitoFederated({ name, identityProvider, cognitoDomain, region, clientId, clientSecret, idpIssuerUrl?, scopes? })`
  — see below.
- `stubIdp({ name, scopes?, onAuthorize? })` — zero-config local IdP; see Local
  development.

`clientId` / `clientSecret` are `SecretLike` — an inline string or a
`() => string | Promise<string>` resolver (use the resolver form with an
`AppSetting`).

**`cognitoFederated()`** delegates the whole OIDC flow to a Cognito User Pool's
Hosted UI — Cognito handles PKCE, token verification, MFA, and brute-force
protection; your Lambda only exchanges the code. `identityProvider` is the IdP
name as registered in Cognito; the built-in social values are `'Google'`,
`'Facebook'`, `'LoginWithAmazon'`, `'SignInWithApple'` (a custom OIDC IdP uses
whatever name you gave it in Cognito plus `idpIssuerUrl`). `cognitoDomain` is
either a prefix (`'myapp'` → `https://myapp.auth.{region}.amazoncognito.com`) or
a full custom domain. Its `clientId` / `clientSecret` are `AppSetting`
instances, not resolver functions. `userId` stays stable across engine switches:
it is derived from the original IdP identity in Cognito's `identities` claim,
not Cognito's internal UUID.

```typescript
import { AuthOIDC, cognitoFederated } from '@aws-blocks/blocks';
import { AppSetting } from '@aws-blocks/blocks';

const googleClientId = new AppSetting(scope, 'google-client-id', { secret: true });
const googleSecret = new AppSetting(scope, 'google-client-secret', { secret: true });

const auth = new AuthOIDC(scope, 'auth', {
  providers: [cognitoFederated({
    name: 'google', identityProvider: 'Google',
    cognitoDomain: 'myapp', region: 'us-east-1',
    clientId: googleClientId, clientSecret: googleSecret,
  })],
});
```

**`MappedClaims`** (for `customOauth2`'s `mapClaims`) is
`{ providerSub: string; email: string | null; name: string | null }`.
`providerSub` becomes the `sub` component of `userId = ${iss}:${sub}`.

## Options: `AuthOIDCOptions`

```typescript
interface AuthOIDCOptions {
  providers: ProviderConfig[];                 // required
  allowBearerAuth?: boolean;                   // Bearer tokens for native clients; default false
  postSignInPath?: string;                     // default '/'
  callbackPath?: string;                       // default '/aws-blocks/auth/callback'
  signOutPath?: string;                        // default '/aws-blocks/auth/signout'
  onSignIn?: (user: OIDCUser, ctx) => Promise<void>;   // throwing fails sign-in (callback 500)
  onSignOut?: (user: OIDCUser, ctx) => Promise<void>;  // throwing is logged, does not block sign-out
  crossDomain?: boolean;                       // SameSite=None; Secure; Partitioned
  allowedRelayOrigins?: readonly RelayOrigin[];// native/CLI loopback relay; see below
  logger?: ChildLogger;
}
```

## Server-side methods and the `OIDCUser` shape

- `auth.requireAuth(context)` → `Promise<OIDCUser>`, throws 401.
- `auth.checkAuth(context)` → `Promise<boolean>`.
- `auth.getCurrentUser(context)` → `Promise<OIDCUser | null>`.

`OIDCUser` — note `email` and `name` are **nullable**:

```typescript
interface OIDCUser {
  userId: string;    // stable per-human-per-IdP: `${iss}:${sub}` — use as a foreign key
  username: string;  // display id: name → email → sub
  provider: string;  // configured provider name, e.g. 'google'
  sub: string;       // provider-local subject from the verified ID token
  iss: string;       // issuer; for OAuth2 providers synthesized as `oauth2:<name>`
  email: string | null;
  name: string | null;
  claims: Readonly<Record<string, unknown>>;  // all verified ID-token claims, frozen
}
```

**SSR:** the same `withAuth` from `@aws-blocks/blocks/server` applies —
`await withAuth(() => api.something())` — so server-component calls forward the
session cookie instead of 401ing. See the AuthCognito block's SSR section.

## Frontend: the PKCE client

```typescript
import { authApi } from 'aws-blocks';

const client = await authApi.getClient();
await client.signIn('google');                               // redirects to the IdP
await client.signIn('google', { redirectPath: '/auth-return' }); // custom callback page
// On the page the IdP returns to:
const user = await client.handleRedirectCallback();          // { userId, username } | null
await client.signOut();
const unsub = client.onAuthStateChange((user, meta) => { /* ... */ });
```

`handleRedirectCallback()` is idempotent under React StrictMode double-mount
(concurrent calls for the same code share one promise) and fires
`broadcastAuthChange(user)` on success, so `onAuthChange` subscribers and
`<AuthenticatedContent>` from `@aws-blocks/blocks/ui` update cross-tab.

## `handle401()` client helper

`handle401(err, provider)` inspects a caught error and, if it is a 401,
redirects the browser to that provider's sign-in route, returning `true` so the
caller can early-return:

```typescript
import { handle401 } from '@aws-blocks/bb-auth-oidc';
import { api } from 'aws-blocks';

try {
  return await api.listMyPosts();
} catch (e) {
  if (handle401(e, 'google')) return;
  throw e;
}
```

For the redirect to actually fire, `requireAuth` must throw an `ApiError(401)`
that reaches the client as a 401. That shipped in **`@aws-blocks/blocks@0.4.0`**
(commit `27346f3`, #436); on `0.3.1`, `requireAuth` failures are not surfaced as
a client-side `ApiError` with `status === 401`, so `handle401` cannot key off
them there.

## Server-initiated (server-rendered / CLI) flow

For server-rendered apps, CLI/native flows, or a plain sign-in link, AuthOIDC
mounts a GET route per configured provider:

```
GET /aws-blocks/auth/signin/<provider>
```

It 302-redirects to the IdP, which returns to `/aws-blocks/auth/callback`, which
sets the session cookie and redirects to `postSignInPath`. On failure the
callback returns JSON `{ "error": "<ErrorName>", "message": "..." }`. An
**undeclared** provider name returns 404 (the `ProviderNotConfiguredException`
error comes from the client-side `getClient()` path, not this route). Sign-out
is `GET /aws-blocks/auth/signout`. Use `client.signIn(...)` for SPAs; use this
route for server-rendered pages or a simple link.

## Native/CLI relay: `relayOrigin()` / `allowedRelayOrigins`

For native or CLI clients that complete OAuth against a loopback callback, the
allowed final redirect targets are branded values built with `relayOrigin(uri)`
and passed as `allowedRelayOrigins`:

```typescript
import { AuthOIDC, relayOrigin } from '@aws-blocks/blocks';

const auth = new AuthOIDC(scope, 'auth', {
  providers: [/* ... */],
  allowedRelayOrigins: [
    relayOrigin('myapp://auth'),
    relayOrigin('https://oauth.myapp.com'),
  ],
});
```

`relayOrigin(uri): RelayOrigin` brands the scheme+authority so a plain string
won't typecheck. Loopback (`127.0.0.1`, `[::1]`) and same-origin are implicitly
allowed; the default is `[]`. `allowedRelayOrigins` is ignored by browser flows.

## Errors

`AuthOIDCErrors` values are the wire-format names; match with
`isBlocksError(e, AuthOIDCErrors.X)`:

| Constant | Value |
|---|---|
| `NotAuthenticated` | `NotAuthenticatedException` |
| `TokenExpired` | `TokenExpiredException` |
| `InvalidState` | `InvalidStateException` |
| `InvalidCallback` | `InvalidCallbackException` |
| `ProviderNotConfigured` | `ProviderNotConfiguredException` |
| `IdpError` | `IdpErrorException` |
| `InvalidRelay` | `InvalidRelayException` |
| `SdkOutdated` | `SdkOutdatedException` |

There is no `ProviderUnavailable` constant. `AuthOIDCErrorName` is the union of
these values.

## Local development

Real providers talk to **real** IdPs during `npm run dev` — a `google()`
provider hits Google, needing a registered redirect URI
(`http://localhost:3000/aws-blocks/auth/callback`), real credentials in
`.bb-data` via `AppSetting`, and network access. There is no silent stub
fallback.

For offline/deterministic dev, opt in explicitly with `stubIdp({ name })` — a
co-deployed fake IdP that auto-approves deterministic users, mixable with real
providers in the same instance:

```typescript
import { AuthOIDC, stubIdp } from '@aws-blocks/blocks';

const auth = new AuthOIDC(scope, 'auth', {
  providers: [stubIdp({ name: 'google' })],
});
```

`onAuthorize` decides each `/authorize`: return a user to sign in as them,
`undefined` to show the interactive login, throw to deny (negative-path
testing). As of **`@aws-blocks/blocks@0.4.0`** (commit `9bd5b3e`, #354) the stub
IdP rejects reserved OAuth response params (e.g. `code`, `state`) smuggled into
the `redirect_uri`, closing a callback-forgery hole.

## What it provisions

A Lambda OIDC callback handler, a DynamoDB table for server-side sessions, the
API Gateway route(s) for the callback/sign-in/sign-out paths, and JWT
validation. No session storage to configure.
