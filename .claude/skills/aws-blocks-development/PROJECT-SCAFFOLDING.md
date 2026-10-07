# Project Scaffolding

`@aws-blocks/create-blocks-app` creates a new Blocks app from a template, adds
Blocks to an existing project, or overlays Blocks onto an Amplify Gen 2 backend.
Its bin is `create-blocks-app`.

## Contents

- Invocation and the three modes
- Available templates
- What a template actually contains
- What a fresh scaffold writes
- Adding Blocks to an existing project (merge behaviour)
- Amplify Gen 2 integration
- Deploy posture and stack identity
- The default template app
- npm scripts by template

## Invocation and the three modes

```bash
# Fresh app in a new directory
npm create @aws-blocks/blocks-app@latest my-app
npm create @aws-blocks/blocks-app@latest my-app -- --template nextjs

# Add Blocks to the current project (run from its root)
npx @aws-blocks/create-blocks-app
npx @aws-blocks/create-blocks-app . -- --template nextjs
```

The mode is auto-detected from the target directory — you do not choose it:

1. **Amplify** — `amplify/backend.ts` exists → overlay Blocks onto the Amplify
   backend.
2. **Existing project** — a `package.json` exists (no Amplify) → add the
   `aws-blocks/` workspace to it.
3. **Fresh** — empty or non-existent directory → copy a template into it.

Flags: `--template <name>` (default `default`), `--skip-install`, `-y`/`--yes`
(skip confirmation prompts), `-h`/`--help`.

In fresh mode `--template` picks the starter app. In existing-project mode it
selects *which template's* `aws-blocks/` workspace to copy, so framework-specific
files match (e.g. `nextjs` gives a `server.ts` that runs `next dev`).

## Available templates

The template set is discovered from `templates/<name>/` folders (each ships a
`package.json` with `blocksTemplate` + `blocksTemplateDescription`). Current set:

| Template | Description (from its package.json, `create-blocks-app@0.2.0`) |
|----------|-------------------------------------|
| **default** | Vite + lit-html frontend with auth, DynamoDB, and realtime (safe default) |
| **bare** | Vite + lit-html frontend with a single greet() API (smallest starter) |
| **react** | Vite + React 19 frontend with auth, DynamoDB, and realtime todo app |
| **backend** | Backend-only: Blocks API + CDK, no frontend (bring your own client) |
| **api-only** | Headless JSON API service: public health check + auth-gated CRUD over a `DistributedTable`, no frontend (for a mobile/CLI/3rd-party client). New in 0.2.0 |
| **sql** | PostgreSQL backend on the `Database` block: `.sql` migrations, a notebooks → notes foreign key (`ON DELETE CASCADE`), per-user ownership, parameterized `sql` queries, a transaction. PGlite locally, Aurora Serverless v2 on deploy. New in 0.2.0 |
| **nextjs** | Next.js 16 App Router with Server + Client Components calling Blocks (local `npm run dev` runs Next with webpack) |
| **auth-cognito** | Vite + vanilla-DOM frontend with Cognito passwordless email-OTP auth end-to-end |
| **amplify** | Overlay for an existing Amplify Gen 2 app (auto-selected when detected); cannot be scaffolded fresh |
| **demo** | AuthBasic + KVStore + DynamoDB priority-sorted todo (Vite, vanilla-DOM) |

Pick `backend` for a bare stub you will replace, `api-only` when you want a
working service skeleton (auth + CRUD) behind a non-web client, and `sql` when
the data is relational.

`amplify` is flagged `blocksTemplateOverlayOnly` and is rejected by fresh mode —
it ships only an overlay snippet, not a standalone app.

## What a template actually contains

Every scaffoldable template's `aws-blocks/` directory holds:

```
aws-blocks/
├── index.ts          # backend: APIs, auth, data, realtime (your app logic)
├── index.cdk.ts      # CDK entry — constructs BlocksStack (+ Hosting on deploy)
├── index.handler.ts  # Lambda handler entry
├── client.js         # generated typed client (gitignored)
├── package.json      # the aws-blocks workspace package
└── scripts/          # sandbox.ts, sandbox-destroy.ts, console.ts, cleanup.ts,
                      #   deploy.ts, destroy.ts, server.ts
```

(The `amplify` template's `aws-blocks/scripts/` is different — only
`generate-client.ts` and `server.ts` — and it adds `cognito-verifier.ts`.)

There is **no `aws-blocks/config.ts`**. No template ships one, and there is no
declarative `compute.type` / `runtime` / `local.port` / `deployment.stackName`
schema anywhere in the codebase. Deploy posture and stack identity come from
`index.cdk.ts` and `.blocks/config.json` instead (see "Deploy posture" below).

