# Module 08 - AI Companions

**Goal:** give each AI party seat its own class-specific `Agent`.

```bash
cd ../app/backend
cp ../../08-companions/solution/index.ts aws-blocks/index.ts
npm run typecheck
```

Each companion returns structured reasoning, one valid action, and a short line.
Reasoning tokens publish to `thinking`; the Flutter game view model displays
them and allows only the host client to call `advanceBotTurn`, preventing
duplicate bot turns in multiplayer rooms.

Regenerate and verify:

```bash
npx blocks-generate-spec aws-blocks/index.ts ../lib/blocks.spec.json
cd ..
dart run build_runner build --delete-conflicting-outputs
flutter analyze
flutter test
```

Launch with AI and watch several consecutive companion turns. Each class should
choose from the current server-provided options and speak in character.

Next: [Deploy](../09-deploy/README.md).
