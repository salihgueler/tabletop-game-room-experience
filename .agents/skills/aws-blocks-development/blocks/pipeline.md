# Pipeline

Self-mutating CI/CD for a Blocks app: **one CodePipeline V2 per git branch**,
each pulling source from GitHub via CodeConnections, running `cdk synth`, and
deploying through its own ordered stages.

**Use it for** automated multi-stage deployment (beta → prod), manual approval
gates, cross-account deploys, and monorepo path-filtered triggers.

**Don't use it for** background work (AsyncJob), scheduled work (CronJob), or
request/response APIs (ApiNamespace). Pipeline is CDK-only — there is no local
mock and no runtime API.

## Contents

- Import and minimal example
- `PipelineProps`
- Populating stages: `stageFactory` vs `appFile`
- `source` — repo and CodeConnections
- `synth` — build environment
- Stage options — approval, bake time, per-stage config
- Cross-account and multi-branch
- Async factories: `Pipeline.create()`
- Validation errors and what they mean
- What it provisions

## Import and minimal example

```typescript
import { Pipeline } from '@aws-blocks/pipeline';
// also re-exported from '@aws-blocks/blocks/cdk'
import { App, Stack } from 'aws-cdk-lib';

const app = new App();
const stack = new Stack(app, 'PipelineStack', { env: { region: 'us-east-1' } });

new Pipeline(stack, 'Pipeline', {
  source: {
    repo: 'my-org/my-app',                                    // "owner/repo"
    connectionArn: 'arn:aws:codeconnections:us-east-1:123456789012:connection/abc',
  },
  branches: [
    {
      branch: 'main',
      stages: [
        { name: 'beta' },
        { name: 'prod', requireApproval: true },
      ],
    },
  ],
  stageFactory: (scope, stageConfig) => {
    new MyAppStack(scope, 'App', { env: stageConfig.env });
  },
});
```

Three things are mandatory and easy to miss: `branches` (stages live *inside* a
branch, never at the top level), one of `stageFactory` / `appFile`, and a
CodeConnections connection that has completed its OAuth handshake.

## `PipelineProps`

```typescript
interface PipelineProps<TConfig = Record<string, unknown>> {
  source: PipelineSourceConfig;              // required
  branches: BranchConfig<TConfig>[];         // required, non-empty
  stageFactory?: (scope: cdk.Stage, stageConfig: PipelineStageConfig<TConfig>) => void | Promise<void>;
  appFile?: string;                          // mutually exclusive with stageFactory
  synth?: PipelineSynthConfig;
  selfMutation?: boolean;                    // default true
  crossAccountKeys?: boolean;                // default false; required for cross-account
}
```

There is no top-level `stages` prop and no `PipelineConfig` type.

## Populating stages: `stageFactory` vs `appFile`

Stages start empty. Exactly one of these must fill them, or synth throws.

**`stageFactory`** — imperative. Called once per stage across all branches, and
receives the whole stage config, so `env` and your own `config` are available:

```typescript
stageFactory: (scope, stageConfig) => {
  new MyAppStack(scope, 'App', {
    stackName: `my-app-${stageConfig.name}`,
    env: stageConfig.env,
    domain: stageConfig.config?.domain,
  });
},
```

**`appFile`** — declarative, and the right choice for a normal Blocks app. The
pipeline dynamically imports the file once per stage with the active CDK Stage
published on `globalThis`, so `BlocksStack.create()` attaches itself to the
correct stage automatically:

```typescript
appFile: './index.cdk.ts',   // resolved relative to THIS file, not the CWD
```