At the project root a fresh template also ships `gitignore` (renamed to
`.gitignore` on scaffold), `cdk.json`, `package.json`, `tsconfig.json`, a `test/`
dir, and for frontend templates `index.html`, `src/`, and `vite.config.ts`
(Vite templates) or `next.config.ts` (nextjs).

## What a fresh scaffold writes

Fresh mode copies the template into the (empty) target directory, then:

1. Copies a shared `AGENTS.md` in.
2. Renames `gitignore` → `.gitignore`.
3. Sets `package.json` `name` to the sanitized directory name.
4. Records `package.json` `blocksTemplateVersion` = the template's version.
5. Generates `.blocks/config.json` containing a unique `stackId`
   (`<sanitized-name(≤16)>-<6 hex>`).
6. Runs `npm install` (unless `--skip-install`).

It does **not** modify `tsconfig.json` or `vite.config.ts` — they are copied
verbatim from the template and never rewritten.

## Adding Blocks to an existing project (merge behaviour)

Existing-project mode is a **merge**, not an overwrite. It:

- Copies `aws-blocks/` — but **aborts** if `aws-blocks/` already exists (it never
  overwrites your workspace).
- Copies `cdk.json` only if absent (skips with a warning otherwise).
- Generates `.blocks/config.json` with a `stackId`.
- Edits `package.json` additively: adds `aws-blocks` to `workspaces`, and adds
  deps/devDeps/scripts **only when the key is absent** — it never resets `name`,
  `version`, or an existing field, and never clobbers a script you already have.
- Appends a `# AWS Blocks` block to `.gitignore` (entries: `.blocks-sandbox`,
  `cdk.out/`, `aws-blocks/client.js`, `aws-blocks/blocks.spec.json`) — only for
  entries not already present.

The earlier warning that the scaffolder "overwrites `package.json`,
`tsconfig.json`, `vite.config.ts`, `.gitignore`" is wrong: fresh mode copies into
an empty dir, and existing-project mode merges `package.json`/`.gitignore` and
touches neither `tsconfig.json` nor `vite.config.ts`.

Scripts added in existing-project mode: `sandbox`, `sandbox:destroy`,
`sandbox:console`, `deploy`, `destroy`, `dev:server`.

## Amplify Gen 2 integration

Run `npx @aws-blocks/create-blocks-app` (or `.`) from an Amplify Gen 2 project
root. It creates `aws-blocks/` and `amplify/blocks.ts`, appends an
`initBlocks(backend)` import to `amplify/backend.ts` (writing
`amplify/blocks-manual-patch.txt` if it cannot auto-patch), merges the
`package.json` and `.gitignore`, and creates/patches `amplify.yml` to export
`NODE_OPTIONS=--conditions=cdk`. Existing auth/data/hosting are left untouched.

The scripts it adds are:

| Script | Command |
|--------|---------|
| `sandbox` | `cross-env NODE_OPTIONS="--conditions=cdk" AMPLIFY_SANDBOX=true npx ampx sandbox` |
| `sandbox:delete` | `cross-env NODE_OPTIONS="--conditions=cdk" npx ampx sandbox delete --yes` |
| `blocks:dev` | `tsx watch aws-blocks/scripts/server.ts` |
| `blocks:generate-client` | `cross-env NODE_OPTIONS="--conditions=aws-runtime" tsx aws-blocks/scripts/generate-client.ts` |

(Note the Amplify mode uses `sandbox:delete`, not `sandbox:destroy`, and has no
`deploy`/`destroy` — Amplify owns deployment via `ampx`.)

## Deploy posture and stack identity

Deploy posture is set in `aws-blocks/index.cdk.ts`, not a config file. The
scaffolded entry reads a `sandboxMode` CDK context flag and picks a preset:

```typescript
export const blocksStack = await BlocksStack.create(app, stackName, {
  backendHandlerPath: join(__dirname, 'index.handler.ts'),
  backendCDKPath: join(__dirname, 'index.ts'),
  defaults: sandboxMode ? BlocksPresets.sandbox : BlocksPresets.production,
});

if (!sandboxMode) {
  new Hosting(blocksStack, 'Hosting', {
    root: join(__dirname, '..'),
    buildCommand: 'npm run build',
    buildOutputDir: 'dist',
    api: blocksStack,
  });
}
```

`BlocksPresets.sandbox` vs `BlocksPresets.production` carry the removal-policy /
deletion-protection posture — that is the real "deploy config", and Hosting is
only constructed on a production deploy.

Stack identity comes from `.blocks/config.json`'s `stackId`. The stack name is
derived from it via `getStackName` / `getStackId` (from `@aws-blocks/blocks/scripts`):

