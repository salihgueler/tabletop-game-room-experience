# Secret

A single application secret backed by AWS Secrets Manager, read at runtime. Each
instance is exactly **one** high-value credential, with its own access controls
and version history. New in `bb-secret@0.2.0` (`@aws-blocks/blocks@0.8.0`).

**Read-only at runtime by default (breaking in `bb-secret@0.3.0` /
`@aws-blocks/blocks@0.9.0`).** `new Secret(scope, id)` exposes only `get()` and
`listVersions()`. There is no `put()`: calling it is a compile error, the method
is absent from the object at runtime, and the execution role gets read-only IAM
(`GetSecretValue` + `ListSecretVersionIds`, no `PutSecretValue`). Pass
`allowRuntimeWrite: true` when the app sets or rotates the value itself. Code
that called `put()` on a default secret, and deployed stacks whose runtime wrote
the secret, need `allowRuntimeWrite: true` added, or they lose `PutSecretValue`
on the next deploy.

**Use it for** any credential protecting a production app: third-party API keys,
OAuth client secrets, database connection strings, webhook signing keys,
encryption keys.

**Don't use it for** non-sensitive configuration — feature flags, display
strings, thresholds — which belongs in `AppSetting`. For application state use
`KVStore` or `DistributedTable`.

**Secret vs `AppSetting({ secret: true })`.** `Secret` is the recommended home
for production secrets. `AppSetting` with `secret: true` is a free, encrypted
fallback for a **low-value** secret only; it carries no version history and no
per-secret access control.

## Contents

- Import
- Usage
- `SecretOptions`
- Reading versions and rotating
- Setting the value (there is no constructor-time seeding)
- Errors
- Local development
- Caching

## Import

```typescript
import { Secret, SecretErrors } from '@aws-blocks/blocks';
import type { SecretOptions, SecretReadOptions, SecretVersion, SecretVersionInfo } from '@aws-blocks/blocks';
```

`isBlocksError` comes from `@aws-blocks/core`.

## Usage

```typescript
import { z } from 'zod';

// Opaque string secret, read-only (the default). Empty until set out-of-band.
const stripeKey = new Secret(scope, 'stripe-api-key');
const key = await stripeKey.get();            // string | null
// stripeKey.put(...)                         // compile error: no put() on a read-only Secret

// Writable secret: the app sets or rotates the value itself
const token = new Secret(scope, 'self-rotating-token', { allowRuntimeWrite: true });
await token.put('t-abc123');

// Typed JSON secret with schema validation (writable here so put() exists)
const dbConfig = new Secret(scope, 'db-config', {
  schema: z.object({ host: z.string(), port: z.number() }),
  allowRuntimeWrite: true,
});
await dbConfig.put({ host: 'db.internal', port: 5432 });
const cfg = await dbConfig.get();             // { host: string; port: number } | null

// Auto-generated value — for a key that only needs to exist
const signingKey = new Secret(scope, 'webhook-signing-key', { generate: true });
```

`get()` returns `null` when the value is unset or the secret is missing — it does
**not** throw for not-found, so `null` is normal control flow rather than a
try/catch.

```typescript
const key = await stripeKey.get();
if (key === null) throw new Error('Stripe key not configured');
```

## `SecretOptions`

```typescript
interface SecretOptions<T = string> {
  name?: string;                          // explicit Secrets Manager name; default = fullId
  schema?: StandardSchemaV1<T>;           // Zod / Valibot / ArkType — typed JSON secret
  secret?: ExternalSecretRef;             // from Secret.fromExisting(arn)
  removalPolicy?: 'destroy' | 'retain';   // default: stack-wide defaults
  generate?: boolean;                     // seed a random value on first create
  cacheTtlSeconds?: number;               // default 300; 0 disables caching
  allowRuntimeWrite?: boolean;            // default false; new in bb-secret@0.3.0
  logger?: ChildLogger;
}
```

- **`allowRuntimeWrite: true`**: the constructor is overloaded on this flag.
  `true` returns a `WritableSecret<T>` (has `put(value)`), anything else returns
  the read-only `Secret<T>`. It also decides the IAM grant. It applies to every
  secret, including one wrapped with `Secret.fromExisting(arn)`.

- **`name`** — set an explicit, well-known name when a team or CI/CD pipeline must
  target the secret out-of-band (`aws secretsmanager put-secret-value --secret-id
  <name>`). You then own uniqueness across every stack in the account and region.
  Omitted, the name is derived from the scope tree as the instance's `fullId`.
- **`generate: true`** — seeds a random 32-character value on first create, for a
  secret that only needs to *exist* (an HMAC/signing key, an app-internal
  encryption key) so the app works on first deploy with no manual step. The mock
  seeds an equivalent random string so local and deployed behavior match. **Do
  not combine with `schema`** — a random string is not valid JSON.
