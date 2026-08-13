# Metrics

**When to use:** Custom business metrics — conversion rates, active users, queue depths, processing times. Numbers you want to graph and alarm on.

**When NOT to use:** Structured log messages (use Logger). Distributed tracing (use Tracer). One-off debugging (use Logger).

CloudWatch metrics emission via EMF (Embedded Metric Format).

```typescript
const metrics = new Metrics(scope, "appMetrics", {
  namespace: "MyApp",
  defaultDimensions: { Environment: "prod" },
});

// Emit a single metric
metrics.emit("RequestCount", 1, { unit: "Count" });
metrics.emit("Latency", 42.5, {
  unit: "Milliseconds",
  dimensions: { Endpoint: "/api/users" },
  resolution: "high", // 1-second resolution
});

// Batch emit
metrics.emitBatch([
  { name: "Errors", value: 1, unit: "Count" },
  { name: "BytesProcessed", value: 1024, unit: "Bytes" },
]);

// Flush buffered metrics (auto-flushed at end of request)
metrics.flush();

// Child emitter with additional dimensions
const endpointMetrics = metrics.child({ Endpoint: "/api/orders" });
endpointMetrics.emit("RequestCount", 1);
```

**MetricsOptions:**
- `namespace` — CloudWatch namespace (default: scope fullId)
- `defaultDimensions` — dimensions on every metric

**EmitOptions:**
- `unit` — `'Count' | 'Seconds' | 'Milliseconds' | 'Bytes' | 'Percent' | 'None'` etc.
- `dimensions` — per-data-point dimensions (merged with defaults)
- `resolution` — `'standard'` (60s) or `'high'` (1s)
- `timestamp` — custom timestamp (default: now)

Local mock: Console logs metrics. AWS: CloudWatch via EMF.


## What It Provisions

- CloudWatch custom namespace
- Metric data points with dimensions
- Optional: CloudWatch Alarms
- IAM permissions for PutMetricData

## See Also

- [logger](./logger.md) — Structured logs alongside metrics
- [tracer](./tracer.md) — Request-level tracing
- [dashboard](./dashboard.md) — Visualize your custom metrics