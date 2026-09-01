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
signup/signin/signout state machine, and an **HttpOnly session cookie** (a cookie the
browser stores and sends automatically but JavaScript can't read, so a stolen token can't
leak via XSS) the browser sends on every request. Two touchpoints:

- **`auth.requireAuth(context)`** — call it at the top of any method to require a session.
  It reads the cookie off the per-request `context` and **throws 401** if there isn't one.
  This is why `context` (ignored until now) suddenly matters.
- **`auth.createApi()`** — builds the `authApi` namespace (`getAuthState` / `setAuthState`)
  the frontend's sign-in form already calls. It also auto-wires the Lambda's DynamoDB IAM
  (AWS Identity and Access Management — the policy that says which cloud resources this
  function is allowed to touch) permissions, so **don't** hand-build an `ApiNamespace` for
  auth.

The frontend never changes. The sign-in form (`app/src/screens/AuthScreen.jsx`) doesn't
call the client directly — it calls the `signIn`/`signUp` helpers in `app/src/api.js`,
which are thin wrappers over `authApi.setAuthState(...)`. Session hydration and the
`onAuthChange(authApi, ...)` subscription live one level up in `app/src/App.jsx`. In the
starter all of that hits the fake; now it hits the real Block. That's the whole point of
matching the mock's shape — you'll trace the exact wiring in [The React side](#the-react-side).

## Steps

### 1. Add the `AuthBasic` block

Constructing `new AuthBasic(...)` is a declaration, not a call — it doesn't sign anyone in.
Think of it like instantiating a client library once at module load (the way you'd
`createClient()` for a data layer at the top of a file): you're telling Blocks "this app
has password auth, keep sessions at least 8 characters strong," and it provisions the user
store, hashing, and session machinery behind that one object. Everything auth-related later
in the file — the API namespace, the per-request gate — hangs off this `auth` handle.

The one detail that reaches the client: `crossDomain` decides whether the session cookie is
scoped to a single origin or allowed across domains. Locally the Vite dev proxy makes the
API same-origin, so it stays `false` and the browser sends the cookie automatically; only
module 09's sandbox flips it on. Get this wrong and sign-in "succeeds" but every following
request is mysteriously a 401 because the cookie never rode along.

Update the blocks import to have `AuthBasic`:

```ts
import { ApiNamespace, Scope, AuthBasic } from "@aws-blocks/blocks";
```

Now, right after `const scope = new Scope("tt")`, add the import add the block:

```ts
const scope = new Scope("tt");

const auth = new AuthBasic(scope, "auth", {
  passwordPolicy: { minLength: 8 },
  // Needed only when frontend and API are on different domains (module 09's
  // sandbox sets BLOCKS_SANDBOX=true). Locally the Vite proxy is same-origin.
  crossDomain: process.env.BLOCKS_SANDBOX === "true",
});
```

### 2. Delete the auth mock

1. Remove the entire **`MOCK: auth`** section
2. Remove `type User`, `let fakeUser`, `fakeAuthApi`, and the fake `requireAuth()` function.

(Keep the persistence/realtime/AI mocks; those are later modules.)

### 3. Export the real auth API

Replace the below hand-rolled auth namespace:

```ts
export const authApi = new ApiNamespace(
  scope,
  "authApi",
  (context) => fakeAuthApi,
);
```

with the following:

```ts
export const authApi = auth.createApi();
```

### 4. Use real auth in every method

Every method that called the fake `requireAuth()` now awaits the real one. The fake was
synchronous and took no args; the real one is `async` and needs `context`. Search for the following.

```ts
requireAuth();
```

and replace with the following:

```ts
await auth.requireAuth(context);
```

Most call sites keep the result, so the majority of your edits look like this instead — same
change, with the binding left in place:

```ts
const user = await auth.requireAuth(context);
```

The real user object exposes `username`, so every `user.username` downstream keeps working.

Do this for all of them (`saveCharacter`, `getCharacter`, `createGame`, `getState`,
`joinGame`, `joinPrivate`, `startWithAi`, `takeAction`, `advanceBotTurn`, the three channel
getters, `getChatHistory`, `sendChat`) — **14 call sites in total**. The reliable way to
catch them all is to search for `requireAuth(` and convert every hit; if you miss one, `tsc`
tells you immediately with `Cannot find name 'requireAuth'`, because you deleted the mock.
(`getConstants` stays public — the sign-in screen needs it before anyone has a session.)

> `user.username` is still the right key for `characterStore` — the real user object
> exposes `username` just like the fake did.

### 5. Verify
Typecheck first: because you deleted the `requireAuth()` mock, any call site you missed
shows up here as `Cannot find name 'requireAuth'` rather than as a runtime 401 later. The
curl below is the real gate — it proves the guard is on the *server*, which clicking around
the UI can never show you.

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

On Windows (cmd.exe), one line with escaped quotes:

```cmd
curl -s -X POST http://localhost:3001/aws-blocks/api -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"method\":\"api.getCharacter\",\"params\":[],\"id\":1}"
```

> In PowerShell use `curl.exe` (plain `curl` is an alias for `Invoke-WebRequest`).

Frontend check at http://localhost:3000:

1. You're now greeted by the **sign-in / register** screen (no more auto-login).
2. Register a new adventurer (password ≥ 8 chars) → you land on character select.
3. Reload the page — you stay signed in (the session cookie persists).
4. Sign out (⎋ in the guild hall) → you're bounced back to the auth screen.

Compare your file against [`solution/index.ts`](solution/index.ts) in this folder — that's
the completed module. To catch up or start clean, copy it over your app from
`workshop/app/`:

```bash
cp ../02-auth/solution/index.ts aws-blocks/index.ts
```

---

### The React side

You never touched the frontend in this module, which is exactly the interesting part —
open the two files that make a Blocks auth client feel like ordinary React state.

**`app/src/api.js`** is the seam. It re-exports the generated `api`/`authApi` clients and
adds three helpers:

```js
export async function signIn(username, password) {
  const state = await authApi.setAuthState({ action: 'signIn', username, password })
  broadcastAuthChange(state.user ?? null)
  return state
}
// signUp is the same shape with action:'signUp'; signOut sends action:'signOut'.
```

Two things to notice. First, `setAuthState` is the *only* auth call — sign-in, sign-up, and
sign-out are one method distinguished by an `action` field, and it's the same
`authApi.setAuthState` your `curl` hit above. Second, `broadcastAuthChange(...)` is a
pub/sub nudge: `setAuthState` already set the HttpOnly cookie server-side, but nothing in
React knows yet, so this fires an event the rest of the app can listen for. If you've used
a `useContext`/event-emitter pattern to fan out "the user just changed," this is that.

`app/src/screens/AuthScreen.jsx` imports `signIn`/`signUp` from `api.js` — **not** the raw
client — and calls them on form submit. So the request path is
`AuthScreen → api.js helper → authApi.setAuthState → AuthBasic`. It never imports the Blocks
client directly, which is why swapping the fake for the real Block changed nothing here.

**`app/src/App.jsx`** is where auth becomes app state (around L60-82). On mount it awaits
`authApi.getAuthState()` once to hydrate the current session before rendering any screen —
this is the reload-and-stay-signed-in behavior, and it's a plain `await` inside a
`useEffect`, no different from fetching `/me` on boot. Then it subscribes:

```js
unsub = onAuthChange(authApi, (u) => { restoreSession(u) })
```

`onAuthChange` is the other half of `broadcastAuthChange`: the helper in `api.js` fires,
this listener in `App.jsx` receives the new user (or `null`), and `restoreSession` flips
React state so `App` re-renders the auth gate, character select, or hall accordingly. That
publish-here/subscribe-there split is why signing out in the guild hall instantly bounces
you to the auth screen even though the button is in a completely different component tree —
the same decoupled-event pattern you'd reach for with a state library, just wired to the
Blocks client instead.

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
