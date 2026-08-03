# AuthCognito

Full-featured Cognito User Pool auth with passwordless, MFA, social federation, and hosted UI support.

```typescript
const auth = new AuthCognito(scope, 'auth', {
  signIn: {
    emailAndPassword: true,       // email + password sign-in
    passwordless: ['email-otp'],  // magic code via email
  },
  mfa: { required: false, methods: ['totp'] },
  userAttributes: {
    email: { required: true },
    name: { required: false },
  },
  passwordPolicy: { minLength: 8, requireDigits: true },
  selfSignUp: true,
});

// Server-side: protect routes
const user = await auth.requireAuth(context); // { userId, username, email }

// Check without throwing
const user = await auth.checkAuth(context); // user | null

// Fetch full session (tokens, credentials)
const session = await auth.fetchAuthSession(context);
```

**Key methods:**

- `requireAuth(context)` — returns `AuthUser` or throws 401
- `checkAuth(context)` — returns `AuthUser | null`
- `fetchAuthSession(context)` — returns session with tokens
- `signUp(input)` / `confirmSignUp(input)` — registration flow
- `signIn(input)` / `confirmSignIn(input)` — auth flow
- `signOut(context)` — end session
- `resetPassword(input)` / `confirmResetPassword(input)` — recovery
- `getCurrentUser(context)` — get current user info

**Frontend client:**

```typescript
import { auth } from "aws-blocks";

// Sign in
await auth.signIn({ username: "user@example.com", password: "..." });
// Confirm MFA/OTP
await auth.confirmSignIn({ challengeResponse: "123456" });
// Get current user
const user = await auth.getCurrentUser();
// Sign out
await auth.signOut();
```

Local mock: In-memory user store + local JWT. AWS: Cognito User Pool + Identity Pool.

**Note:** Cognito result unions (sign-in, sign-up, confirmation flows) are discriminated on a string `status` field. Use `result.status` for type narrowing in TypeScript (e.g., `if (result.status === 'CONFIRM_SIGN_UP')`) rather than shape-matching on optional properties.
