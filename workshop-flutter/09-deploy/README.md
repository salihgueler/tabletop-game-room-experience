# Module 09 - Deploy Flutter Web and Blocks

**Goal:** validate in a sandbox, build Flutter web, and host it with the Blocks
API on one origin.

## 1. Sandbox the backend

```bash
cd ../app/backend
npm run sandbox
```

Run Flutter against the printed API Gateway URL:

```bash
cd ..
flutter run -d chrome \
  --dart-define=BLOCKS_API_URL=https://YOUR_API/aws-blocks/api
```

Destroy the sandbox when finished with `npm run sandbox:destroy`.

## 2. Configure Hosting

In `backend/aws-blocks/index.cdk.ts`, configure `Hosting` to build the parent
Flutter project:

```ts
new Hosting(blocksStack, "Hosting", {
  root: join(__dirname, "../.."),
  buildCommand: "flutter build web --release",
  buildOutputDir: "build/web",
  api: blocksStack,
});
```

Before deploying, regenerate the spec and build locally:

```bash
cd ../app/backend
npx blocks-generate-spec aws-blocks/index.ts ../lib/blocks.spec.json
cd ..
dart run build_runner build --delete-conflicting-outputs
flutter build web --release
flutter analyze
flutter test
```

Then deploy through the Blocks script, not raw CDK:

```bash
cd backend
npm run deploy
```

Open the CloudFront URL, register, create a character, play a turn, verify
realtime in a second tab, and inspect Lambda logs if AI falls back to generic
actions. Use `npm run destroy` when the environment is no longer needed.
