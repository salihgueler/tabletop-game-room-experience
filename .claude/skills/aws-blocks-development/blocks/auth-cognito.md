# AuthCognito

**When to use:** Production apps needing MFA (TOTP, SMS, email OTP), user pool groups for RBAC, custom attributes, device tracking, or social federation via Cognito.

**When NOT to use:** Prototypes that just need username/password (use AuthBasic — simpler). Direct OIDC federation without Cognito in the middle (use AuthOIDC).

Full-featured Cognito User Pool auth with passwordless, MFA, social federation, and hosted UI support.

## Quick Start

```typescript
import { Scope, ApiNamespace } from '@aws-blocks/core';
import { AuthCognito } from '@aws-blocks/blocks';

const scope = new Scope('my-app');
const auth = new AuthCognito(scope, 'auth', {
  passwordPolicy: { minLength: 8, requireDigits: true },
  userAttributes: [{ name: 'department' }],
  groups: ['admins', 'readers'],
  mfa: 'optional',
  mfaTypes: ['TOTP', 'EMAIL'],
});

export const api = new ApiNamespace(scope, 'api', (context) => ({
  async getProfile() {
    const user = await auth.requireAuth(context);
    return { username: user.username, groups: user.groups };
  },
  async adminOnly() {
    const user = await auth.requireRole(context, 'admins');
    return { message: `Welcome, ${user.username}` };
  },
}));

// State machine for the <Authenticator> UI
export const authApi = auth.createApi();
```

## Options

```typescript
interface AuthCognitoOptions {
  mfa?: 'off' | 'optional' | 'required';
  mfaTypes?: ('SMS' | 'TOTP' | 'EMAIL')[];
  passwordPolicy?: { minLength?: number; requireDigits?: boolean; requireSymbols?: boolean; requireUppercase?: boolean; requireLowercase?: boolean };
  userAttributes?: ({ name: string; type?: 'String' | 'Number'; required?: boolean })[];
  groups?: (string | { name: string; description?: string; precedence?: number })[];
  selfSignUp?: boolean;                        // default: true
  signInWith?: 'username' | 'email' | 'phone' | ('username' | 'email' | 'phone')[];  // default: ['username', 'email']
  deviceTracking?: { challengeRequiredOnNewDevice?: boolean; deviceOnlyRememberedOnUserPrompt?: boolean };
  userPool?: ExternalUserPoolRef;              // wrap a pre-existing Cognito pool
  authFlowType?: 'USER_PASSWORD_AUTH' | 'USER_AUTH';  // default: USER_PASSWORD_AUTH
  preferredChallenge?: 'PASSWORD' | 'EMAIL_OTP' | 'SMS_OTP' | 'WEB_AUTHN';  // USER_AUTH: skip SELECT_CHALLENGE
  enablePasskeys?: boolean;                    // provision WebAuthn config on the pool
  webAuthnRelyingParty?: { id: string; origins: string[]; userVerification?: 'required' | 'preferred' | 'discouraged' };
  crossDomain?: boolean;                       // SameSite=None; Secure; Partitioned cookie
  sessionTtlSeconds?: number;                  // cookie Max-Age; default 400 days
  featurePlan?: 'lite' | 'essentials' | 'plus'; // default: 'essentials'
  removalPolicy?: 'destroy' | 'retain';        // default: 'destroy'
}
```

## Sign-in Identifiers

`signInWith` controls what users sign in with:

| `signInWith` | Behavior | `signUp(username)` accepts |
|---|---|---|
| `['username', 'email']` *(default)* | Email is an alias | Non-email username string |
| `'email'` | Email IS the username | Email address only |
| `'phone'` | Phone IS the username | Phone in E.164 format |
| `['email', 'phone']` | Either as primary | Email or phone |

⚠️ Changing `signInWith` on a deployed pool is **destructive** — Cognito rejects the alias-shape transition. Pick correctly at initial deploy.

## Client-facing API

### Sign-up

| Method | Returns | Notes |
|---|---|---|
| `signUp(username, password, options?)` | `Promise<SignUpResult>` | `options: { attributes? }`. Returns `{ isSignUpComplete, userId, nextStep }` |
| `confirmSignUp(username, code)` | `Promise<ConfirmSignUpResult>` | Confirm with email/SMS code |
| `resendSignUpCode(username)` | `Promise<void>` | Re-deliver the confirmation code |

### Sign-in + Challenge Continuation

| Method | Returns | Notes |
|---|---|---|
| `signIn(username, password, context)` | `Promise<SignInResult>` | Returns `{ status: 'signedIn', user }` or `{ status: 'continueSignIn', nextStep }` |
| `confirmSignIn(session, response, context)` | `Promise<SignInResult>` | Discriminated response (see below) |
| `signOut(context, options?)` | `Promise<void>` | `{ global: true }` revokes refresh token at Cognito |

**`confirmSignIn` response is discriminated:**

