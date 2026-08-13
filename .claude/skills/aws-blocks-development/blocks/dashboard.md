# Dashboard

**When to use:** Auto-generated CloudWatch dashboards for monitoring your app — request rates, error counts, latencies, custom business metrics.

**When NOT to use:** Custom analytics UIs for end users (build with your frontend framework). Alerting without visualization (use Metrics + CloudWatch Alarms directly).

CloudWatch dashboard auto-generated from observability Building Blocks.

```typescript
const logger = new Logger(scope, "log", { level: "info" });
const metrics = new Metrics(scope, "metrics", { namespace: "MyApp" });
const tracer = new Tracer(scope, "tracer", {});

const dashboard = new Dashboard(scope, "dashboard", {
  title: "My App Dashboard",
  metrics: metrics,  // pass BB instance directly
  logger: logger,
  tracer: tracer,
  metricConfigs: [
    { name: "RequestCount" },
    { name: "Latency", stat: "p99", period: 300, title: "P99 Latency" },
    { name: "ErrorRate", stat: "Average" },
  ],
  defaultTimeRange: "-PT3H",
  routePath: "/aws-blocks/dashboard", // 302 redirect to CloudWatch console
});
```

**DashboardOptions:**
- `metrics` — Metrics BB instance (uses its namespace)
- `logger` — Logger BB instance (adds log query widgets)
- `tracer` — Tracer BB instance (adds X-Ray trace widgets)
- `metricConfigs` — `{ name, stat?, period?, title?, dimensions? }[]`
- `defaultTimeRange` — ISO 8601 duration (default: `'-PT3H'`)
- `routePath` — redirect endpoint path (default: `'/aws-blocks/dashboard'`), set `false` to disable

**MetricConfig fields:**
- `stat` — `'Sum' | 'Average' | 'Maximum' | 'Minimum' | 'p99' | 'p95' | 'p50'`
- `period` — aggregation period in seconds (default: 60)

Local mock: Console summary of configured widgets. AWS: CloudWatch Dashboard.


## What It Provisions

- CloudWatch Dashboard
- Auto-populated widgets from other blocks' metrics
- IAM permissions for dashboard access

## See Also

- [metrics](./metrics.md) — Custom metrics that appear in the dashboard
- [logger](./logger.md) — Structured logs correlated with dashboard data
- [tracer](./tracer.md) — Distributed traces linked from dashboard