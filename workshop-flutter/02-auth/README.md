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
sandboxes (`process.env` is Node's environment-variable map, the equivalent of Dart's
`Platform.environment`). Locally, the Dart HTTP client and the backend share
`localhost:3001`, so same-origin rules apply normally.

The Flutter UI never changes: `GameRepository.authenticate()` already calls
`authApi.setAuthState(...)` with the generated `SignInInput` / `SignUpInput` /
`SignOutInput` sealed variants. In the starter those hit the fake; now they hit the
real Block.

## Steps

> **Working directory:** every fence in this module starts from `workshop-flutter/app/`.
> The `cd` lines are written so you can paste them in order from there.

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
`joinPrivate`, `startWithAi`, `takeAction`, `advanceBotTurn`, the three channel getters,
`getChatHistory`, `sendChat` — 14 call sites in total. Afterwards, remove the
`requireAuth()` function. (`getConstants` stays public: it returns static reference data
the sign-in screen needs before anyone has a session.)

### 5. Delete mocks related to auth

Find the comments and implementation details about auth mocks and fake users and remove them.

### 6. Regenerate the Dart client

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

### 7. Run and test

Start both processes:

```bash
# Terminal 1
cd backend # make sure you are at backend folder
npm run dev

# Terminal 2
cd app # make sure you are at app folder
flutter run -d chrome
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

### The Flutter side

The backend swap you just made ("discriminated union of auth actions") shows up on the
Dart side as something a Flutter developer already knows how to reason about: a **sealed
class**. This is the module where the generated client earns its keep, so open it.

**(a) The sealed input hierarchy.** In `app/lib/blocks.blocks.dart`, find
`sealed class AuthApiSetAuthStateInput` (around L2287). On the backend, `setAuthState`
takes a *discriminated union* — one object type per `action` (`"signIn"`, `"signUp"`,
`"signOut"`, …), each carrying different fields. The generator maps that union to a Dart
**sealed** base class with one concrete subclass per variant:

```dart
class SignInInput  extends AuthApiSetAuthStateInput { final String username, password; ... }
class SignUpInput  extends AuthApiSetAuthStateInput { final String username, password; ... }
class SignOutInput extends AuthApiSetAuthStateInput { ... }  // no fields
```

Each subclass carries only the fields its action actually uses — `SignOutInput` has none,
`SignInInput` has `username`/`password` — so an impossible combination (a sign-out with a
password) is simply unrepresentable. You can't construct one.

Now see them built. Open `app/lib/data/repositories/game_repository.dart`, method
`authenticate()` (around L20-38):

```dart
final input = createAccount
    ? SignUpInput(username: username, password: password)
    : SignInInput(username: username, password: password);
final state = await _service.authApi.setAuthState(input: input);
```

and `signOut()` right below it constructs `const SignOutInput()`. Because
`AuthApiSetAuthStateInput` is **sealed**, Dart knows the complete set of subclasses at
compile time — so a `switch` over one is checked for **exhaustiveness**: leave a variant
unhandled and it's a *compile error*, not a runtime surprise. That is the same guarantee
the backend's discriminated union gives TypeScript, carried across the wire to Dart.

**Try it (30 seconds):** paste a scratch switch anywhere in a Dart file —

```dart
String label(AuthApiSetAuthStateInput i) => switch (i) {
      SignInInput()  => 'sign in',
      SignUpInput()  => 'sign up',
      SignOutInput() => 'sign out',
      // delete one of these lines...
    };
```

Delete one case, run `flutter analyze`, and read the error: it names the missing subtype
and refuses to compile. Restore the case and it's clean. That exhaustiveness is the whole
reason a sealed class beats a `String action` field.

**(b) "The session cookie is persisted and resent automatically" — where that's true.**
The module claims the Dart runtime persists and resends the session cookie for you. It
does, and here is the actual code path so you trust it rather than take it on faith. It
lives in the **`blocks_runtime`** package — the runtime `blocks.blocks.dart` imports and
re-exports (see the `BlocksClient` export at the top of the generated file) — in its
`BlocksClient`. On each request it attaches whatever cookie the session store holds:

```dart
final cookie = sessionStore.cookieHeader;
if (cookie != null) headers['cookie'] = cookie;
```

and after every response it captures any `set-cookie` the backend sent back:

```dart
sessionStore.setCookies(response.headers['set-cookie']);
```

So when `AuthBasic` returns its `HttpOnly` session cookie on sign-in, `BlocksClient`
stores it and replays it on every later RPC — no token handling in your repository, no
header code in your widgets. Sign in once, and `getCharacter()` three calls later is
already authenticated. (The store can be the default in-memory one or a persistent one;
that's the knob that decides whether the session survives a full app restart vs. only a
hot-restart.)

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
- **401 even after signing in** — delete `backend/.bb-data` and restart the
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
