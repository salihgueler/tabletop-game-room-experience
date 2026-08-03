# Module 05 - Authoritative State and Chat

**Goal:** move game state and transcripts from process memory to tables.

```bash
cd ../app/backend
cp ../../05-state/solution/index.ts aws-blocks/index.ts
npm run typecheck
```

The backend now owns players, turn index, phase, DC, dice, options, timer, log,
and inventory. Flutter only renders `GetStateResult` and sends commands such as
`takeAction`; it never rolls dice or advances turns locally.

Regenerate:

```bash
npx blocks-generate-spec aws-blocks/index.ts ../lib/blocks.spec.json
cd ..
dart run build_runner build --delete-conflicting-outputs
flutter analyze
```

Launch an AI-filled room, take an action, and inspect the chat transcript after
restarting the app. Both board state and transcript should survive.

Next: [Realtime](../06-realtime/README.md).
