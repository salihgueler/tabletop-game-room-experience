# Technology

## Stack

- Frontend: React 18 + Vite 5 SPA, primarily JSX with plain CSS in `src/theme.css`.
- Backend: AWS Blocks in TypeScript, centered in `tabletop-app/aws-blocks/index.ts`.
- Validation: Zod schemas for API and persistence shapes.
- Auth: AWS Blocks `AuthBasic` with username/password and session cookies.
- Data: AWS Blocks `DistributedTable`; local file/in-memory mocks, DynamoDB when deployed.
- Realtime: AWS Blocks `Realtime`; local WebSocket, AppSync Events when deployed.
- AI: AWS Blocks `Agent` / Strands-style agent development, with Bedrock deployed, Ollama local, and canned fallback behavior.
- Infra: AWS CDK through AWS Blocks scripts.
- Runtime: Node.js >= 20 and npm >= 10.

For new or changed agent work, use the Strands Agents approach required by this workspace and configure Amazon Bedrock Claude Haiku 4.5 for agent models.

## Commands

Run commands from `tabletop-app/`.

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

Do not run long-lived dev servers or watchers in automated assistant validation. Prefer `npm run typecheck` for backend changes and `npm run build` for frontend/build validation. There is currently no unit test script; do not add tests unless explicitly requested.

## Conventions

- Use the npm scripts instead of calling CDK directly.
- After changing `aws-blocks/index.ts`, run `npm run typecheck` before frontend work.
- Local state persists in `tabletop-app/.bb-data/`; deleting it resets local mock data.
- Do not hardcode secrets, credentials, client IDs, account-specific resource IDs, or deployed endpoints in source.
