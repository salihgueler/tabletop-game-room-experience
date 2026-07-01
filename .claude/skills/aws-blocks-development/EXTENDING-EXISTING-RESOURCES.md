# Extending with Existing AWS Resources

## Contents
- [BlocksBackend — Brownfield CDK Integration](#blocksbackend--brownfield-cdk-integration)
- [fromExisting() — Wrapping Pre-Deployed Resources](#fromexisting--wrapping-pre-deployed-resources)
- [Custom Building Block Authoring](#custom-building-block-authoring)
- [Decision Matrix](#decision-matrix)
- [Migration Patterns](#migration-patterns)

## BlocksBackend — Brownfield CDK Integration

Drop Blocks into an existing CDK stack without replacing your infrastructure:

```typescript
import { BlocksBackend } from '@aws-blocks/blocks/cdk';
import { Stack } from 'aws-cdk-lib';
import { Scope } from '@aws-blocks/blocks';

const stack = new Stack(app, 'MyExistingStack');
const backend = new BlocksBackend(stack, 'Blocks', {
  scope: new Scope('my-app'),
});
// Existing constructs continue to work alongside
const existingBucket = new s3.Bucket(stack, 'LegacyBucket');
```

`BlocksBackend` synthesizes all Building Blocks as CDK constructs **within your stack**, sharing the same deploy/destroy lifecycle.

## fromExisting() — Wrapping Pre-Deployed Resources

Reference pre-deployed AWS resources without Blocks managing their lifecycle:

```typescript
const orders = DistributedTable.fromExisting(scope, 'orders', {
  tableName: 'prod-orders-table',
  partitionKey: 'orderId',
  sortKey: 'timestamp',
});
const uploads = FileBucket.fromExisting(scope, 'uploads', {
  bucketName: 'my-company-uploads-prod',
});
const auth = AuthCognito.fromExisting(scope, 'auth', {
  userPoolId: 'us-east-1_AbCdEfG',
  userPoolClientId: '1234567890abcdef',
});
```

Provides the same typed runtime API (read/write/query) without creating the resource. CDK emits an `import` — no accidental deletions.

## Custom Building Block Authoring

Custom blocks let you wrap any service (AWS or not) with the same local-first DX as built-in blocks. Every Building Block **extends `Scope`** (from `@aws-blocks/core/cdk` in the CDK layer) and uses **4 files** mapped via conditional exports in `package.json`:

```json
{
  "exports": {
    ".": {
      "cdk": "./dist/cdk.js",
      "browser": "./dist/browser.js",
      "aws-runtime": "./dist/aws.js",
      "default": "./dist/mock.js"
    }
  }
}
```

| Export Condition | Runs In | Purpose |
|--------|---------|---------| 
| `default` | Local dev server | In-memory/filesystem fake — no AWS needed |
| `aws-runtime` | Lambda runtime | Real AWS SDK calls |
| `cdk` | CDK synth | Emits CloudFormation resources |
| `browser` | Frontend bundle | Typed stub for RPC |

### File Structure

```
custom-blocks/my-block/
├── package.json       # name, conditional exports, "type": "module"
├── tsconfig.json      # Extends root config
├── src/
│   ├── types.ts       # Shared interfaces (zero runtime deps)
│   ├── errors.ts      # Error class (optional)
│   ├── index.mock.ts  # Local implementation (default export)
│   ├── index.ts       # Production implementation (aws-runtime)
│   ├── index.cdk.ts   # CDK layer: extends Scope, provisions infra
│   └── browser.ts     # Type-only re-exports for frontend
└── dist/              # Built output
```

### Step 1 — Shared Types (`types.ts`)

Define interfaces shared across all layers. Zero runtime dependencies — types only:

```typescript
// src/types.ts
export interface MyBlockOptions {
  timeout?: number;
}

export interface MyBlockResult {
  data: string;
  cached: boolean;
}
```

### Step 2 — Mock Layer (`index.mock.ts`)

Local-first implementation using `getMockDataDir()`. Must export the **same public class name and methods** as `index.ts`:

```typescript
// src/index.mock.ts — runs during local dev, no network needed
import { Scope, getMockDataDir } from '@aws-blocks/blocks';
import type { ScopeParent } from '@aws-blocks/core';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { MyBlockOptions, MyBlockResult } from './types.js';

export class MyBlock extends Scope {
  private dataDir: string;

  constructor(scope: ScopeParent, id: string, options?: MyBlockOptions) {
    super(id, { parent: scope });
    this.dataDir = getMockDataDir(this);
  }

  async query(input: string): Promise<MyBlockResult> {
    // Filesystem/in-memory fake — deterministic, fast, offline
    const cachePath = join(this.dataDir, `${input}.json`);
    if (existsSync(cachePath)) {
      return { data: readFileSync(cachePath, 'utf-8'), cached: true };
    }
    return { data: `mock-result-for-${input}`, cached: false };
  }
}
```

### Step 3 — Production Layer (`index.ts`)

Real implementation using AWS SDK or external APIs. Reads resource identifiers from `process.env` (injected by CDK layer):

```typescript
// src/index.ts — runs in Lambda
import { Scope } from '@aws-blocks/core';
import type { ScopeParent } from '@aws-blocks/core';
import type { MyBlockOptions, MyBlockResult } from './types.js';

export class MyBlock extends Scope {
  constructor(scope: ScopeParent, id: string, private options?: MyBlockOptions) {
    super(id, { parent: scope });
  }

  async query(input: string): Promise<MyBlockResult> {
    const apiKey = process.env[`BLOCKS_${this.fullId.toUpperCase()}_API_KEY`];
    const res = await fetch(`https://api.example.com/query?q=${input}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return await res.json();
  }
}
```

### Step 4 — CDK Layer (`index.cdk.ts`)

**Extends `Scope`** from `@aws-blocks/core/cdk`. Gets `this.handler` (the Lambda function) automatically. Provisions resources and grants permissions:

```typescript
// src/index.cdk.ts — runs during CDK synth
import { Scope, synthGuard } from '@aws-blocks/core/cdk';
import type { ScopeParent } from '@aws-blocks/core';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import type { MyBlockOptions } from './types.js';

// Re-export types for consumers
export type { MyBlockOptions, MyBlockResult } from './types.js';

export class MyBlock extends Scope {
  constructor(scope: ScopeParent, id: string, options?: MyBlockOptions) {
    super(id, { parent: scope });

    // Grant Lambda permissions (this.handler comes from Scope)
    this.handler.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['execute-api:Invoke'], // whatever your block needs
      resources: ['*'],
    }));

    // Inject env vars the runtime reads
    this.handler.addEnvironment(
      `BLOCKS_${this.fullId.toUpperCase()}_API_KEY`,
      options?.apiKey ?? ''
    );
  }

  // Runtime methods are NOT available during CDK synth.
  // synthGuard() throws a clear error if called at synth time.
  query(..._args: unknown[]): never { return synthGuard('MyBlock', 'query'); }
}
```

**Key points:**
- `extends Scope` — gives you `this.handler`, `this.fullId`, CDK construct tree integration
- `this.handler.addToRolePolicy(...)` — grant Lambda permissions
- `this.handler.addEnvironment(key, value)` — inject config the runtime reads
- `synthGuard(blockName, methodName)` — throws a clear error if runtime methods are called during synth
- `this.fullId` — unique scoped ID (e.g. `"my-app.my-block"`) for naming resources

### Step 5 — Browser Layer (`browser.ts`)

Type-only re-exports (or empty export). No runtime code ships to the browser:

```typescript
// src/browser.ts — type re-exports only
export type { MyBlock } from './index.mock.js';
```

### Step 6 — Wire into Your App

Add the custom block as a workspace dependency:

```json
// Root package.json
{
  "workspaces": ["aws-blocks", "custom-blocks/my-block"],
  "type": "module"
}

