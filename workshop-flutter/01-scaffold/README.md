# Module 01 - Scaffold Blocks and Generate Dart

**Goal:** add a backend beside Flutter, run the complete mock game, and generate
the first typed native client.

## 1. Create the backend

```bash
cd ../app
mkdir backend
cd backend
npm create @aws-blocks/blocks-app@latest . -- --template backend
```

Copy this checkpoint:

```bash
cp ../../01-scaffold/solution/index.ts aws-blocks/index.ts
cp ../../01-scaffold/solution/index.handler.ts aws-blocks/index.handler.ts
cp ../../01-scaffold/solution/server.ts aws-blocks/scripts/server.ts
npm install
```

The mock backend uses real `Scope` and `ApiNamespace`; auth, stores, channels,
and AI are deliberately in-memory stand-ins.

## 2. Generate the Flutter API

```bash
npx blocks-generate-spec aws-blocks/index.ts ../lib/blocks.spec.json
cd ..
flutter pub get
dart run build_runner build --delete-conflicting-outputs
```

Inspect `lib/blocks.blocks.dart`: `Blocks.api` and `Blocks.authApi` are generated
from backend exports.

## 3. Run

Terminal one:

```bash
cd backend
npm run dev
```

Terminal two:

```bash
flutter run -d macos
```

Use `-d chrome` for web or an Android emulator. The app maps Android localhost
to `10.0.2.2`.

## Verify

```bash
flutter analyze
flutter test
curl -s -X POST http://localhost:3001/aws-blocks/api \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"api.getConstants","params":{},"id":1}'
```

Next: [AuthBasic](../02-auth/README.md).
