# Extending Blocks with Existing AWS Resources

Adopting Blocks into a **brownfield** AWS account — coexisting with stacks,
resources, and conventions you already own. Four mechanisms, each for a different
situation:

| Pattern | When |
|---------|------|
| **`BlocksBackend` / `BlocksStack`** | Run the Blocks Lambda + API Gateway alongside (or as) your CDK stacks, and wire your own CDK resources to its `.handler` |
| **`fromExisting` on a BB** | Point a Blocks Building Block at a pre-deployed AWS resource — keeps the typed runtime API and mocks, skips provisioning |
| **Custom Building Block** | Author your own BB when no first-party one fits |
| **Vendorize** | Eject a first-party BB's source into `vendor/` and own it (`blocks-vendorize`) |

## Contents

- BlocksStack vs BlocksBackend
- `fromExisting` — adopting pre-deployed resources
- Custom Building Block structure
- Decision matrix

## BlocksStack vs BlocksBackend

Both expose the same `.handler` (the shared Lambda) and `.apiUrl` / `.gateway`.
Both are created by an **async** static factory and imported from
`@aws-blocks/blocks/cdk` (re-exported from `@aws-blocks/core/cdk`).

- **`BlocksStack`** is a whole `cdk.Stack` — greenfield, or Blocks isolated in its
  own deploy unit.
- **`BlocksBackend`** is a `Construct` you drop *into* an existing stack —
  brownfield, Blocks living alongside your other resources.

`BlocksBackendProps` (same core fields as `BlocksStack`):

```typescript
interface BlocksBackendProps {
  backendHandlerPath: string;   // path to index.handler.ts (runtime entry)
  backendCDKPath: string;       // path to index.ts (backend definition, imported at synth)
  defaults: BlocksDefaults;     // required — a posture from BlocksPresets
}
```

`defaults` is **required**. Pass `BlocksPresets.sandbox` or
`BlocksPresets.production` (both from `@aws-blocks/blocks/cdk`); omitting it throws
a clear error at `create()`. `create()` is async because it imports your backend
entry (`backendCDKPath`) to enumerate blocks at synth time.

```typescript
import * as cdk from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { BlocksBackend, BlocksPresets } from '@aws-blocks/blocks/cdk';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

class MyExistingStack extends cdk.Stack {
  public blocks!: BlocksBackend;

  static async build(scope: cdk.App, id: string) {
    const stack = new MyExistingStack(scope, id);
    const queue = new sqs.Queue(stack, 'work-queue');   // a resource you already own

    stack.blocks = await BlocksBackend.create(stack, 'BlocksApi', {
      backendHandlerPath: join(__dirname, 'index.handler.ts'),
      backendCDKPath: join(__dirname, 'index.ts'),
      defaults: BlocksPresets.sandbox,
    });

    // Wire IAM + env on the handler — identical surface to BlocksStack.
    queue.grantSendMessages(stack.blocks.handler);
    stack.blocks.handler.addEnvironment('WORK_QUEUE_URL', queue.queueUrl);
    return stack;
  }
}
```

Greenfield equivalent (`BlocksStack.create(app, 'my-app', { backendHandlerPath, backendCDKPath, defaults })`)
returns a stack whose `.handler` you wire the same way.

## `fromExisting` — adopting pre-deployed resources

Most Building Blocks expose a **`static fromExisting` ref factory** that takes the
resource's physical name/id and returns a small branded ref. You pass that ref as
an option to the **normal constructor** — the block then binds to the pre-existing
resource (granting the runtime Lambda access) instead of provisioning a new one.
It is **not** a standalone constructor:

```typescript
// CORRECT — ref factory feeding the constructor's option
new DistributedTable(scope, 'orders', {
  schema, key,
  table: DistributedTable.fromExisting('prod-orders-table'),
});
```

Because the physical name is passed through at synth, pre-pin it (e.g. set
`tableName` on the resource you own, or read it from an env var) so the runtime
side can reference the same name. `fromExisting` cannot introspect **cross-account**
resources — use the `BlocksBackend`/CDK wiring pattern for those.

### The complete set

| Block (package) | Factory → ref | Constructor option | Import of the ref type |
|---|---|---|---|
| `KVStore` (`bb-kv-store`) | `KVStore.fromExisting(tableName: string): ExternalTableRef` | `table` | `ExternalTableRef` |
| `DistributedTable` (`bb-distributed-table`) | `DistributedTable.fromExisting(tableName: string): ExternalTableRef` | `table` | `ExternalTableRef` |
| `DistributedTable` (KMS) | `DistributedTable.fromKmsKey(keyArn: string): ExternalKmsKeyRef` | `encryption` | `ExternalKmsKeyRef` |
| `FileBucket` (`bb-file-bucket`) | `FileBucket.fromExisting(bucketName: string): ExternalBucketRef` | `bucket` | `ExternalBucketRef` |
| `AuthCognito` (`bb-auth-cognito`) | `AuthCognito.fromExisting(userPoolId: string, clientId?: string): ExternalUserPoolRef` | `userPool` | `ExternalUserPoolRef` |
| `Database` (`bb-data`) | `Database.fromExisting(config): ExternalDatabaseRef` (also the standalone `fromExisting` export) | `connection` | `ExternalDatabaseRef` |

