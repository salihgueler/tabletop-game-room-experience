# Module 07 - AI Dungeon Master

**Goal:** replace canned narration with an `Agent`.

```bash
cd ../app/backend
cp ../../07-ai-dm/solution/index.ts aws-blocks/index.ts
npm run typecheck
```

The DM uses `inferenceOnly`, a pinned Bedrock inference profile when deployed,
Ollama locally, and a canned final fallback. It narrates outcomes and creates
scene-specific action options while the backend remains authoritative.

No Ollama is required. For live local inference:

```bash
ollama serve
ollama pull llama3.1:8b
```

Regenerate and play:

```bash
npx blocks-generate-spec aws-blocks/index.ts ../lib/blocks.spec.json
cd ..
dart run build_runner build --delete-conflicting-outputs
flutter run -d macos
```

Contextual options indicate the model is active; fixed class actions indicate
the safe fallback.

Next: [AI companions](../08-companions/README.md).
