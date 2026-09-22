# AppSetting

A single configuration value or secret backed by SSM Parameter Store, read at
runtime — feature flags, API URLs, thresholds, or a structured config object.
Each instance maps to exactly **one** SSM parameter.

**Use it for** one app-wide value with optional runtime updates and schema
validation.

**Don't use it for** structured multi-record data (DistributedTable), per-user or
per-entity key-value data (KVStore), or large blobs (FileBucket).

## Contents

- Import
- Usage
- `get()` hits SSM on every call — cache hot paths yourself
- `AppSettingOptions`
- `fromExisting` — reference a parameter owned elsewhere
- Errors
- Local development and provisioning

## Import

```typescript
import { AppSetting, AppSettingErrors } from '@aws-blocks/blocks';
```

`isBlocksError` comes from `@aws-blocks/core`.

## Usage

```typescript
import { z } from 'zod';

// String setting
const apiUrl = new AppSetting(scope, 'api-url', { value: 'https://api.example.com' });

// Typed with schema
const config = new AppSetting(scope, 'config', {
  value: { maxRetries: 3, timeout: 5000 },
  schema: z.object({ maxRetries: z.number(), timeout: z.number() }),
});

// Secret (SSM SecureString, encrypted with the aws/ssm KMS key)
const apiKey = new AppSetting(scope, 'api-key', { secret: true });

// Read / update at runtime
const url = await apiUrl.get();                         // string
const cfg = await config.get();                         // { maxRetries, timeout }
await config.put({ maxRetries: 5, timeout: 10000 });    // validates, then writes
```

`get()`/`put()` are runtime-only — call them inside a handler, not at the top
level of `aws-blocks/index.ts`.

## `get()` hits SSM on every call — cache hot paths yourself

On AWS, `get()` issues a fresh SSM `GetParameter` on **every call** — there is no
in-process caching. Standard-tier SSM `GetParameter` is ~40 TPS by default, so a
setting read on a hot request path can throttle or add latency. Cache the value in
your own module/request scope (and re-read on a TTL if it may change) rather than
calling `get()` per request.

## `AppSettingOptions`

```typescript
interface AppSettingOptions<T = string> {
  value?: T;                     // initial value (required for non-secrets)
  schema?: StandardSchemaV1<T>;  // Zod / Valibot / ArkType — typed + validated
  secret?: boolean;              // true → SSM SecureString
  name?: string;                 // explicit SSM parameter path (default `/${fullId}`)
  logger?: ChildLogger;
}
```

- A non-secret needs a `value`; a secret without a `value` gets a random initial
  value generated locally.
- `put()` validates against `schema` (if any) and rejects values over **4 KB**
  (SSM standard-tier limit) with `ValidationFailed`.

## `fromExisting` — reference a parameter owned elsewhere

`AppSetting.fromExisting(scope, id, { name, secret? })` references an SSM parameter
created and owned **outside this stack** (e.g. a connection string seeded before
deploy). Note it is a **static factory with a different signature** from the
constructor — it takes `scope`, `id`, and an options object of just `{ name, secret? }`
(no `value`). The CDK layer applies read-only, no-create/seed behavior; app code
uses the same `get()`/`put()` API across dev and deploy.

```typescript
const dbUrl = AppSetting.fromExisting<string>(scope, 'db-url', {
  name: '/prod/shared/database-url',
});
const url = await dbUrl.get();
```

## Errors

```typescript
import { isBlocksError } from '@aws-blocks/core';
import { AppSettingErrors } from '@aws-blocks/bb-app-setting';

try {
  await config.put(value);
} catch (e: unknown) {
  if (isBlocksError(e, AppSettingErrors.ValidationFailed)) { /* schema failed or > 4 KB */ }
  throw e;
}
```

| Constant | `error.name` | Thrown when |
|---|---|---|
| `AppSettingErrors.ParameterNotFound` | `ParameterNotFoundException` | parameter missing in SSM, or a secret has an empty value |
| `AppSettingErrors.ValidationFailed` | `ValidationFailedException` | schema validation failed, or value exceeds 4 KB |

## Local development and provisioning

The mock persists to a single consolidated `.bb-data/settings.json`, with each
setting stored under its `fullId` key (values JSON-serialized). Secrets generate a
random value locally (no KMS in mock mode). AWS provisions an SSM Parameter Store
parameter (standard `String` or `SecureString`) plus an IAM policy for the Lambda
to read it.