```typescript
import { getStackId, getStackName } from '@aws-blocks/blocks/scripts';
// getStackId(projectRoot?: string): string
//   → the configured stackId from .blocks/config.json (throws if absent)
// getStackName(opts: { sandbox: boolean; projectRoot?: string }): string
//   → production (sandbox: false) → `<stackId>-prod`
//   → sandbox    (sandbox: true)  → `<stackId>-<sandboxId>` (per-user, from
//     .blocks-sandbox/sandbox-id.txt, get-or-created on first call)
```

`getStackName` takes a **single options object** `{ sandbox: boolean;
projectRoot?: string }` — there is no positional `sandbox` boolean argument. Use
`getStackId()` for the configured identifier; `getStackName({ sandbox })` derives
the full per-environment stack name.

## The default template app

The `default` template (Vite + lit-html) is a working real-time todo app, not a
hello-world. `aws-blocks/index.ts` defines:

- **AuthBasic** — username/password sessions, `crossDomain` toggled by
  `BLOCKS_SANDBOX`.
- **DistributedTable** `todos` — Zod schema keyed `{ partitionKey: 'userId',
  sortKey: 'todoId' }`, with `byPriority` and `byTitle` GSIs, and optimistic
  locking via a `version` field + `ifFieldEquals`.
- **Realtime** namespace `todos` — one event schema `{ action:
  'created'|'updated'|'deleted', todoId }` (a single typed event, not three).
- **ApiNamespace** — `subscribeTodos`, `createTodo`, `listTodos(sortBy?)`,
  `toggleTodo`, `updatePriority`, `deleteTodo`. Auth is per-method via
  `await auth.requireAuth(context)`; queries use `Array.fromAsync(todos.query(...))`.

The frontend (`src/`) is lit-html, subscribes to the `todos` namespace, and
reloads on change. Tests live in `test/e2e.test.ts`, run with `npm run test:e2e`.

The scaffolded e2e tests start with a readiness check on
`/.blocks-sandbox/config.json` that does not depend on the sample API, then test
the sample API (`greet`, the todo CRUD, …). When you replace the sample API,
update or delete those sample assertions (they carry a comment saying so); the
readiness check keeps passing either way.

## npm scripts by template

The root `package.json` scripts of a **fresh** Vite template (`default`):

| Script | Purpose |
|--------|---------|
| `dev` / `dev:server` | `tsx watch aws-blocks/scripts/server.ts` (local dev) |
| `build` | `tsc && vite build` (`next build` for the nextjs template) |
| `preview` | `vite preview` |
| `typecheck` | `tsc --noEmit` |
| `spec` | `blocks-generate-spec` |
| `sandbox` | `tsx aws-blocks/scripts/sandbox.ts` |
| `sandbox:destroy` | `tsx -C cdk aws-blocks/scripts/sandbox-destroy.ts` |
| `sandbox:console` | `tsx aws-blocks/scripts/console.ts` |
| `cleanup` | `tsx aws-blocks/scripts/cleanup.ts` |
| `deploy` | `tsx aws-blocks/scripts/deploy.ts` |
| `destroy` | `tsx aws-blocks/scripts/destroy.ts` |
| `test:e2e` | `tsx -C browser test/e2e.test.ts` |
| `vendorize` | `blocks-vendorize` |

A production `destroy` script and `aws-blocks/scripts/destroy.ts` are shipped by
every scaffoldable template — you do not write one by hand. Every template has a
`spec` script (`react` gained it in `create-blocks-app@0.2.0`).

### Detecting a finished deploy (`core@0.6.0`)

On success, `npm run deploy` prints one stable **last line**:

```
BLOCKS_DEPLOYED url=<frontend url> api=<backend url>
```

A backend-only app omits `url=`. `npm run sandbox` prints the same token on
success (always backend-only: `BLOCKS_DEPLOYED api=<backend url>`, since the
sandbox serves the frontend locally). Scripts, CI steps and agents should grep
for `BLOCKS_DEPLOYED` instead of parsing CloudFormation output or polling the
stack. While a deploy runs, the heartbeat names the resource it is waiting on
(e.g. `waiting on HostingDistribution (AWS::CloudFront::Distribution)`), warns
when a resource rolls back, and prints the frontend URL early, so a deploy you
had to kill has still told you where the app lives. The human-readable
`Deployment complete!` lines are unchanged.

## Post-scaffold steps

1. `cd my-app`
2. `npm install` (skipped only if you passed `--skip-install`)
3. `npm run dev`, then open `http://localhost:3000`

See the template's `README.md` and the scaffolded `AGENTS.md` for a feature tour.
