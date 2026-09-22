# Metrics

Custom application metrics via CloudWatch EMF (Embedded Metric Format). Every
`emit` writes a structured JSON line to stdout — locally and on AWS identically —
and on Lambda CloudWatch extracts the metrics from those lines automatically.

**Use it for** numbers you want to graph and alarm on: request counts, error
rates, latency, queue depth, business KPIs.

**Don't use it for** structured log messages (use Logger), request tracing (use
Tracer), or time-series you need to query back (use a table).

## Contents

- Import and minimal example
- `MetricsOptions`
- `emit` and `emitBatch` — options, units, resolution
- The exact `MetricUnit` union
- Limits: batch of 100, 30 dimensions — and the cardinality cost
- Everything is synchronous `void` and needs no IAM
- `child()` emitters and `Metrics.fromExisting()`
- Errors
- What it provisions

## Import and minimal example

Re-exported from the umbrella `@aws-blocks/blocks`.

```typescript
import { Metrics } from '@aws-blocks/blocks';

const metrics = new Metrics(scope, 'appMetrics', {
  namespace: 'MyApp/Orders',
  defaultDimensions: { Environment: 'prod' },
});

metrics.emit('RequestCount', 1, { unit: 'Count' });
metrics.emit('Latency', 42.5, {
  unit: 'Milliseconds',
  dimensions: { Endpoint: '/api/orders' },   // merged over defaults; per-emit wins
  resolution: 'high',                         // 1-second resolution
});
```

## `MetricsOptions`

```typescript
interface MetricsOptions {
  namespace?: string;                          // default: the scope's fullId
  defaultDimensions?: Record<string, string>;  // applied to every metric
  metrics?: ExternalMetricsRef;                // wrap an existing namespace; see fromExisting
  logger?: ChildLogger;
}
```

`namespace` must not start with `AWS/` (reserved) and is validated at
construction (`InvalidNamespace`). When `metrics` (a `fromExisting` ref) is set,
`namespace` is ignored. The resolved namespace is exposed as `metrics.namespace`,
and `defaultDimensions` as `metrics.defaultDimensions` — this is exactly what the
Dashboard block reads.

## `emit` and `emitBatch`

```typescript
emit(name: string, value: number, options?: EmitOptions): void;
emitBatch(metrics: MetricDatum[]): void;

interface EmitOptions {
  unit?: MetricUnit;                    // default 'None'
  dimensions?: Record<string, string>; // merged over defaultDimensions, per-emit wins
  timestamp?: Date;                     // default now
  resolution?: MetricResolution;        // 'standard' (60s, default) | 'high' (1s)
}

interface MetricDatum {   // same fields as emit, flattened
  name: string; value: number;
  unit?: MetricUnit; dimensions?: Record<string, string>;
  timestamp?: Date; resolution?: MetricResolution;
}
```

`resolution: 'high'` (1-second) is retained at full resolution for 3 hours then
aggregated; `'standard'` (60-second) for 15 days. `emitBatch` groups its data
points by dimension set into EMF entries for you.

## The exact `MetricUnit` union

`unit` accepts **only** these eleven values. There are no others — for anything
not listed, use `'None'`.

```
'Count' | 'Seconds' | 'Milliseconds' | 'Microseconds' | 'Bytes' | 'Kilobytes'
| 'Megabytes' | 'Gigabytes' | 'Percent' | 'Bits/Second' | 'None'
```

## Limits: batch of 100, 30 dimensions — and the cardinality cost

- `emitBatch` accepts at most **100** metrics; more throws `BatchTooLarge`.
- A metric may carry at most **30** dimensions total (defaults + per-emit
  combined); more throws `InvalidDimensions`, as do empty keys/values or any
  key/value over 1024 chars. Metric names must be non-empty and ≤ 1024 chars
  (`InvalidMetricName`).
- **Dimension cardinality is billable.** CloudWatch charges per unique
  combination of namespace + metric name + dimension name/value set — each
  distinct combination is a separate custom metric. So **never use an unbounded
  value like `userId` or `requestId` as a dimension**: one metric with a
  per-user dimension becomes one billable metric per user. Keep dimensions to
  low-cardinality facets (endpoint, environment, region).

## Everything is synchronous `void` and needs no IAM

All methods (`emit`, `emitBatch`, `flush`, `child`) return `void`, not a Promise
— do not `await` them. Emission is a synchronous stdout write in EMF; Lambda
captures the stream and CloudWatch extracts the metrics from the log lines. That
means **no `cloudwatch:PutMetricData` permission is required** — the block grants
no IAM and calls no CloudWatch API. `flush()` is a no-op kept for interface
symmetry (there is no buffer to flush).

## `child()` emitters and `Metrics.fromExisting()`

```typescript
const orderMetrics = metrics.child({ Endpoint: '/api/orders' });
orderMetrics.emit('RequestCount', 1);   // carries the parent's namespace + merged dimensions
```

`child(dimensions)` returns a `MetricsEmitter` (same `emit`/`emitBatch`/`flush`/`child`
surface) that shares the parent namespace and layers the given dimensions on the
parent's defaults. It is not a Scope node.

```typescript
const metrics = new Metrics(scope, 'legacy', {
  metrics: Metrics.fromExisting('MyOrg/SharedMetrics'),
});
```

`Metrics.fromExisting(namespace)` returns an `ExternalMetricsRef` you pass as the
`metrics` option to emit into a namespace this block does not own.

## Errors

Import `MetricsErrors` from `@aws-blocks/blocks`; match with `isBlocksError`.

| Constant | `name` value | Cause |
|---|---|---|
| `InvalidMetricName` | `InvalidMetricNameException` | Name empty or > 1024 chars |
| `InvalidDimensions` | `InvalidDimensionsException` | > 30 dimensions, empty key/value, or key/value > 1024 chars |
| `BatchTooLarge` | `BatchTooLargeException` | `emitBatch` with > 100 metrics |
| `InvalidNamespace` | `InvalidNamespaceException` | Namespace empty, > 256 chars, bad characters, or starts with `AWS/` |

## What it provisions

Nothing. Metrics travel as EMF JSON on the shared Lambda's stdout into CloudWatch
Logs, where CloudWatch extracts them — no dedicated resources and no IAM grant.