Notes on the ones that differ:

- **`AuthCognito`** — the second argument is `clientId` (**not** `userPoolClientId`).
  Both fields live on the returned `ExternalUserPoolRef`; pass the ref as
  `userPool` in `AuthCognitoOptions`.
- **`Database`** — `fromExisting` is an **identity** helper: `ExternalDatabaseRef`
  is either `{ host, port?, database, secretArn }` or
  `{ connectionString, ssl? }`. Pass the result as the `connection` option.
  `migrationsPath` cannot be combined with a `fromExisting` database (synth throws),
  and the `bb-data` CLI's migrate/status/generate-types refuse on an external DB.
- **`AppSetting`** (`bb-app-setting`) is the exception — its `fromExisting` is a
  **full constructor**, not a ref factory:
  `AppSetting.fromExisting(scope, id, { name, secret? }): AppSetting<T>`. It builds
  and returns the block bound to a pre-existing SSM parameter.

```typescript
// Two more examples
new FileBucket(scope, 'uploads', { bucket: FileBucket.fromExisting('my-uploads-prod') });

new AuthCognito(scope, 'auth', {
  userPool: AuthCognito.fromExisting('us-east-1_AbCdEfG', '1234567890abcdef'),
});
```

## Custom Building Block structure

A custom block wraps any service (AWS or not) with the same local-first DX as a
first-party block. Each layer is a separate file selected by **conditional
exports** in `package.json`, and the class **extends `Scope`** in each layer:

```jsonc
// package.json — condition order matters; "default" = the mock layer
{
  "type": "module",
  "exports": {
    ".": {
      "browser": "./dist/index.browser.js",
      "cdk": { "types": "./dist/index.cdk.d.ts", "default": "./dist/index.cdk.js" },
      "aws-runtime": "./dist/index.aws.js",
      "types": "./dist/index.mock.d.ts",
      "default": "./dist/index.mock.js"
    }
  }
}
```

| Condition | File | Runs in | Purpose |
|---|---|---|---|
| `default` | `index.mock.ts` | local dev server | in-memory/filesystem fake, no AWS |
| `aws-runtime` | `index.aws.ts` | Lambda runtime | real AWS SDK / API calls |
| `cdk` | `index.cdk.ts` | CDK synth | provisions infra, grants IAM, injects env |
| `browser` | `index.browser.ts` | frontend bundle | type-only re-exports / stub |

Shared interfaces live in `types.ts` (zero runtime deps) so every layer imports
identical option/result types.

### Key rules

- **Every layer's class extends `Scope`** and exports the **same public class name
  and methods**. In the CDK layer import `Scope` (and `synthGuard`) from
  `@aws-blocks/core/cdk`; in the runtime/mock layers import `Scope` (and
  `ScopeParent`) from `@aws-blocks/core`. `getMockDataDir` is imported from
  `@aws-blocks/core/bb-utils`.
- `Scope` gives you `this.handler` (the shared Lambda), `this.fullId`, and CDK tree
  integration. In `index.cdk.ts`, call `this.handler.addToRolePolicy(...)` to grant
  permissions and `this.handler.addEnvironment(key, value)` to inject config the
  runtime reads. Convention: `BLOCKS_${fullId}_*`.
- **Stub runtime methods in the CDK layer with `synthGuard(blockName, methodName)`**
  — it throws a clear error if a runtime method is called during synth.
- **`getMockDataDir(this)`** resolves to `<cwd>/.bb-data/{fullId}/` for mock
  persistence (deterministic, offline).
- **No-op layers are valid** — export `{}` (or type-only re-exports for `browser`)
  for layers you don't need.
- Wire it in as a workspace dependency (`"my-block": "workspace:*"`) and use it in
  `aws-blocks/index.ts` like any other block.

> The upstream `docs/reference/building-block-structure.md` describes an older
> `materialize`-function model (`index.ts` / `infra.ts` / `mock.ts` /
> `client-hook.ts`). First-party BBs and the `test-apps/extending-blocks-guide`
> custom `bb-queue` use the conditional-export + `Scope`-subclass model above; that
> is the current shape.

## Decision matrix

| Scenario | Approach |
|----------|----------|
| New CDK resources feeding Blocks, in your existing stack | **BlocksBackend** — drop the Construct in and wire `.handler` |
| Blocks in its own stack (greenfield) | **BlocksStack** |
| Use a table / bucket / pool / DB owned by another team or stack | **`fromExisting`** on the matching BB |
| Service with no first-party BB (e.g. SQS, ElastiCache) | **Custom Building Block**, or raw CDK wired to `.handler` for a one-off |
| Own a first-party BB's source outright | **Vendorize** (`blocks-vendorize`) |
| Gradual CDK→Blocks migration | **BlocksBackend + `fromExisting`** — bind existing resources, retire old handlers as traffic shifts |
