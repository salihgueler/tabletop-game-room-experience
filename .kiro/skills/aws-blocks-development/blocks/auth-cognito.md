# AuthCognito

Cognito User Pool auth: MFA (SMS / TOTP / email OTP), pool groups for RBAC,
custom attributes, device tracking, passkeys (WebAuthn), and a server-side
admin surface. Sessions are opaque HMAC-signed cookies via the BFF pattern —
**Cognito tokens never reach the browser**; they are held server-side.

**Use it for** production auth that needs any of the above. **Don't use it for**
a prototype that only needs username/password (that is the simpler AuthBasic
block), or sign-in that federates an external IdP directly without a Cognito
pool in the middle (that is the AuthOIDC block — though AuthCognito also does
Cognito-hosted social federation).

## Contents

- Import paths
- Quick start
- Options: `AuthCognitoOptions`
- Sign-in identifiers: `signInWith`
- Client-facing methods (sign-up, sign-in, session, profile, reset, MFA, devices)
- `confirmSignIn` — the discriminated challenge responses
- Passkeys (WebAuthn)
- Admin surface — the gate model
- Literal narrowing with `as const`
- Errors
- SSR cookie forwarding
- UI components
- Adopting an existing pool: `fromExisting`
- Local development
- What it provisions

## Import paths

- `AuthCognito`, `AuthCognitoErrors` and all Cognito types
  (`AuthCognitoOptions`, `CognitoUser`, `AdminUser`, `AdminCreateInit`,
  `AdminUserFilter`, `SetPasswordOptions`, `AdminActionGate`, `AdminDisabled`,
  `ExternalUserPoolRef`, …) — from the umbrella `@aws-blocks/blocks` (or
  `@aws-blocks/bb-auth-cognito`). The umbrella **does** re-export the admin
  types; you do not need the internal package for them.
- UI components — from `@aws-blocks/blocks/ui`.
- `AuthStateApi` — from `@aws-blocks/auth-common`.
- `withAuth` / `registerCookieProvider` / `clearCookieProviders` — from
  `@aws-blocks/blocks/server`.

## Quick start

```typescript
import { Scope, ApiNamespace, AuthCognito } from '@aws-blocks/blocks';

const scope = new Scope('my-app');

const auth = new AuthCognito(scope, 'auth', {
  passwordPolicy: { minLength: 8, requireDigits: true },
  userAttributes: [{ name: 'department' }],
  groups: ['admins', 'readers'],
  mfa: 'optional',
  mfaTypes: ['TOTP', 'EMAIL'],
});

export const authApi = auth.createApi();

export const api = new ApiNamespace(scope, 'api', (context) => ({
  async getProfile() {
    const user = await auth.requireAuth(context);
    return { username: user.username, groups: user.groups };
  },
  async adminOnly() {
    const user = await auth.requireRole(context, 'admins'); // 403 if not in group
    return { message: `Welcome, ${user.username}` };
  },
}));
```

## Options: `AuthCognitoOptions`

```typescript
interface AuthCognitoOptions {
  mfa?: 'off' | 'optional' | 'required';
  mfaTypes?: readonly ('SMS' | 'TOTP' | 'EMAIL')[];
  passwordPolicy?: {
    minLength?: number; requireDigits?: boolean; requireSymbols?: boolean;
    requireUppercase?: boolean; requireLowercase?: boolean;
  };
  userAttributes?: readonly { name: string; type?: 'String' | 'Number'; required?: boolean; mutable?: boolean }[];
  groups?: readonly (string | { name: string; description?: string; precedence?: number })[];
  selfSignUp?: boolean;
  signInWith?: SignInWith | SignInWith[];          // SignInWith = 'username' | 'email' | 'phone'
  deviceTracking?: { challengeRequiredOnNewDevice?: boolean; deviceOnlyRememberedOnUserPrompt?: boolean };
  userPool?: ExternalUserPoolRef;                   // adopt a pre-existing pool
  authFlowType?: 'USER_PASSWORD_AUTH' | 'USER_SRP_AUTH' | 'USER_AUTH' | 'CUSTOM_AUTH';
  preferredChallenge?: 'PASSWORD' | 'EMAIL_OTP' | 'SMS_OTP' | 'WEB_AUTHN';  // USER_AUTH only
  enablePasskeys?: boolean;
  webAuthnRelyingParty?: { id: string; origins: string[]; userVerification?: 'required' | 'preferred' | 'discouraged' };
  admin?: { actions?: readonly ('groups' | 'lifecycle')[] };
  crossDomain?: boolean;                            // SameSite=None; Secure; Partitioned
  sessionTtlSeconds?: number;
  featurePlan?: 'lite' | 'essentials' | 'plus';
  removalPolicy?: 'destroy' | 'retain';
}
```

