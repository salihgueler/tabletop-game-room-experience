# Module 02 — Auth (`fakeAuth` → `AuthBasic`)

**Goal:** replace the fake single-user session with real username/password accounts,
sessions, and route protection — without touching the frontend.

**Block introduced:** `AuthBasic`
**You edit:** `app/aws-blocks/index.ts`
**You'll know you're done when:** signing out and hitting the API returns **401**, and a
fresh account can sign up, save a character, and stay signed in across reloads.

---

## Concept

The starter fakes auth with a module-level `let fakeUser` — everyone is the same person,
always "logged in." `AuthBasic` replaces that with a real Block: hashed passwords, a
signup/signin/signout state machine, and an **HttpOnly session cookie** the browser sends
on every request. Two touchpoints:

- **`auth.requireAuth(context)`** — call it at the top of any method to require a session.
  It reads the cookie off the per-request `context` and **throws 401** if there isn't one.
  This is why `context` (ignored until now) suddenly matters.
- **`auth.createApi()`** — builds the `authApi` namespace (`getAuthState` / `setAuthState`)
  the frontend's sign-in form already calls. It also auto-wires the Lambda's DynamoDB IAM
  permissions, so **don't** hand-build an `ApiNamespace` for auth.

The frontend never changes: `AuthScreen.jsx` already calls `authApi.setAuthState(...)` and
`onAuthChange(authApi, ...)`. In the starter those hit the fake; now they hit the real
Block. That's the whole point of matching the mock's shape.

## Steps

### 1. Add the `AuthBasic` block

Near the top of `index.ts`, right after `const scope = new Scope("tt")`, add the import
and the block:

```ts
import { ApiNamespace, Scope, AuthBasic } from "@aws-blocks/blocks";

const scope = new Scope("tt");

const auth = new AuthBasic(scope, "auth", {
  passwordPolicy: { minLength: 8 },
  // Needed only when frontend and API are on different domains (module 09's
  // sandbox sets BLOCKS_SANDBOX=true). Locally the Vite proxy is same-origin.
  crossDomain: process.env.BLOCKS_SANDBOX === "true",
});
```

### 2. Delete the auth mock

Remove the entire **`MOCK: auth`** section — `type User`, `let fakeUser`, `fakeAuthApi`,
and the fake `requireAuth()` function. (Keep the persistence/realtime/AI mocks; those are
later modules.)

### 3. Export the real auth API

Replace the hand-rolled auth namespace:

```ts
// before (starter):
export const authApi = new ApiNamespace(
  scope,
  "authApi",
  (context) => fakeAuthApi,
);

// after (module 02):
export const authApi = auth.createApi();
```

### 4. Use real auth in every method

Every method that called the fake `requireAuth()` now awaits the real one. The fake was
synchronous and took no args; the real one is `async` and needs `context`:

```ts
// before:  const user = requireAuth();
// after:   const user = await auth.requireAuth(context);
```

Do this for all of them (`saveCharacter`, `getCharacter`, `createGame`, `getState`,
`joinGame`, `startWithAi`, `takeAction`, `advanceBotTurn`, the channel getters,
`getChatHistory`, `sendChat`). The bare `requireAuth();` calls (no user needed) become
`await auth.requireAuth(context);`.

> `user.username` is still the right key for `characterStore` — the real user object
> exposes `username` just like the fake did.

### 5. Verify

```bash
npm run typecheck        # must be clean before anything else
npm run dev              # regenerates client.js with the real authApi
```

Backend check — unauthenticated calls must now be rejected:

```bash
# no session cookie → 401
curl -s -X POST http://localhost:3001/aws-blocks/api \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"api.getCharacter","params":[],"id":1}'
# → {"error":{"code":401,...}}
```

Frontend check at http://localhost:3000:

1. You're now greeted by the **sign-in / register** screen (no more auto-login).
2. Register a new adventurer (password ≥ 8 chars) → you land on character select.
3. Reload the page — you stay signed in (the session cookie persists).
4. Sign out (⎋ in the guild hall) → you're bounced back to the auth screen.

Compare your file against [`index.ts`](index.ts) in this folder — that's the completed
module. To catch up or start clean, copy it over your app:

```bash
cp ../02-auth/index.ts app/aws-blocks/index.ts   # from the workshop/ dir
```

---

## Checklist

- [ ] `npm run typecheck` passes.
- [ ] Unauthenticated `curl` to `api.getCharacter` returns a 401.
- [ ] You can register, save a character, reload (still signed in), and sign out.

## What you learned

- `AuthBasic` gives you accounts, sessions, and password hashing as one Block.
- `auth.requireAuth(context)` is the one-line gate for any protected method; `context`
  carries the session.
- `auth.createApi()` is the _only_ right way to expose auth — it auto-wires IAM, so a
  hand-rolled wrapper would break in production with AccessDenied.

## Troubleshooting

- **Sign-in fails but sign-up "worked":** you're hitting the backend on `:3001` directly.
  Use `:3000` — the Vite proxy keeps everything same-origin so the cookie sticks.
- **Everything 401s even after signing in locally:** delete `app/.bb-data` and restart —
  a stale local auth store from an earlier run.
- **Type error: `Cannot find name 'requireAuth'`:** you missed a call site. Search for
  `requireAuth(` and make sure each is `await auth.requireAuth(context)`.

---

**Next:** [Module 03 — Characters](../03-characters/) — swap the `characterStore` Map for
a real `DistributedTable` so heroes survive a restart.