```typescript
// For MFA code (SMS/TOTP/Email)
await auth.confirmSignIn(session, { code: '123456' }, context);

// For NEW_PASSWORD_REQUIRED challenge
await auth.confirmSignIn(session, { newPassword: 'newP@ss1' }, context);

// For MFA type selection
await auth.confirmSignIn(session, { mfaType: 'TOTP' }, context);

// For EMAIL_SETUP (submit address to enroll)
await auth.confirmSignIn(session, { email: 'user@example.com' }, context);

// For USER_AUTH password leg
await auth.confirmSignIn(session, { password: 'myPass' }, context);

// For passkey assertion
await auth.confirmSignIn(session, { credential: jsonEncodedPublicKeyCredential }, context);
```

### Session / Identity (BlocksAuth interface)

| Method | Returns | Description |
|---|---|---|
| `requireAuth(context)` | `Promise<CognitoUser>` | Throws 401 if no valid session |
| `checkAuth(context)` | `Promise<boolean>` | Boolean check — no throw |
| `getCurrentUser(context)` | `Promise<CognitoUser \| null>` | Returns user or null. Auto-refreshes tokens. |
| `requireRole(context, role)` | `Promise<CognitoUser>` | Throws 403 if user not in group |
| `fetchAuthSession(context, options?)` | `Promise<AuthSession>` | Returns `{ tokens: { idToken, accessToken }, userSub }`. Pass `{ forceRefresh: true }` to rotate. |
| `fetchUserAttributes(context)` | `Promise<Record<string, string>>` | Live fetch from Cognito |

### User Profile Mutations

| Method | Description |
|---|---|
| `updatePassword(context, oldPassword, newPassword)` | Change password |
| `updateUserAttributes(context, attrs)` | Update multiple attributes (may require confirmation) |
| `updateUserAttribute(context, name, value)` | Update a single attribute |
| `deleteUser(context)` | Delete the signed-in user |
| `confirmUserAttribute(context, name, code)` | Confirm attribute change |
| `sendUserAttributeVerificationCode(context, name)` | Resend verification code |

### Password Reset

| Method | Description |
|---|---|
| `resetPassword(username)` | Initiate reset; silently succeeds for unknown users |
| `confirmResetPassword(username, code, newPassword)` | Complete with emailed code |

### MFA Setup

| Method | Description |
|---|---|
| `setUpTOTP(context)` | Returns `{ sharedSecret }` for authenticator app / QR code |
| `verifyTOTPSetup(context, code)` | Confirm TOTP with a code from the app |
| `updateMFAPreference(context, preference)` | `{ sms?, totp?, email? }` — each: `'ENABLED' \| 'DISABLED' \| 'PREFERRED' \| 'NOT_PREFERRED'` |
| `fetchMFAPreference(context)` | Returns `{ enabled, preferred }` |

### Device Tracking

| Method | Description |
|---|---|
| `fetchDevices(context)` | `AsyncIterable<DeviceRecord>` — paginates automatically |
| `forgetDevice(context, deviceKey)` | Forget a device by its key |

### Passkeys (WebAuthn)

Requires `enablePasskeys: true` + `webAuthnRelyingParty` in options.

| Method | Description |
|---|---|
| `startPasskeyRegistration(context)` | Returns `credentialCreationOptions` for `navigator.credentials.create()` |
| `completePasskeyRegistration(context, credential)` | Persist the encoded PublicKeyCredential. Returns `{ credentialId }` |
| `listPasskeys(context)` | List registered passkeys |
| `deletePasskey(context, credentialId)` | Remove a passkey |

### Admin Surface (Server-Side User Management)

Opt-in via `admin: { actions: ['groups', 'lifecycle'] }` in constructor options.

```typescript
const auth = new AuthCognito(scope, 'auth', {
  loginWith: { email: true },
  admin: { actions: ['groups', 'lifecycle'] },
});
```

**Group management** (`actions: ['groups']`):

| Method | Description |
|---|---|
| `auth.admin.addUserToGroup(username, group)` | Add a user to a Cognito group |
| `auth.admin.removeUserFromGroup(username, group)` | Remove user from group |
| `auth.admin.listGroupsForUser(username)` | List groups a user belongs to |
| `auth.admin.listUsersInGroup(group)` | List all users in a group |

**Lifecycle management** (`actions: ['lifecycle']`):

| Method | Description |
|---|---|
| `auth.admin.createUser(opts)` | Create a user. `opts: { username, email?, temporaryPassword?, autoConfirm? }` |
| `auth.admin.deleteUser(username)` | Permanently delete a user |
| `auth.admin.disableUser(username)` | Disable user sign-in |
| `auth.admin.enableUser(username)` | Re-enable a disabled user |
| `auth.admin.resetUserPassword(username)` | Force password reset on next sign-in |
| `auth.admin.setUserPassword(username, opts)` | Set password. `opts: { password, permanent? }` |
| `auth.admin.getUser(username)` | Get user details (attributes, status, groups) |
| `auth.admin.scan(filter?)` | Iterate all users. Optional `filter: { email?, username?, status? }` |
| `auth.admin.revokeUserSessions(username)` | Invalidate all active sessions |