## Sign-in identifiers: `signInWith`

`signInWith` (values `'username' | 'email' | 'phone'`, or an array) sets what a
user signs in with. It is **not** `loginWith` — that name is Amplify Gen-2
vocabulary and does not exist here.

| `signInWith` | Behavior | `signUp(username)` accepts |
|---|---|---|
| default (`['username', 'email']`) | email is an alias | a non-email username string |
| `'email'` | email IS the username | an email address |
| `'phone'` | phone IS the username | E.164 phone |
| `['email', 'phone']` | either as primary | email or phone |

Changing `signInWith` on a deployed pool is destructive — Cognito rejects the
alias-shape transition, so the pool must be recreated. Pick it at first deploy.

## Client-facing methods

These act on the **signed-in** user via `context`.

**Sign-up**

| Method | Returns |
|---|---|
| `signUp(username, password, options?)` | `Promise<SignUpResult>` — `options: { attributes?, autoSignIn?, clientMetadata? }`; result `{ isSignUpComplete, userId?, nextStep? }` |
| `confirmSignUp(username, code)` | `Promise<ConfirmSignUpResult>` |
| `resendSignUpCode(username)` | `Promise<void>` |

**Sign-in**

| Method | Returns |
|---|---|
| `signIn(username, password, context, options?)` | `Promise<SignInResult>` — `{ status: 'signedIn', user }` or `{ status: 'continueSignIn', nextStep }` |
| `confirmSignIn(session, response, context, options?)` | `Promise<SignInResult>` — see below |
| `autoSignIn(context)` | `Promise<SignInResult>` — completes a `signUp({ autoSignIn: true })` |
| `signOut(context, options?)` | `Promise<void>` — `{ global: true }` revokes the refresh token at Cognito |

**Session / identity** (the `BlocksAuth` core)

| Method | Returns |
|---|---|
| `requireAuth(context)` | `Promise<CognitoUser>` — throws 401 |
| `checkAuth(context)` | `Promise<boolean>` |
| `getCurrentUser(context)` | `Promise<CognitoUser \| null>` — auto-refreshes tokens |
| `requireRole(context, role)` | `Promise<CognitoUser>` — throws 403 (`NotAuthorizedException`) |
| `fetchAuthSession(context, options?)` | `Promise<AuthSession>` — `{ tokens?: { idToken, accessToken }, userSub? }`; `{ forceRefresh: true }` rotates. Use only to call a non-Blocks AWS service that needs a Cognito JWT, not for identity checks. |
| `fetchUserAttributes(context)` | `Promise<Partial<Record<attr, string>>>` — live fetch |

`CognitoUser` is `{ userId, username, userSub, groups, attributes }`. A group
change does not affect an existing session until the token refreshes
(`requireRole` reads the `cognito:groups` claim), i.e. on next sign-in or
`fetchAuthSession({ forceRefresh: true })`.

**Profile mutations:** `updatePassword(ctx, old, new)`,
`updateUserAttributes(ctx, attrs)`, `updateUserAttribute(ctx, name, value)`,
`deleteUser(ctx)`, `confirmUserAttribute(ctx, name, code)`,
`sendUserAttributeVerificationCode(ctx, name)`. The two update-attribute calls
return an `UpdateAttributeOutcome` that may report a
`CONFIRM_ATTRIBUTE_WITH_CODE` next step.

