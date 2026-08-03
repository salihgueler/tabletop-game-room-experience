# Adventurer's Guild Hall for Flutter

A Flutter client for the tabletop game room in `../tabletop-app`. It keeps the
AWS Blocks backend authoritative and uses the official Dart SDK generated from
`blocks.spec.json`.

## Features

- AuthBasic sign-in and registration
- Character creation with all 20 pixel sprites
- Public/private Guild Hall games
- Responsive game table, turn order, actions, chat, dice, and timer
- Realtime state/chat/thinking subscriptions with polling fallback
- Host-only AI companion turn stepping
- Android, iOS, macOS, and web targets

## Run locally

Start the existing Blocks backend:

```bash
cd ../tabletop-app
npm run dev:server
```

Then run Flutter from another terminal:

```bash
cd ../tabletop-flutter
flutter pub get
flutter run -d macos
```

The default API is `http://localhost:3001/aws-blocks/api`. Android emulators use
`10.0.2.2` automatically. Override any target with:

```bash
flutter run --dart-define=BLOCKS_API_URL=https://example.com/aws-blocks/api
```

## Regenerate the typed client

After changing `tabletop-app/aws-blocks/index.ts`:

```bash
cd ../tabletop-app
node node_modules/@aws-blocks/core/dist/scripts/generate-spec-cli.js \
  aws-blocks/index.ts ../tabletop-flutter/lib/blocks.spec.json
cd ../tabletop-flutter
dart run build_runner build --delete-conflicting-outputs
```

Never edit `lib/blocks.blocks.dart` by hand.

## Verify

```bash
flutter analyze
flutter test
flutter build web
```

The app follows a UI/ViewModel/Repository/Service structure under `lib/`.
