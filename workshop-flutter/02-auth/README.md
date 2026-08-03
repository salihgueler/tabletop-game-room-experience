# Module 02 - AuthBasic

**Goal:** replace fake auth with durable username/password sessions.

Copy the checkpoint or follow the diff in `solution/index.ts`:

```bash
cd ../app/backend
cp ../../02-auth/solution/index.ts aws-blocks/index.ts
npm run typecheck
```

The important backend changes are:

- create `AuthBasic(scope, "auth", { passwordPolicy: { minLength: 8 } })`
- export `auth.createApi()` as `authApi`
- call `auth.requireAuth(context)` in protected methods
- set `crossDomain` from `BLOCKS_SANDBOX` for deployed mobile/web clients

Regenerate the native contract:

```bash
npx blocks-generate-spec aws-blocks/index.ts ../lib/blocks.spec.json
cd ..
dart run build_runner build --delete-conflicting-outputs
flutter analyze
flutter test
```

The generated `SignInInput`, `SignUpInput`, and `SignOutInput` sealed variants
are consumed in `lib/data/repositories/game_repository.dart`. The runtime keeps
the session cookie and sends it on subsequent RPC calls.

Register, restart the Flutter app, and confirm the session restores.

Next: [Characters](../03-characters/README.md).