**Password reset:** `resetPassword(username)` (returns a `ResetPasswordResult`;
silently succeeds for unknown users) and
`confirmResetPassword(username, code, newPassword)`.

**MFA:** `setUpTOTP(ctx)` → `{ sharedSecret }`, `verifyTOTPSetup(ctx, code)`,
`updateMFAPreference(ctx, { sms?, totp?, email? })` (each
`'ENABLED' | 'DISABLED' | 'PREFERRED' | 'NOT_PREFERRED'`), `fetchMFAPreference(ctx)`
→ `{ enabled, preferred? }`.

**Devices:** `fetchDevices(ctx)` returns `AsyncIterable<DeviceRecord>` (consume
with `for await`), `forgetDevice(ctx, deviceKey)`, `rememberDevice(ctx)`.

## `confirmSignIn` — discriminated challenge responses

`confirmSignIn(session, response, context)` takes a discriminated `response`
object; the shape depends on the `nextStep.name` from the preceding
`signIn`/`confirmSignIn`:

```typescript
await auth.confirmSignIn(session, { code: '123456' }, context);          // SMS/TOTP/Email MFA
await auth.confirmSignIn(session, { newPassword: 'newP@ss1' }, context);  // NEW_PASSWORD_REQUIRED
await auth.confirmSignIn(session, { mfaType: 'TOTP' }, context);          // MFA type selection
await auth.confirmSignIn(session, { email: 'user@example.com' }, context);// EMAIL_SETUP
await auth.confirmSignIn(session, { password: 'myPass' }, context);       // USER_AUTH password leg
await auth.confirmSignIn(session, { firstFactor: 'WEB_AUTHN' }, context); // USER_AUTH factor selection
await auth.confirmSignIn(session, { credential: jsonCredential }, context);// passkey assertion
```

The passkey `credential` is the JSON-stringified `PublicKeyCredential` from
`navigator.credentials.get(...)`, passed verbatim.

## Passkeys (WebAuthn)

Requires `enablePasskeys: true` and `webAuthnRelyingParty` in options; passkey
enrolment in Cognito requires a confirmed user, so pair it with a contact-based
`signInWith` (e.g. `'email'`) and typically `authFlowType: 'USER_AUTH'`.

```typescript
const auth = new AuthCognito(scope, 'auth', {
  signInWith: 'email',
  authFlowType: 'USER_AUTH',
  enablePasskeys: true,
  webAuthnRelyingParty: {
    id: 'localhost',
    origins: ['http://localhost:3000', 'http://localhost:5173'],
    userVerification: 'preferred',
  },
});
```

Registration methods (all take `context`):

| Method | Returns |
|---|---|
| `startPasskeyRegistration(ctx)` | `{ credentialCreationOptions }` — feed to `navigator.credentials.create()` |
| `completePasskeyRegistration(ctx, credential)` | `{ credentialId }` — `credential` is the JSON-encoded `PublicKeyCredential` |
| `listPasskeys(ctx)` | `PasskeyDescription[]` |
| `deletePasskey(ctx, credentialId)` | `void` |

Sign-in with a passkey arrives as a `CONFIRM_SIGN_IN_WITH_WEB_AUTHN` next step
carrying `credentialRequestOptions`; complete it via the
`confirmSignIn(session, { credential }, context)` branch above. The shared
`Authenticator` renders the WEB_AUTHN challenge form itself via its
`webauthn-get` / `webauthn-create` capability hooks — no custom frontend needed.

## Admin surface — the gate model

Server-side operations that act on **any** user by `username` (unlike the client
methods above, which act on the signed-in user via `context`). Opt in by passing
an `admin` options object; that both grants the matching `Admin*`/`List*` IAM and
enables the typed `auth.admin` handle.

