# Module 04 - Guild Hall Lobby

**Goal:** persist games and list public rooms without scanning.

```bash
cd ../app/backend
cp ../../04-lobby/solution/index.ts aws-blocks/index.ts
npm run typecheck
```

This checkpoint introduces a `DistributedTable` keyed by constant partition
`listKey` plus `gameId`, with a `byCreated` GSI. `listGames` queries that index;
it never performs a full table scan.

After regeneration, exercise both responsive hall layouts:

```bash
npx blocks-generate-spec aws-blocks/index.ts ../lib/blocks.spec.json
cd ..
dart run build_runner build --delete-conflicting-outputs
flutter run -d macos
```

Create public and private games, copy a private access code, resize below 840px,
and join from a second client.

Next: [State and chat](../05-state/README.md).
