# Extending Blocks with Existing AWS Resources

Adopting Blocks into a **brownfield** AWS account — coexisting with stacks,
resources, and conventions you already own. Four mechanisms, each for a different
situation:

| Pattern | When |
|---------|------|
| **`BlocksBackend` / `BlocksStack`** | Run the Blocks Lambda + API Gateway alongside (or as) your CDK stacks, and wire your own CDK resources to its `executionRole` |
| **`fromExisting` on a BB** | Point a Blocks Building Block at a pre-deployed AWS resource — keeps the typed runtime API and mocks, skips provisioning |
| **Custom Building Block** | Author your own BB when no first-party one fits |
| **Vendorize** | Eject a first-party BB's source into `vendor/` and own it (`blocks-vendorize`) |

## Contents

- BlocksStack vs BlocksBackend
- Wiring your own resources (`executionRole`, `registerConfig`)
- `fromExisting` — adopting pre-deployed resources
- Custom Building Block structure
- Decision matrix

## BlocksStack vs BlocksBackend

Both expose the same `executionRole` (the shared role every Blocks compute
assumes) and `apiUrl` / `publicApiUrl` / `gateway`. Both are created by an
**async** static factory and imported from `@aws-blocks/blocks/cdk` (re-exported
from `@aws-blocks/core/cdk`).

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
import { BlocksBackend, BlocksPresets, registerConfig } from '@aws-blocks/blocks/cdk';
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

    // Wire IAM + config — identical surface to BlocksStack.
    queue.grantSendMessages(stack.blocks.executionRole);
    registerConfig(stack.blocks, 'WORK_QUEUE_URL', queue.queueUrl);
    return stack;
  }
}
```

Greenfield equivalent (`BlocksStack.create(app, 'my-app', { backendHandlerPath, backendCDKPath, defaults })`)
returns a stack you wire the same way.

## Wiring your own resources (`executionRole`, `registerConfig`)

`BlocksStack.handler`, `BlocksBackend.handler` and `Scope.handler` were
**removed in `0.8.0`**. They returned the *default* compute's Lambda, so
anything wired through them reached only that one function rather than every
compute the app runs on. Use the stack-wide equivalents, which reach all of
them:

| Removed in `0.8.0` | Use instead |
|---|---|
| `blocksStack.handler.addEnvironment('KEY', value)` | `registerConfig(blocksStack, 'KEY', value)` |
| `resource.grantRead(blocksStack.handler)` | `resource.grantRead(blocksStack.executionRole)` |
| `blocksStack.handler.addToRolePolicy(statement)` | `blocksStack.executionRole.addToPrincipalPolicy(statement)` |
| `this.handler` inside a custom Building Block | `this.executionRole` / `registerConfig(this, …)` |
| `handler.addEnvironment('CORS_ALLOWED_ORIGINS', …)` | `defaults: { ...BlocksPresets.production, allowedOrigins: [...] }` |

Both `registerConfig` and `executionRole` come from `@aws-blocks/blocks/cdk`
(and `@aws-blocks/core/cdk`). `registerConfig` can be called from a Building
Block constructor or from app code after `create()` resolves.

**Precedence differs from `addEnvironment`.** `addEnvironment` wrote a real
Lambda environment variable, so the last call won. `registerConfig` entries are
serialized to a JSON config object in S3 and loaded into `process.env` at cold
start **only for keys that are not already set** — so a real environment
variable of the same name always wins, including one the framework sets itself
(`NODE_ENV`, `BLOCKS_STACK_NAME`). When that happens with a differing value the
compute logs a warning at cold start naming the ignored keys (names only, never
values). The S3 indirection is also what sidesteps Lambda's ~4 KB env limit.

Config is plain JSON in a private bucket, so it is not a secret store: use
`Secret` (or `AppSetting` with `secret: true` for a low-value secret).

**`LambdaCompute.apiGateway` and `LambdaCompute.apiUrl` are gone too.** A
single shared REST API is now built once at the stack level and fronts the
default compute, instead of each compute owning a gateway. Read `gateway`,
`apiUrl` and `publicApiUrl` off the `BlocksStack` / `BlocksBackend`. Existing
deployments keep their REST API and `execute-api` URL: the shared gateway is
built in the default compute's construct scope under the same construct ids, so
the synthesized logical IDs are unchanged.

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
| `DistributedTable` (KMS) | `DistributedTable.fromKmsKey(keyArn: string): ExternalKmsKeyRef` | `encryption` | `ExternalKmsKeyRef` (umbrella alias `DTExternalKmsKeyRef`) |
| `KVStore` (KMS, `bb-kv-store@0.3.0`) | `KVStore.fromKmsKey(keyArn: string): ExternalKmsKeyRef` | `encryption` | `ExternalKmsKeyRef` |
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
- `Scope` gives you `this.executionRole` (the shared role every Blocks compute
  assumes), `this.fullId`, and CDK tree integration. In `index.cdk.ts`, call
  `this.executionRole.addToPrincipalPolicy(...)` to grant permissions and
  `registerConfig(this, key, value)` to inject config the runtime reads.
  Convention: `BLOCKS_${fullId}_*`. (`this.handler` was removed in `0.8.0` — it
  reached only the default compute.)
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
| New CDK resources feeding Blocks, in your existing stack | **BlocksBackend** — drop the Construct in and wire `executionRole` / `registerConfig` |
| Blocks in its own stack (greenfield) | **BlocksStack** |
| Use a table / bucket / pool / DB owned by another team or stack | **`fromExisting`** on the matching BB |
| Service with no first-party BB (e.g. SQS, ElastiCache) | **Custom Building Block**, or raw CDK wired to `executionRole` for a one-off |
| Own a first-party BB's source outright | **Vendorize** (`blocks-vendorize`) |
| Gradual CDK→Blocks migration | **BlocksBackend + `fromExisting`** — bind existing resources, retire old handlers as traffic shifts |
