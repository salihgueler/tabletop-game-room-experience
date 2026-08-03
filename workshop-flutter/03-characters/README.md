# Module 03 - Persistent Characters

**Goal:** replace the character `Map` with `DistributedTable`.

```bash
cd ../app/backend
cp ../../03-characters/solution/index.ts aws-blocks/index.ts
npm run typecheck
```

The table schema is defined with Zod and keyed by `userId`. `saveCharacter`
writes the authenticated user's hero; `getCharacter` reads the same key. The
Flutter repository maps generated `GetCharacterResult` into its immutable
`Character` domain model.

Regenerate and verify:

```bash
npx blocks-generate-spec aws-blocks/index.ts ../lib/blocks.spec.json
cd ..
dart run build_runner build --delete-conflicting-outputs
flutter analyze
flutter test
```

Choose a character, restart both processes, sign in, and confirm character
selection is skipped.

Next: [Guild Hall](../04-lobby/README.md).
