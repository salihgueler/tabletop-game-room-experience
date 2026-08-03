# Technology

## Stack

- Frontends: React 18 + Vite 5 in `tabletop-app/`, and Flutter in
  `tabletop-flutter/`.
- Backends: independent AWS Blocks TypeScript projects under each finished app's
  `aws-blocks/index.ts`.
- Native API: `blocks_codegen` generates Flutter bindings from
  `tabletop-flutter/lib/blocks.spec.json`.
- Validation: Zod schemas for API and persistence shapes.
- Auth: AWS Blocks `AuthBasic` with username/password and session cookies.
- Data: AWS Blocks `DistributedTable`; local file/in-memory mocks, DynamoDB when deployed.
- Realtime: AWS Blocks `Realtime`; local WebSocket, AppSync Events when deployed.
- AI: AWS Blocks `Agent` / Strands-style agent development, with Bedrock deployed, Ollama local, and canned fallback behavior.
- Infra: AWS CDK through AWS Blocks scripts.
- Runtime: Node.js >= 20 for React, Node.js >= 22 for Flutter Blocks, npm >= 10,
  Flutter >= 3.41, and Dart >= 3.12.

For new or changed Agent work, use the Strands Agents approach required by this
workspace and preserve the explicit deployed model configured by the selected
backend. Both finished apps currently pin Claude Sonnet 4.6.

## Commands

Run React commands from `tabletop-app/`:

```bash
npm install
npm run dev             # local client :3000 + backend :3001; long-running
npm run typecheck       # TypeScript check; run after backend edits
npm run build           # production frontend build to dist/
npm run sandbox         # ephemeral AWS sandbox
npm run sandbox:destroy
npm run deploy          # production deploy through Blocks scripts
npm run destroy
```

Run Flutter commands from `tabletop-flutter/`:

```bash
npm install
flutter pub get
npm run dev             # local Blocks backend :3001; long-running
npm run generate        # backend spec -> generated Dart client
npm run verify          # typecheck, analyze, test, and Flutter web build
npm run sandbox
npm run deploy
```

The two local backends both use port 3001 and cannot run simultaneously.

Do not run long-lived dev servers or watchers in automated validation. For
React, prefer `npm run typecheck` and `npm run build`. For Flutter, prefer
`npm run verify`.

## Conventions

- Use the npm scripts instead of calling CDK directly.
- After changing an app's `aws-blocks/index.ts`, run that app's typecheck before
  frontend work.
- After changing the Flutter API contract, run `npm run generate`.
- Local state persists separately in each app's `.bb-data/`.
- Keep the React and Flutter Blocks scopes and deployment stack IDs distinct.
- Do not hardcode secrets, credentials, client IDs, account-specific resource IDs, or deployed endpoints in source.