`appFile` requires **async resolution** — it must be used with
`await Pipeline.create(...)`. The **synchronous** `new Pipeline(...)` constructor
**throws** when given `appFile` without a `stageFactory` (message: "``appFile``
requires async resolution — use ``await Pipeline.create(...)`` instead of
``new Pipeline(...)``"). For the sync constructor, provide a `stageFactory`
instead. (See "Async factories" below.)

Each stage's `environment` vars are set on `process.env` before the import and
cleaned up after, which is how you vary synth-time config per stage.

Read the ambient scope directly only if you are writing a construct that needs it:

```typescript
import { __PIPELINE_STAGE_SCOPE__ } from '@aws-blocks/pipeline';
const stageScope = (globalThis as any)[__PIPELINE_STAGE_SCOPE__];
```

The constant's value equals its name — the double underscores are part of the
key, not a typo.

> **Security:** `appFile` is imported and executed during synth. It must come
> from your own pipeline definition. Never wire it from an env var, build arg, or
> any external input. Only `.ts` / `.js` / `.mjs` / `.cjs` are accepted, and the
> resolved path is checked to stay inside the project root.

## `source` — repo and CodeConnections

```typescript
interface PipelineSourceConfig {
  repo: string;                // "owner/repo" — must contain a slash
  connectionArn: string;       // arn:aws:codeconnections:<region>:<account>:connection/<id>
  triggerOnPush?: boolean;     // default true
  triggerFilters?: string[];   // monorepo path filters, e.g. ['packages/backend/**']
}
```

There is no `owner` field and no `branch` field here — the branch belongs to each
`BranchConfig`.

**The connection needs a one-time manual step.** Creating the connection (Console,
CLI, or CDK) leaves it `PENDING`. Go to **Developer Tools → Connections**, select
it, click *Update pending connection*, authorize the GitHub app and pick the
repo/org. It becomes `AVAILABLE` and only then can the pipeline pull source. This
cannot be automated, so it blocks first deploys and any real end-to-end test.

`triggerOnPush` and `triggerFilters` are mutually exclusive — CodePipeline uses
filters instead of push triggers when filters are set, and passing both throws.

## `synth` — build environment

All optional; the defaults suit a standard Blocks app.

```typescript
interface PipelineSynthConfig {
  commands?: string[];                    // default ['npm ci', 'npx cdk synth']
  installCommands?: string[];             // default [] — install phase, runs first
  buildImage?: codebuild.IBuildImage;     // default LinuxBuildImage.AMAZON_LINUX_2023_5
  env?: Record<string, string>;
  primaryOutputDirectory?: string;        // default 'cdk.out'
  dockerEnabled?: boolean;                // default false
  computeType?: codebuild.ComputeType;    // default MEDIUM (4 vCPU / 7 GB)
  partialBuildSpec?: codebuild.BuildSpec | null;
}
```

Reach for these in specific situations:

- **Monorepo** — `primaryOutputDirectory: 'packages/infra/cdk.out'`.
- **Docker image assets** (Lambda container images, ECS Dockerfile builds) —
  `dockerEnabled: true`, or the asset build fails.
- **OOM during synth/bundling** (CodeBuild exit code 137) —
  `computeType: ComputeType.LARGE` (8 vCPU / 15 GB).
- **A different Node version** — `partialBuildSpec` has three behaviors:
  omitted pins Node 22; a `BuildSpec` replaces that default; `null` opts out
  entirely so you can install your own (`installCommands: ['n 20']`).

`NODE_OPTIONS` is automatically prefixed with `--conditions=cdk` (required for the
package's ESM conditional exports); anything you set in `env.NODE_OPTIONS` is
appended after it.

## Stage options

```typescript
interface PipelineStageConfig<TConfig> {
  name: string;                       // CDK Stage construct id; unique within a branch
  env?: cdk.Environment;              // target account/region; defaults to the pipeline's own
  requireApproval?: boolean;          // default false
  approvalComment?: string;
  bakeTime?: cdk.Duration;            // must be positive
  config?: TConfig;                   // your own per-stage settings, passed to stageFactory
  environment?: Record<string, string>;  // synth-time process.env, appFile only
}
```

Two distinctions that matter:

- `config` is passed to `stageFactory`; `environment` is set on `process.env` for
  an `appFile` import. They serve the two different population strategies.
- `bakeTime` is implemented as a CodeBuild `sleep` step, so you pay for the wait
  (~$0.005/min) and the step carries a `bakeTime + 10min` timeout. For anything
  long, prefer `requireApproval: true` with external alerting.

## Cross-account and multi-branch

Each `branches` entry becomes a **separate CodePipeline**, so one repo can drive
several independent release flows:

```typescript
branches: [
  { branch: 'main',    stages: [{ name: 'beta' }, { name: 'prod', requireApproval: true }] },
  { branch: 'develop', stages: [{ name: 'alpha', config: { domain: 'alpha.myapp.com' } }] },
],
```

Deploying a stage into a different account requires `crossAccountKeys: true` —
the construct detects the mismatch and throws otherwise. It creates a KMS key
(~$1/month) for artifact encryption.

`branch` names are sanitized to alphanumerics and hyphens to build construct IDs,
so two branches that collapse to the same ID (`feat/a` and `feat-a`) are rejected.

## Async factories: `Pipeline.create()`

`BlocksStack.create()` is async. A `stageFactory` that awaits it cannot run under
the synchronous constructor — `new Pipeline()` detects the returned promise and
throws. Use the static factory so every stage resolves before synth:

```typescript
await Pipeline.create(stack, 'Pipeline', {
  source: { repo: 'my-org/my-app', connectionArn },
  branches: [{ branch: 'main', stages: [{ name: 'prod' }] }],
  stageFactory: async (scope, stageConfig) => {
    await BlocksStack.create(scope, 'App', { env: stageConfig.env });
  },
});
```

`Pipeline.create()` is also more forgiving: with neither `stageFactory` nor
`appFile` it defaults `appFile` to `'./index.cdk.ts'`. The sync constructor
requires one explicitly.

## Validation errors and what they mean

These throw at synth time, so you see them from `cdk synth` / `npm run deploy`,
not at runtime. All are real messages from the construct.

| Message | Cause |
|---|---|
| `` `stageFactory` and `appFile` are mutually exclusive `` | Both provided — pick one |
| `` either `stageFactory` or `appFile` must be provided `` | Neither provided to `new Pipeline()`; use `Pipeline.create()` to default to `./index.cdk.ts` |
| `async stageFactory detected in sync constructor` | Your factory returns a promise — use `Pipeline.create()` |
| `` `branches` must not be empty `` | `branches: []` |
| `branch "X" has an empty \`stages\` array` | A branch with no stages |
| `` `repo` must be in "owner/repo" format `` | Missing the slash |
| `` `connectionArn` must be a valid CodeConnections ARN `` | Wrong ARN shape. Legacy `codestar-connections` is accepted; partitions `aws`, `aws-us-gov`, `aws-cn` |
| `duplicate branch name "X"` / `duplicate stage name "X" in branch "Y"` | Names must be unique (stages within their branch) |
| `branch 'X' produces duplicate ID 'Y'` | Two branches collide after sanitization |
| `crossAccountKeys must be true when deploying to different accounts` | A stage `env.account` differs from the pipeline's |
| `bakeTime for stage 'X' must be positive` | Zero or negative duration |

## What it provisions

Per branch: one CodePipeline V2, a CodeConnections source action, a CodeBuild
synth project, a self-mutation stage (unless `selfMutation: false`), and
CloudFormation deploy actions per stage — plus manual-approval actions and
CodeBuild sleep steps where configured, an artifact bucket, IAM roles, and a
cross-account KMS key when `crossAccountKeys` is enabled.

Also exported: `DeployStage` and `DeployStageProps` (a `cdk.Stage` subclass
carrying the stage config) — you rarely construct these yourself; the pipeline
does it per stage.