```typescript
const auth = new AuthCognito(scope, 'auth', {
  groups: ['admins'],
  admin: { actions: ['groups', 'lifecycle'] },
});

export const api = new ApiNamespace(scope, 'api', (context) => ({
  async promote(username: string) {
    await auth.requireRole(context, 'admins');          // MUST gate — see below
    await auth.admin.addUserToGroup(username, 'admins');
  },
}));
```

Three properties define the model:

- **Compile-time gate.** Without an `admin` options object, `auth.admin` is
  typed `AdminDisabled` and any access is a compile error whose message names
  the fix (`construct AuthCognito with { admin: {} }`). Each method also carries
  a trailing `AdminActionGate` parameter, so calling a method whose action was
  not granted in `admin.actions` is a compile error. `actions: ['groups']`
  makes only the group methods typecheck; `['lifecycle']` only the lifecycle
  ones; omitting `actions` grants both.
- **Not an IAM access boundary.** Client and admin run under **one** shared
  Lambda execution role. The gate is API-surface + lint, not IAM — so **every**
  admin route still needs `requireRole` (or equivalent) to actually restrict
  who can call it.
- **Runtime backstop.** Untyped JS callers that reach past the gate fast-fail
  with a clear error rather than a cryptic AWS `AccessDenied`.

**Group management** (`actions` includes `'groups'`) — `group` is narrowed to
`GroupOf<O>`:

| Method | Description |
|---|---|
| `admin.addUserToGroup(username, group)` | |
| `admin.removeUserFromGroup(username, group)` | |
| `admin.listGroupsForUser(username)` | `Promise<GroupOf<O>[]>` |
| `admin.listUsersInGroup(group)` | `Promise<AdminUser<O>[]>` |

**Lifecycle management** (`actions` includes `'lifecycle'`):

| Method | Signature |
|---|---|
| `admin.createUser(username, init?)` | `init: AdminCreateInit = { attributes?, suppressInvite?, temporaryPassword? }`. There is no `email` or `autoConfirm` field — email goes in `attributes`. Returns `AdminUser<O>`. |
| `admin.setUserPassword(username, password, options?)` | `password` is a **separate positional** arg; `options: SetPasswordOptions = { permanent? }` |
| `admin.getUser(username)` | `Promise<AdminUser<O> \| null>` |
| `admin.deleteUser(username)` | |
| `admin.disableUser(username)` / `admin.enableUser(username)` | |
| `admin.resetUserPassword(username)` | force reset on next sign-in |
| `admin.revokeUserSessions(username)` | revokes **refresh** tokens; already-issued access tokens keep passing `requireAuth` until they expire (not an instant kill-switch on AWS) |
| `admin.scan(filter?)` | `AsyncIterable<AdminUser<O>>`. `filter: AdminUserFilter = { attribute, match: 'startsWith' \| 'equals', value }` — not `{ email?, username?, status? }`. |

`AdminUser` is `{ username, userSub, enabled, attributes, groups? }`.

## Literal narrowing with `as const`

Pass an options object declared in a variable `as const` so its literals don't
widen before reaching the constructor — this is what makes `groups`,
`userAttributes`, and `mfaTypes` type-checked at call sites:

```typescript
const options = {
  groups: ['admins', 'readers'],
  mfaTypes: ['TOTP', 'EMAIL'],
} as const satisfies AuthCognitoOptions;

const auth = new AuthCognito(scope, 'auth', options);

await auth.requireRole(ctx, 'admins');  // ✅
await auth.requireRole(ctx, 'admin');   // ❌ compile error — typo caught
```

Options passed inline to the constructor narrow without `as const`. Without
narrowing, the fields accept any string (backward-compatible).

## Errors

`AuthCognitoErrors` values are Cognito wire-format names. The common ones:

| Constant | Value |
|---|---|
| `NotAuthenticated` | `NotAuthenticatedException` |
| `NotAuthorized` | `NotAuthorizedException` |
| `UserNotFound` | `UserNotFoundException` |
| `UserAlreadyExists` | `UsernameExistsException` |
| `CodeMismatch` | `CodeMismatchException` |
| `ExpiredCode` | `ExpiredCodeException` |
| `UserNotConfirmed` | `UserNotConfirmedException` |
| `AliasExists` | `AliasExistsException` |
| `LimitExceeded` | `LimitExceededException` |
| `InternalError` | `InternalErrorException` |

