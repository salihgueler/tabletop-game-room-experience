# Logger

**When to use:** Structured application logging — request tracking, error reporting, audit trails, debugging info.

**When NOT to use:** Business metrics/KPIs (use Metrics). Request tracing across services (use Tracer). User-facing analytics (build custom).

Structured JSON logging with log levels, context, and child loggers.

```typescript
const logger = new Logger(scope, "log", {
  level: "info",
  defaultContext: { service: "my-app" },
  retention: 30, // CloudWatch log retention in days
});

logger.info("User signed in", { userId: "u123" });
logger.warn("Rate limit approaching", { current: 95, max: 100 });
logger.error("Payment failed", { orderId: "o1", error: err.message });
logger.debug("Cache miss", { key: "user:u123" }); // dropped if level > debug

// Child logger with inherited context
const requestLogger = logger.child({ requestId: "req-abc" });
requestLogger.info("Processing request"); // includes { service, requestId }
```

**LoggingOptions:**
- `level` — `'debug' | 'info' | 'warn' | 'error'` (default: `'info'`)
- `defaultContext` — fields included in every log entry
- `retention` — CloudWatch retention days (1, 3, 5, 7, 14, 30, 60, 90, etc.)

**Methods:** `debug(msg, ctx?)`, `info(msg, ctx?)`, `warn(msg, ctx?)`, `error(msg, ctx?)`, `child(ctx)`.

**Log entry format:** `{ level, message, timestamp, logger, traceId?, ...context }`

Local mock: Structured JSON to stdout. AWS: CloudWatch Logs (via Lambda).


## What It Provisions

- CloudWatch Log Group
- Structured JSON log format
- Log retention policy
- IAM permissions for logging

## See Also

- [metrics](./metrics.md) — Numeric KPIs and counters
- [tracer](./tracer.md) — Distributed request tracing
- [dashboard](./dashboard.md) — Visualize logs and metrics together