# Compute

Choose where a workload runs by stating a compute **type**. Blocks maps the type
to the AWS service behind it (`serverless` → Lambda, `container` → AWS Fargate),
and the service name never appears in your code. New in `bb-compute@0.2.0`
(`@aws-blocks/blocks@0.9.0`).

**Use it for** a workload that needs something other than the app's default
compute: a long-running or high-memory background job (container), or an API
namespace that needs more memory (and CPU) or its own scaling (serverless).

**Don't use it for** isolation. Every compute runs the same backend bundle under
the app's one execution role, so a separate compute is placement, not a security
boundary. Omit `compute` everywhere and every workload keeps running on the app
default, exactly as before.

## What it cannot do

- **API calls stay capped at about 29 seconds** (the API Gateway integration
  timeout), whatever `maxTimeoutSeconds` says. Put longer work in an `AsyncJob`.
- **A `container` compute runs `AsyncJob`s only.** `ApiNamespace` and `CronJob`
  take a `serverless` compute only; passing a container is a type error, and a
  container inherited from a `Scope` fails synth with an error naming the compute.
- **`Realtime` and `RawRoute` always run on the default compute**, even inside a
  scope that sets `compute`. The auth HTTP routes (`/aws-blocks/auth/*`) do too.
  `Realtime.publish()` works from any compute.
- **A compute belongs to one backend.** A `Compute` created in a different
  `BlocksBackend` can't serve this backend's API (synth warns and the namespace
  falls back to the default compute), and a `CronJob` or `AsyncJob` on such a
  compute fails synth.
- **No effect locally.** In `npm run dev` every handler runs in the one dev
  server process; `size`, `scaling` and memory settings do nothing there.
- **`vm` and `kubernetes` types do not exist yet.** The type names are marked
  provisional in the declarations.

## Contents

- Import and minimal example
- Options per type
- Where a `Compute` can go
- Placing a whole scope
- AsyncJob on a container
- Shared VPC, and why `Database` stays put
- Errors

## Import and minimal example

```typescript
import { Scope, Compute, AsyncJob, ApiNamespace } from '@aws-blocks/blocks';

const scope = new Scope('my-app');

// Serverless (Lambda): pay per request.
const reportsCompute = new Compute(scope, 'reports-compute', { type: 'serverless', memory: 4096 });

// Container (Fargate): a long-running process.
const worker = new Compute(scope, 'worker', {
  type: 'container',
  size: { vcpu: 1, memory: 2048 },
  scaling: { minInstances: 1, maxInstances: 10 },
});

export const reports = new ApiNamespace(scope, 'reports', (context) => ({
  async build(month: string) { /* … */ },
}), { compute: reportsCompute });

new AsyncJob(scope, 'render', {
  compute: worker,
  timeoutSeconds: 60 * 30,
  handler: async (payload) => { /* … */ },
});
```

