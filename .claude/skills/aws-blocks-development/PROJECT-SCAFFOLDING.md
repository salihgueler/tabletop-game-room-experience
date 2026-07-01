# Project Scaffolding

## Contents
1. [Create a New Project](#create-a-new-project)
2. [Available Templates](#available-templates)
3. [Add to Existing Project](#add-to-existing-project)
4. [Amplify Gen 2 Integration](#amplify-gen-2-integration)
5. [Stack & Sandbox IDs](#stack--sandbox-ids)
6. [Post-Scaffold Steps](#post-scaffold-steps)
7. [Scaffolder Warnings](#scaffolder-warnings)
8. [Project Structure](#project-structure)
9. [config.ts Options](#configts-options)

## Create a New Project

    npm create @aws-blocks/blocks-app@latest my-app

Interactive mode prompts for template selection. To skip:

    npm create @aws-blocks/blocks-app@latest my-app -- --template nextjs

## Available Templates

| Template | Use When… |
|----------|-----------|
| **amplify** | Full-stack app with Amplify auth, data, and hosting pre-wired |
| **auth-cognito** | You only need Cognito-based authentication (no data layer) |
| **backend** | Headless API/backend service without a frontend |
| **bare** | Absolute minimum — just `aws-blocks/` with an empty entry point |
| **default** | General-purpose starter with API + auth + simple frontend |
| **demo** | Showcasing Blocks features (multiple API routes + sample UI) |
| **nextjs** | Full-stack Next.js app with SSR-compatible Blocks integration |
| **react** | Client-side React (Vite) app calling a Blocks backend |

## Add to Existing Project

Use the `--template` flag with `.` as the path to add Blocks to an existing project:

```bash
# Add blocks to existing Next.js project
npm create @aws-blocks/blocks-app . -- --template nextjs
```

```bash
# Add blocks to existing React/Vite project
npm create @aws-blocks/blocks-app . -- --template react
```

For non-Amplify projects without a specific template, run without a template flag:

```bash
npx @aws-blocks/create-blocks-app
```

Adds `aws-blocks/` and updates your `package.json` scripts without pulling in a full template.

## Amplify Gen 2 Integration

Already have an Amplify Gen 2 project with `amplify/backend.ts`? Run from root:

```bash
npx @aws-blocks/create-blocks-app .
```

This mode detects your Amplify project and leaves existing auth/data/hosting untouched. It adds an `aws-blocks/` workspace, wires bearer-token auth between Amplify Cognito and Blocks APIs, and scaffolds npm scripts (`dev`, `build`, `deploy`, `destroy`).

## Stack & Sandbox IDs

Stack names are derived from `stackId` in `.blocks/config.json`:

```typescript
import { getStackId, getSandboxId } from '@aws-blocks/blocks/scripts';

// Stack names derived from stackId in .blocks/config.json
// Production: <stackId>-prod
// Sandbox: <stackId>-<username(8)>-<random(6)>
```

Use `getStackId()` to retrieve the configured stack identifier. Use `getSandboxId()` to get the full sandbox stack name (includes username prefix and random suffix for isolation).

## Post-Scaffold Steps

1. **Rename** the `name` field in the root `package.json` to your project name.
2. Run `npm install`
3. Run `npm run dev`

## Scaffolder Warnings

> ⚠️ The scaffolder **overwrites** these root files if they already exist:
> `package.json` (merges scripts but resets other fields), `tsconfig.json`, `vite.config.ts`, `.gitignore`.
> Commit or stash changes before running the scaffolder on an existing repo.

## Project Structure

```
my-app/
├── aws-blocks/
│   ├── index.ts        # Foundation layer entry point (APIs, auth)
│   ├── config.ts       # Compute, local dev, deployment settings
│   └── package.json    # Foundation layer dependencies
├── src/                # Frontend / application code
├── package.json        # Root scripts: dev, build, deploy, destroy
├── tsconfig.json
└── vite.config.ts      # (React/default templates)
```

## config.ts Options

### Compute

```typescript
export default {
  compute: {
    type: 'lambda',        // 'lambda' | 'fargate' | 'ec2'
    runtime: 'nodejs20.x',
    memory: 1024,          // MB
    timeout: 30,           // seconds
    environment: { NODE_ENV: 'production' }
  }
};
```

### Local Development

```typescript
export default {
  local: {
    port: 3001,
    hotReload: true,
    mockServices: true,    // local mocks vs real AWS
    cors: { origin: 'http://localhost:3000' }
  }
};
```

### Deployment

```typescript
export default {
  deployment: {
    region: 'us-east-1',
    stackName: 'my-app',
    profile: 'default',
    tags: { Environment: 'dev', Project: 'my-app' }
  }
};
```
