# Pipeline

CDK CI/CD pipeline construct for deploying AWS Blocks applications via CodePipeline.

**Package:** `@aws-blocks/pipeline` (also re-exported from `@aws-blocks/blocks/cdk` for backward compatibility)

```typescript
import { Pipeline } from '@aws-blocks/pipeline';
// OR via umbrella re-export:
import { Pipeline } from '@aws-blocks/blocks/cdk';
```

**When to use:** Automated multi-stage deployments of your Blocks app via AWS CodePipeline. Handles source, build, and deploy stages with proper CDK synthesis.

```typescript
import { Pipeline } from '@aws-blocks/pipeline';
import { App } from 'aws-cdk-lib';

const app = new App();

new Pipeline(app, 'MyPipeline', {
  source: {
    owner: 'my-org',
    repo: 'my-app',
    branch: 'main',
    connectionArn: 'arn:aws:codestar-connections:...',
  },
  synth: {
    commands: ['npm ci', 'npm run build', 'npx cdk synth'],
    partialBuildSpec: {
      phases: {
        install: {
          'runtime-versions': { nodejs: 22 },
        },
      },
    },
  },
});
```

**PipelineConfig:**
- `source` — CodeStar connection to GitHub/Bitbucket/GitLab
- `synth` — `PipelineSynthConfig` with build commands and optional `partialBuildSpec`
- `stages` — deployment stage definitions

**PipelineSynthConfig:**
- `commands` — build/synth commands
- `partialBuildSpec` — partial CodeBuild BuildSpec merged with defaults (Node.js 22 runtime by default)
- `installCommands` — pre-build install commands

**Constants:**
- `PIPELINE_STAGE_SCOPE` — exported constant for referencing the pipeline stage scope

**Notes:**
- Extracted from `@aws-blocks/core` into dedicated `@aws-blocks/pipeline` package
- `@aws-blocks/core` (and `@aws-blocks/blocks/cdk`) re-exports everything — zero consumer breakage
- `partialBuildSpec` defaults to Node.js 22 runtime
- Real-deploy e2e requires a GitHub CodeConnections OAuth handshake (manual setup)
- `_sourceOverride` internal prop available for S3-source-based testing

Local mock: N/A (CDK-only construct). AWS: CodePipeline + CodeBuild + CloudFormation.