⚠️ Admin methods are **server-side only** — call from ApiNamespace handlers, not from the browser. They use Cognito Admin API calls and require elevated IAM permissions (granted automatically by the CDK construct).

## Literal Narrowing with `as const`

Pass options `as const` for compile-time safety on groups, attributes, and MFA types:

```typescript
const options = {
  groups: ['admins', 'readers'] as const,
  userAttributes: [{ name: 'department', type: 'String' }] as const,
  mfaTypes: ['TOTP', 'EMAIL'] as const,
} satisfies AuthCognitoOptions;

const auth = new AuthCognito(scope, 'auth', options);

await auth.requireRole(ctx, 'admins');    // ✅ Compiles
await auth.requireRole(ctx, 'admin');     // ❌ Compile error — typo caught

await auth.updateMFAPreference(ctx, { totp: 'PREFERRED' });  // ✅
await auth.updateMFAPreference(ctx, { sms: 'PREFERRED' });   // ❌ Not configured
```

Without `as const`: wide types (any string accepted). Backward-compatible.

## Error Handling

```typescript
import { isBlocksError } from '@aws-blocks/core';
import { AuthCognitoErrors } from '@aws-blocks/blocks';

try {
  await auth.signIn('alice', 'wrong', context);
} catch (e) {
  if (isBlocksError(e, AuthCognitoErrors.NotAuthorized)) { /* wrong password */ }
  if (isBlocksError(e, AuthCognitoErrors.UserNotFound)) { /* unknown user */ }
  if (isBlocksError(e, AuthCognitoErrors.CodeMismatch)) { /* wrong code */ }
}
```

Error names match Cognito wire-format: `NotAuthorizedException`, `UserNotFoundException`, `CodeMismatchException`, `AliasExistsException`, `InternalErrorException`.

## Cookies & Sessions

AWS Blocks auth uses the **BFF (Backend-for-Frontend) pattern**:
- Browser sends `{username, password}` to your Lambda over TLS
- Lambda authenticates with Cognito, issues an opaque HMAC-signed session cookie
- Cognito tokens **never reach the browser** — they're stored server-side in a nested KVStore
- Cookie: `HttpOnly`, `Secure`, `SameSite=Lax` (or `None` + `Partitioned` with `crossDomain: true`)

For cross-origin frontends (e.g., separate domain from API): set `crossDomain: true` in options.

## UI Components

Same provider-agnostic Authenticator as AuthBasic:

```typescript
import { Authenticator } from '@aws-blocks/auth-common/ui';
import { authApi } from 'aws-blocks';
document.body.appendChild(Authenticator(authApi));
```

The state machine handles all challenge types — sign-up, confirm, MFA code entry, type selection, TOTP setup, password reset — without frontend code changes.

## Local Development

Zero AWS required. Mock uses in-memory stores persisted to `.bb-data/`. Verification codes captured by optional `codeDelivery` hook (no email service needed). Expired tokens are treated as dead sessions (no refresh-token concept locally).

## Scaling & Cost

- Cognito scales automatically. Default quotas: 40 sign-ups/sec, 120 sign-ins/sec (adjustable)
- Session records: DynamoDB pay-per-request, single-digit ms reads
- No per-user storage cost from Cognito
- Idle cost: $0 (serverless)

## Common Mistakes

❌ `Calling signIn() without handling "CONFIRM_SIGN_UP" challenge`
✅ `Check the returned nextStep — user may need to confirm email first via confirmSignUp(username, code)`
_"User not confirmed" error on sign-in_

❌ `Not calling broadcastAuthChange(user) after manual state changes`
✅ `Always call broadcastAuthChange(user) after programmatic auth changes so UI components update`
_Authenticator widget shows wrong/stale state_

❌ `Passing email as username with default signInWith`
✅ `With default ['username', 'email'], signUp username must NOT be email format. Use signInWith: 'email' if you want email-as-username.`
_"Username cannot be of email format, since user pool is configured for email alias"_

❌ `Changing signInWith after initial deploy`
✅ `Pick signInWith correctly at first deploy — Cognito rejects alias-shape transitions`
_Destructive change — requires pool recreation_

## What It Provisions

- Cognito User Pool with configured auth flows
- Cognito User Pool Client
- Lambda triggers (if custom flows configured)
- DynamoDB table (session storage)
- IAM roles for Cognito identity

## See Also

- [auth-basic](./auth-basic.md) — Simpler auth for prototypes/MVPs
- [auth-oidc](./auth-oidc.md) — Direct external IdP without Cognito
- [api-namespace](./api-namespace.md) — Protecting routes with requireAuth/requireRole