- **A BB-created secret is otherwise empty by default.** `get()` returns `null`
  until a value is set, matching the configure-after-deploy model.
- **`removalPolicy`** — follows the stack-wide defaults otherwise (`production`
  retains on `cdk destroy`, `sandbox` destroys). Ignored by the mock and when
  wrapping an existing secret.

### `fromExisting` — a secret owned elsewhere

```typescript
const legacy = new Secret(scope, 'legacy-key', {
  secret: Secret.fromExisting('arn:aws:secretsmanager:us-east-1:123456789012:secret:my-secret-AbCdEf'),
});
```

The block creates, seeds and deletes nothing. It reads the value (and writes it
only with `allowRuntimeWrite: true`) and, in the CDK layer, grants access. This is the sanctioned path for a centrally
managed secret shared across installations. `name` is ignored, since the
referenced secret has its own.

## Reading versions and rotating

```typescript
await secret.get();                             // 'current' (default)
await secret.get({ version: 'previous' });      // value before the last change
const versions = await secret.listVersions();   // newest first, metadata only
await secret.get({ version: versions[1] });     // a SecretVersionInfo passes straight back
```

- `'previous'` returns `null` until the secret has been changed at least once.
  Use it for a **rotation grace window** — keep validating tokens signed by the
  prior key while the new one rolls out.
- `listVersions()` returns the **labeled** versions only (current + previous),
  with `stages` carrying `'AWSCURRENT'` / `'AWSPREVIOUS'` and a `createdDate`.
  Never values. Deeper history that Secrets Manager still retains is reachable
  through the AWS SDK against the ARN (`secret.secretArn` on the CDK construct;
  the runtime and mock classes deliberately expose no AWS primitives).
- **Rotate by setting a new value** with `put()` (needs `allowRuntimeWrite: true`), the console, or the CLI. The prior
  value becomes `'previous'`. Automatic rotation is out of scope (AWS ships
  hosted rotators only for database engines); drive `put()` from a `CronJob` for
  a custom schedule.

## Setting the value (there is no constructor-time seeding)

A declaration carries only the name, never the value — deliberately, so no
secret literal lands in source and nothing is seeded from the environment.
Three ways to set one:

1. `generate: true` for an opaque value that needs no human input.
2. The built-in `/aws-blocks/settings` route — redirects to the stack's
   `-settings` resource group in the console when deployed, opens
   `.bb-data/settings.json` locally.
3. An explicit `name` plus `aws secretsmanager put-secret-value` for CI/CD.

BB-created secrets are tagged `aws-blocks-stack=<stackName>` and the stack's
`-settings` resource group matches `AWS::SecretsManager::Secret` alongside
`AWS::SSM::Parameter`, so secrets appear next to `AppSetting` parameters in the
console.

## Errors

| Constant | Wire `name` | When |
|---|---|---|
| `SecretErrors.ValidationFailed` | `ValidationFailedException` | A schema is configured and the value failed validation, or a stored value is not valid JSON |
| `SecretErrors.SecretNotFound` | `ResourceNotFoundException` | The secret does not exist (deleted out-of-band, or a `fromExisting()` ARN pointing at nothing). Thrown by `put()`; `get()` returns `null` instead |
| `SecretErrors.NotSupported` | `NotSupportedException` | Used in an unsupported environment — the browser entry always throws this |

```typescript
import { isBlocksError } from '@aws-blocks/core';

try {
  await secret.put(value);   // secret constructed with allowRuntimeWrite: true
} catch (e: unknown) {
  if (isBlocksError(e, SecretErrors.ValidationFailed)) { /* … */ }
  throw e;
}
```

## Local development

The mock stores values as **plaintext on disk** under `.bb-data/` — the same
`settings.json` that `AppSetting` uses. It is **not secure**: do not put real
credentials in local dev. The mock reads the current value from disk on every
`get()`, so it never caches and `cacheTtlSeconds` has no effect locally.

## Caching

The deployed runtime caches each fetched value in-process so steady-state reads
do not bill a `GetSecretValue` per call. `cacheTtlSeconds` bounds how long a
cached value is served: **300 seconds (5 minutes) by default**, matching the AWS
Secrets Manager agent and the Lambda Parameters and Secrets extension. `0`
disables caching entirely. A `put()` from inside the app clears the cache
immediately, so the TTL only bounds how long an **out-of-band** change (a
console/CLI rotation, or another process's `put()`) can go unnoticed.

The CDK layer provisions one `secretsmanager.Secret` (encrypted with the default
`aws/secretsmanager` key), grants the shared execution role scoped
`GetSecretValue` + `ListSecretVersionIds` (plus `PutSecretValue` only with
`allowRuntimeWrite: true`), requests the Secrets Manager interface VPC
endpoint, and passes the ARN to the runtime via `registerConfig`
(`BLOCKS_SECRET_ARN_<ID>`). Runtime methods on the construct are
`synthGuard`-stubbed.
