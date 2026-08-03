# Module 06 - Realtime

**Goal:** replace no-op channels with typed realtime streams.

```bash
cd ../app/backend
cp ../../06-realtime/solution/index.ts aws-blocks/index.ts
npm run typecheck
```

Three namespaces are introduced:

- `state`: a version bump that tells clients to refetch authoritative state
- `chat`: complete chat/transcript events
- `thinking`: streamed AI reasoning tokens

Regenerate the Dart client. Generated channel methods return
`RealtimeChannel<dynamic>`; the repository turns their subscriptions into
domain streams.

```bash
npx blocks-generate-spec aws-blocks/index.ts ../lib/blocks.spec.json
cd ..
dart run build_runner build --delete-conflicting-outputs
flutter analyze
```

Open two clients. An action or chat message in one should appear in the other
without manual refresh. Stop WebSocket connectivity and confirm the three-second
state polling fallback keeps the table usable.

Next: [AI Dungeon Master](../07-ai-dm/README.md).