There are also `WebAuthn*Exception` variants (e.g. `WebAuthnNotEnabled`,
`WebAuthnOriginNotAllowed`, `WebAuthnConfigurationMissing`) for passkey flows.

```typescript
import { isBlocksError } from '@aws-blocks/core';
import { AuthCognitoErrors } from '@aws-blocks/blocks';

try { await auth.signIn('alice', 'wrong', context); }
catch (e) { if (isBlocksError(e, AuthCognitoErrors.NotAuthorized)) { /* wrong password */ } }
```

## SSR cookie forwarding

In a server component, browser cookies are not automatically forwarded to
Blocks API calls, so an SSR call to a protected route silently returns 401. Wrap
the calls in `withAuth` from `@aws-blocks/blocks/server`:

```typescript
import { withAuth } from '@aws-blocks/blocks/server';

// Next.js — cookies auto-detected from next/headers (built-in provider)
const profile = await withAuth(() => api.getProfile());

// Any framework — pass cookies explicitly
const profile = await withAuth(() => api.getProfile(), request.headers.get('cookie'));
```

`withAuth(fn, cookies?)` resolves cookies in order — explicit arg → existing
request context → registered providers — and runs `fn` inside an
`AsyncLocalStorage`; it throws a 401 if none are found. Next.js and Nuxt/Nitro
providers are built in. **Nuxt requires `nitro: { experimental: { asyncContext:
true } }` in `nuxt.config.ts`** — without it the provider returns nothing and
you get a downstream 401 (a one-time warning naming the missing config is
logged). Add other frameworks (SvelteKit, Astro) with
`registerCookieProvider(name, detect)`; `clearCookieProviders()` resets the
registry (mainly for tests).

## UI components

Same provider-agnostic components as AuthBasic, from `@aws-blocks/blocks/ui`:
`Authenticator`, `AccountMenuBar`, `AuthenticatedContent`, `onAuthChange`,
`broadcastAuthChange`. The state machine handles every challenge — sign-up,
confirm, MFA code entry, MFA type selection, TOTP setup, password reset, passkey
challenge — with no frontend changes.

```typescript
import { Authenticator } from '@aws-blocks/blocks/ui';
import { authApi } from 'aws-blocks';
document.body.appendChild(Authenticator(authApi));
```

Sign out through the state machine (there is no `authApi.signOut()`):
`await authApi.setAuthState({ action: 'signOut' })` then
`broadcastAuthChange(null)`. See the AuthBasic block for the React mount pattern.

## Adopting an existing pool: `fromExisting`

`AuthCognito.fromExisting(userPoolId, clientId?)` is a **ref factory** — it
returns an `ExternalUserPoolRef` you pass as the `userPool` option, not a
standalone construct. The optional second arg is `clientId`, not
`userPoolClientId`.

```typescript
const auth = new AuthCognito(scope, 'auth', {
  userPool: AuthCognito.fromExisting('us-east-1_abc123', 'existing-client-id'),
});
```

## Local development

Zero AWS. The mock uses in-memory stores persisted to `.bb-data/`. Add
`codeDelivery` to `AuthCognitoMockOptions` to capture sign-up / reset / MFA
codes locally instead of sending real email/SMS — it is a mock/local-only hook,
three-arg `(username, code, purpose) => Promise<void>` where `purpose` is
`'signUp' | 'resetPassword' | 'mfa' | 'attribute'`. Expired tokens are treated as
dead sessions (no refresh-token concept locally).

## What it provisions

A Cognito User Pool + User Pool Client (with WebAuthn config when
`enablePasskeys`), any configured Lambda triggers, a DynamoDB table for
server-side session storage, and IAM grants on the shared execution role —
extended with the `Admin*`/`List*` actions only when an `admin` object is
passed. Cognito scales automatically; idle cost is zero.