// aws-blocks/package.json
{ "dependencies": { "my-block": "workspace:*" } }
```

Use in `aws-blocks/index.ts`:

```typescript
import { MyBlock } from 'my-block';
const myBlock = new MyBlock(scope, 'service', { timeout: 5000, apiKey: '...' });

export const api = new ApiNamespace(scope, 'api', (context) => ({
  async search(query: string) {
    return myBlock.query(query);
  },
}));
```

### Key Rules

- **All layers extend `Scope`** — gives CDK tree integration, `this.handler`, `this.fullId`
- **Same public interface** — `index.mock.ts` and `index.ts` must export identical class name and methods
- **`synthGuard()` in CDK** — stub runtime methods that throw clear errors if called at synth time
- **`getMockDataDir(this)`** — use for mock persistence (resolves to `.bb-data/{fullId}/`)
- **Non-AWS providers are fine** — wrap Google Maps, Stripe, any external API
- **No-op is valid** — export `{}` for layers you don't need (e.g. `browser.ts`)
- **Env var convention** — `BLOCKS_${fullId}_*` prefix for injected config

## Decision Matrix

| Scenario | Approach |
|----------|----------|
| New features on existing CDK stack | **BlocksBackend** — manages new resources inside your stack |
| Use a table/bucket owned by another team | **fromExisting()** — typed access, no ownership |
| Greenfield app | **Scope** alone via `create-blocks-app` |
| Service Blocks doesn't cover (ElastiCache) | **Custom Building Block** — write 4 exports |
| Shared resource across multiple apps | **fromExisting()** — reference by name/ARN |
| Gradual CDK→Blocks migration | **BlocksBackend + fromExisting()** combined |

## Migration Patterns

### Pattern 1: Side-by-Side (Incremental)

```typescript
const stack = new Stack(app, 'ProdStack');
const legacyTable = new dynamodb.Table(stack, 'Users', { /* ... */ });
const backend = new BlocksBackend(stack, 'BlocksLayer', { scope: new Scope('migration') });
const users = DistributedTable.fromExisting(backend.scope, 'users', {
  tableName: legacyTable.tableName, partitionKey: 'userId',
});
```

### Pattern 2: API-First Route Migration

```typescript
export const api = new ApiNamespace(scope, 'api', (ctx) => ({
  // Phase 1: New endpoints use fromExisting resources
  async getUser(id: string) { return users.get({ userId: id }); },
  // Phase 2: Retire old Lambda handlers as traffic shifts
  // Phase 3: Replace fromExisting with native Building Blocks
}));
```

### Pattern 3: Wrap Internal Services as Blocks

```typescript
// mock.ts — canned responses for local dev
export class PaymentService {
  async charge(amount: number) { return { status: 'ok', txId: 'mock-123' }; }
}
// aws.ts — real call
export class PaymentService {
  async charge(amount: number, currency: string) {
    return fetch(`${process.env.PAYMENT_URL}/charge`, {
      method: 'POST', body: JSON.stringify({ amount, currency }),
    }).then(r => r.json());
  }
}
```

Typed, mockable access to internal services with zero deployment coupling.