The constructor is `new Compute(scope, id, props)` where `props` is
`ComputeProps`: the `ComputeOptions` discriminated union plus an optional
`logRetention` (a CDK `RetentionDays`, overriding `defaults.logRetention` for
this compute's log group). The kind is inferred from `type`, so
`new Compute(scope, id, { type: 'container', … })` is typed as a container
compute and flows into the options of the block you hand it to.

## Options per type

Options are scoped to the type. Setting an option of the other type is a compile
error.

### `type: 'serverless'` (`ServerlessComputeOptions`)

| Option | Meaning |
|---|---|
| `memory?: number` | Function memory in MB. CPU scales with memory. The default is sized for the shared handler (API plus queue work); an API-only compute can usually run on less. |
| `maxTimeoutSeconds?: number` | The function timeout, up to `900` (`LAMBDA_MAX_TIMEOUT_SECONDS`). Defaults to the maximum. It is the ceiling for async work only; an `AsyncJob`'s `timeoutSeconds` must fit under it. Keep it at 30 or more on a compute that serves API calls, because the handler caps each HTTP request at the smaller of 28 seconds and this value. |

### `type: 'container'` (`ContainerComputeOptions`)

| Option | Meaning |
|---|---|
| `size?: ContainerSize` | A valid Fargate `{ vcpu, memory }` pair. Invalid pairs don't type-check. |
| `scaling?: ContainerScaling` | `{ minInstances, maxInstances, strategy? }`, wired to Application Auto Scaling. |
| `image?: string` | A public or ECR image URI, used as written. Default `public.ecr.aws/docker/library/node:24-slim`. |

`ContainerSize` values (memory in MB):

| `vcpu` | Allowed `memory` |
|---|---|
| `0.25` | 512, 1024, 2048 |
| `0.5` | 1024 to 4096 in 1024 steps |
| `1` | 2048 to 8192 in 1024 steps |
| `2` | 4096 to 16384 in 1024 steps |
| `4` | 8192 to 30720 in 1024 steps |
| `8` | 16384 to 61440 in 4096 steps |
| `16` | 32768 to 122880 in 8192 steps |

`strategy` is one `ScalingSignal` or an array of them:

```typescript
type ScalingSignal =
  | { on: 'cpu'; targetPercent: number }
  | { on: 'memory'; targetPercent: number }
  | { on: 'queue-depth'; backlogPerInstance: number };
```

With several signals, scale-out follows the one that asks for the most
instances, and scale-in needs all of them to agree. Omit `strategy` and Blocks
picks queue depth for a compute that drains `AsyncJob` queues and CPU otherwise.
Queue depth sums the messages across every queue the compute drains.

**About `image`.** Blocks builds no image and a deploy needs no local Docker.
Your app code ships separately as an S3 asset and the container fetches it at
boot, so a custom image only supplies the runtime: it must have **Node 24** on
`PATH` and any system libraries your handlers need (for example media tools).
It must be arm64-compatible, because Fargate runs on Graviton; multi-arch images
resolve automatically.

## Where a `Compute` can go

| Workload | How | Compute types |
|---|---|---|
| `AsyncJob` | `compute` option | `serverless`, `container` |
| `ApiNamespace` | 4th constructor argument, `{ compute }` | `serverless` |
| `CronJob` | `compute` option | `serverless` |
| `Scope` (everything under it) | `compute` in `ScopeOptions` | `serverless`, `container` (container only places `AsyncJob`s) |

One `Compute` can host several namespaces and jobs. They then run in the same
function (or the same container service).

For an `ApiNamespace`, routing follows the **export name**: the client POSTs to
`/aws-blocks/api/{exportName}` and the shared gateway sends that path to the
namespace's compute. This works on every `apiFrontDoor` tier and behind
`Hosting`, so the API keeps one domain. A call to the bare `/aws-blocks/api`
(raw HTTP, or a native client older than `aws-blocks-swift` 0.2.0 /
`aws-blocks-kotlin` 0.3.0) runs on the default compute.

## Placing a whole scope

```typescript
import { Scope, Compute, ApiNamespace, AsyncJob, CronJob } from '@aws-blocks/blocks';

const reportsCompute = new Compute(scope, 'reports-compute', { type: 'serverless', memory: 4096 });
const reports = new Scope('reports', { parent: scope, compute: reportsCompute });

export const reportsApi = new ApiNamespace(reports, 'reports', (context) => ({ /* methods */ }));
new AsyncJob(reports, 'rebuild', { handler: async () => { /* … */ } });
new CronJob(reports, 'nightly', { schedule: 'cron(0 2 * * ? *)', handler: async () => {} });
```

- Give the `Compute` and the `Scope` **different ids** when they share a parent;
  both become child constructs of it.
- **Nearest wins:** the block's own `compute`, then the nearest scope that sets
  one, then the app default.
- Under a **container** scope, `AsyncJob`s go to the container, and an
  `ApiNamespace` or `CronJob` fails synth. Give those their own serverless
  `compute` or create them outside the scope.
- `maxConcurrencyPerCPU` on an `AsyncJob` still needs the container passed as
  the job's own `compute`, because only that is typed as a container.

## AsyncJob on a container

```typescript
new AsyncJob(scope, 'reports', {
  compute: worker,            // a type: 'container' Compute
  timeoutSeconds: 60 * 30,    // enforced: the worker thread is terminated at the deadline
  maxConcurrencyPerCPU: 4,    // per-instance deliveries = max(1, ceil(4 × vcpu))
  handler: async (payload) => { /* … */ },
});
```

On a container, delivery moves from the SQS-to-Lambda event source to a poller
the container starts itself, and each delivery runs in its own worker thread.
`timeoutSeconds` and `maxConcurrencyPerCPU` describe the work and live on the
job; `size` and `scaling` describe the machine and live on the `Compute`.
`maxConcurrencyPerCPU` on a serverless (or default) job is a compile error and a
synth error. See [async-job](async-job.md).

## Shared VPC, and why `Database` stays put

A container needs a VPC. Blocks creates **one** shared VPC and one ECS cluster
per backend, however many container computes you declare, and the result does
not depend on declaration order. The shared VPC is either `provided` (you passed
`defaults.vpc.network`) or `derived` (Blocks created it). Stateless compute uses
whichever exists.

A stateful block, today `Database`, joins **only a VPC you provided**. It never
joins a Blocks-derived VPC. Without this rule, adding a container could move an
existing Aurora cluster into the new VPC, which CloudFormation applies as a
replacement that destroys the database. A `Database` with no customer VPC keeps
building its own VPC, as before. Moving a `Database` into a shared VPC is a
deliberate migration you do out of band.

## Errors

Compute misplacement shows up as synth errors on the consuming block, and the
messages name the compute by its full construct path (for example
`MyStack/app/reports/backing`, which contains your `Compute` id):

- `AsyncJobErrors.UnsupportedCompute` (`UnsupportedComputeException`): the
  job's compute (its own or its scope's) is not a Lambda or container compute,
  or belongs to another backend.
- `CronJob` on a container scope, or on a compute from another backend: synth
  fails naming the compute.
- A namespace on a compute that takes no API traffic, or an export name API
  Gateway can't use as a path segment: synth fails with a clear error.
