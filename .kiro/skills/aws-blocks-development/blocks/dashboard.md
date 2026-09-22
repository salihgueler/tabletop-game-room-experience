# Dashboard

An auto-generated CloudWatch dashboard assembled from your observability blocks:
pass Metrics / Logger / Tracer instances plus a list of metric widgets, and the
block builds the CloudWatch Dashboard and a redirect route to it.

**Use it for** operational visibility into a deployed app — request rates, error
counts, latency, your own business metrics — without hand-building dashboards.

**Don't use it for** end-user analytics UIs (build those in your frontend) or
fully custom widget layouts (use the CloudWatch console directly).

## Contents

- Import and minimal example
- `DashboardOptions`
- The key constraint: metric widgets chart YOUR namespace only
- `MetricConfig`
- `defaultDimensions` merge — or widgets show "Insufficient data"
- The always-present widget set
- Getting the dashboard URL
- Errors and what it provisions

## Import and minimal example

Re-exported from the umbrella `@aws-blocks/blocks`. Pass the block **instances**
directly.

```typescript
import { Logger, Metrics, Tracer, Dashboard } from '@aws-blocks/blocks';

const logger  = new Logger(scope, 'log', { level: 'info' });
const metrics = new Metrics(scope, 'metrics', { namespace: 'MyApp' });
const tracer  = new Tracer(scope, 'tracer', {});

const dashboard = new Dashboard(scope, 'dashboard', {
  title: 'My App',
  metrics,                      // its namespace is what metric widgets query
  logger,                       // adds log query widgets
  tracer,                       // adds X-Ray widgets
  metricConfigs: [
    { name: 'RequestCount' },
    { name: 'Latency', stat: 'p99', period: 300, title: 'P99 Latency' },
    { name: 'ErrorRate', stat: 'Average' },
  ],
});
```

## `DashboardOptions`

```typescript
interface DashboardOptions {
  title?: string;
  logs?: boolean;                  // show the per-compute logs section (default true)
  traces?: boolean;                // show the per-compute traces section (default true)
  metrics?: MetricsSource | MetricsSource[];  // app-scoped metric source(s) + their metricConfigs
  defaultTimeRange?: string;       // ISO 8601 duration, default '-PT3H'
}
```

**Compute-driven in `0.6.0` (`bb-dashboard@0.2.0`).** The dashboard is organized
**by compute** — it covers every compute in the app (resolved at finalize, so
construction order doesn't matter) and renders a health section always, a logs
section (unless `logs: false`), and a traces section only when tracing is enabled
on that compute (unless `traces: false`). `logs` and `traces` are app-wide display
toggles applied uniformly to every compute; logs are always captured regardless,
so `logs: false` only hides the section. The removed `logger` / `tracer`
(`LoggerBBRef` / `TracerBBRef`) fields are **gone** — the dashboard reads compute
state directly and Loggers/Tracers are never passed to it. Metrics remain
app-scoped and are passed via `metrics` (a `MetricsSource` or array, each carrying
its own `metricConfigs`).

## The key constraint: metric widgets chart YOUR namespace only

**`MetricConfig` has no `namespace` field.** Every entry in `metricConfigs`
resolves against the single namespace of the `metrics` block you pass — i.e.
**your own emitted product metrics**. There is no way to point a metric widget at
a different namespace.

Consequently you **cannot** chart AWS service namespaces (`AWS/Cognito`,
`AWS/CloudFront`, `AWS/DynamoDB`, …) through `metricConfigs`. The only
AWS-service widgets this block produces are the fixed `AWS/Lambda` health set for
the shared handler (always present, see below). For other AWS-service metrics,
add widgets in the CloudWatch console directly.

## `MetricConfig`

```typescript
interface MetricConfig {
  name: string;                                                        // required
  stat?: 'Sum' | 'Average' | 'Maximum' | 'Minimum' | 'p99' | 'p95' | 'p50';  // default 'Sum'
  period?: number;                                                     // seconds, default 60
  title?: string;                                                      // default: name
  dimensions?: Record<string, string>;
}
```

Because metrics are emitted at runtime (EMF) while widgets are created at synth
time, the block cannot discover which metrics will exist — you declare them here
so the widgets are pre-created. A declared-but-not-yet-emitted metric shows
"Insufficient data" until its first emission.

`period` must be `>= 1` (seconds); a value below 1 (e.g. `0` or a negative)
throws `DashboardErrors.InvalidMetricConfig` (`InvalidMetricConfigException`) at
synth. CloudWatch's own valid periods are `1, 5, 10, 30`, then any multiple of
`60` up to `3600` (e.g. `60, 120, 300, 900, 3600`); the block only enforces the
`>= 1` lower bound and passes the value through — a non-CloudWatch-valid number
that clears `>= 1` is not rejected by the block. An empty metric `name` also
throws `InvalidMetricConfig`.

## `defaultDimensions` merge — or widgets show "Insufficient data"

A metric is stored under the exact dimension set it was emitted with, and a
widget only finds data if its query dimensions match. The Dashboard reads the
Metrics block's `defaultDimensions` and applies them to every widget query
automatically; a `MetricConfig.dimensions` entry merges on top and wins on
conflict.

The failure mode to watch: if you emit with a default dimension
(`new Metrics(..., { defaultDimensions: { Environment: 'prod' } })`) but chart a
`MetricConfig` whose resolved dimensions don't match what was emitted, the widget
renders but shows **"Insufficient data"** — the metric exists under a different
dimension set. Keep the emitted dimensions and the charted dimensions aligned
(passing the same Metrics instance handles the defaults for you).

## The always-present widget set

Even with no `metricConfigs`, the dashboard includes the fixed `AWS/Lambda`
health widgets for the shared handler (invocations, errors, duration,
concurrent executions). Passing `logger` adds log-query widgets over the handler's log group;
passing `tracer` adds X-Ray trace widgets. A bare `new Dashboard(scope, 'd')`
still produces the Lambda health set.

## Getting the dashboard URL

After deploy the console URL is available three ways:

- `dashboard.url` — a `string` on the deployed (CDK) instance. It contains CDK
  tokens at synth time, so read the resolved value from the CloudFormation
  **output** named `Url`, not by string-inspecting it during synth. (In the
  local mock, `dashboard.url` is always `null`.)
- The **CfnOutput** `Url` the block emits.
- The **redirect route** at `routePath` (default `/aws-blocks/dashboard`): on AWS
  it 302-redirects to the console URL (viewing still requires AWS Console login —
  exposing the path grants no data access); locally it returns **503** with a
  "deploy to view" message, since no CloudWatch dashboard exists in dev. Set
  `routePath: false` to omit the route (the URL/CfnOutput remain).

## Errors and what it provisions

`DashboardErrors.InvalidMetricConfig` (`InvalidMetricConfigException`) — a
malformed `MetricConfig`. Import `DashboardErrors` from `@aws-blocks/blocks`.

Provisions one CloudWatch Dashboard (L2 construct) with the resolved widgets, a
`CfnOutput` for its URL, and — unless `routePath: false` — a RawRoute on the
shared handler that redirects to it.
