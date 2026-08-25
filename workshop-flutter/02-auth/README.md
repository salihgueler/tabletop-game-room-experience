# Module 02 — Auth (`fakeAuth` → `AuthBasic`)

**Goal:** replace the fake single-user session with real username/password accounts,
sessions, and route protection — without touching the Flutter frontend.

**Block introduced:** `AuthBasic`

**You edit:** `app/backend/aws-blocks/index.ts`

**You'll know you're done when:** signing out and hitting the API returns **401**, and
a fresh account can sign up, save a character, and stay signed in across app restarts.

---

## Concept

The starter fakes auth with a module-level `let fakeUser` — everyone is the same
person, always "logged in." `AuthBasic` replaces that with a real Block: hashed
passwords, a signup/signin/signout state machine, and an **HttpOnly session cookie**
the runtime sends on every request. Two touchpoints:

- **`auth.requireAuth(context)`** — call it at the top of any method to require a
  session. It reads the cookie off the per-request `context` and **throws 401** if
  there isn't one. This is why `context` (ignored until now) suddenly matters.
- **`auth.createApi()`** — builds the `authApi` namespace (`getAuthState` /
  `setAuthState`) the Flutter app already calls through the generated
  `Blocks.authApi`. It also auto-wires the Lambda's DynamoDB IAM permissions — don't
  hand-build an `ApiNamespace` for auth.

The `crossDomain` option matters for native clients: when the Flutter app runs on a
device (or in a web sandbox) at a **different origin** from the API, the session
cookie needs `SameSite=None; Secure`. Setting
`crossDomain: process.env.BLOCKS_SANDBOX === "true"` enables this only in deployed
sandboxes. Locally, the Dart HTTP client and the backend share `localhost:3001`, so
same-origin rules apply normally.

The Flutter UI never changes: `GameRepository.authenticate()` already calls
`authApi.setAuthState(...)` with the generated `SignInInput` / `SignUpInput` /
`SignOutInput` sealed variants. In the starter those hit the fake; now they hit the
real Block.

## Steps

### 1. Import the AuthBasic

Add the `AuthBasic` to the import in `backend/aws-blocks/index.ts`:

```ts
import { ApiNamespace, Scope, AuthBasic } from "@aws-blocks/blocks";
```

### 2. Add the AuthBasic Building Block

Right after `const scope = new Scope("tt")`, the auth block is created:

```ts
const auth = new AuthBasic(scope, "auth", {
  passwordPolicy: { minLength: 8 },
  crossDomain: process.env.BLOCKS_SANDBOX === "true",
});
```

### 3. Replace the hand-rolled auth namespace

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

Every method that called the fake `requireAuth()` now awaits the real one. The fake
was synchronous and took no args; the real one is `async` and needs `context`. Search
for the following:

```ts
requireAuth();
```

and replace with the following:

```ts
await auth.requireAuth(context);
```

Do this in `saveCharacter`, `getCharacter`, `createGame`, `getState`, `joinGame`,
`startWithAi`, `takeAction`, `advanceBotTurn`, the channel getters, `getChatHistory`,
`sendChat`. Afterwards, remove `requireAuth()` function.

### 5. Delete mocks related to auth

Find the comments and implementation details about auth mocks and fake users and remove them.

### 5. Regenerate the Dart client

```bash
cd backend   # the blocks-generate-spec binary lives here
npx blocks-generate-spec aws-blocks/index.ts ../lib/blocks.spec.json
cd ..
dart run build_runner build --delete-conflicting-outputs
flutter analyze
```

#### Copy the solution if something is missing

```bash
cd backend
cp ../../02-auth/solution/index.ts aws-blocks/index.ts
npm run typecheck
```

#### Cross-domain note

`crossDomain` is set from `BLOCKS_SANDBOX` — when `true`, the session cookie
works across origins (deployed sandbox, mobile on device network).

The generated Dart types `SignInInput`, `SignUpInput`, and `SignOutInput` are sealed
variants consumed in `lib/data/repositories/game_repository.dart`. The Dart runtime
(`blocks_runtime`) automatically persists and resends the session cookie on
subsequent RPC calls.

### 4. Run and test

Start both processes:

```bash
# Terminal 1
npm run dev

# Terminal 2
cd .. && flutter run -d macos
```

## Verify

Backend check — unauthenticated calls must now be rejected:

```bash
# no session cookie → 401
curl -s -X POST http://localhost:3001/aws-blocks/api \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"api.getCharacter","params":[],"id":1}'
# → {"error":{"code":401,...}}
```

Flutter check:

1. You're now greeted by the **sign-in / register** screen (no more auto-login).
2. Register a new adventurer (password ≥ 8 chars) → you land on character select.
3. Hot-restart the app (`R` in the terminal) — you stay signed in (the session
   cookie persists in the Dart HTTP client's jar).
4. Sign out → you're bounced back to the auth screen.
5. Stop and re-run `flutter run` — sign in again → your session restores if the
   backend stayed up.

---

## Checklist

- [ ] `npm run typecheck` and `flutter analyze` both pass.
- [ ] Unauthenticated `curl` to `api.getCharacter` returns a 401.
- [ ] You can register, save a character, restart the Flutter app, and stay signed in.
- [ ] Signing out returns you to the auth screen.

## What you learned

- `AuthBasic` gives you accounts, sessions, and password hashing as one Block.
- `auth.requireAuth(context)` is the one-line gate for any protected method;
  `context` carries the session.
- `auth.createApi()` is the _only_ right way to expose auth — it auto-wires IAM, so
  a hand-rolled wrapper breaks in production with AccessDenied.
- The generated sealed variants (`SignInInput` / `SignUpInput` / `SignOutInput`) let
  Dart's exhaustive pattern matching enforce valid auth actions at compile time.

## Troubleshooting

- **Sign-in fails on Android emulator** — confirm the app resolves to `10.0.2.2`
  (check `lib/data/services/blocks_api_url_io.dart`). The emulator's `localhost`
  points to the emulator itself, not your host machine.
- **401 even after signing in** — delete `app/backend/.bb-data` and restart the
  backend. A stale local auth store from an earlier run can corrupt sessions.
- **Type error: `Cannot find name 'requireAuth'`** — you have a leftover fake
  reference. Search for `requireAuth(` and ensure each is
  `await auth.requireAuth(context)`.
- **Port 3001 clash** — stop the React workshop backend; both use `:3001`.
- **Stale generated types** — regenerate:
  ```bash
  cd backend
  npx blocks-generate-spec aws-blocks/index.ts ../lib/blocks.spec.json
  cd ..
  dart run build_runner build --delete-conflicting-outputs
  ```

---

**Next:** [Module 03 — Characters](../03-characters/) — swap the `characterStore`
Map for a real `DistributedTable` so heroes survive a restart.
