# CronJob

**When to use:** Scheduled/recurring tasks — daily reports, hourly data sync, cleanup jobs, periodic health checks.

**When NOT to use:** One-off background work triggered by user action (use AsyncJob). Event-driven processing (use Pipeline).

Scheduled task execution on recurring intervals or cron expressions.

```typescript
const cleanup = new CronJob(scope, "cleanup", {
  schedule: "rate(1 hour)",
  handler: async (event) => {
    console.log(`Running cleanup at ${event.scheduledTime}`);
    // event: { scheduledTime: string, jobName: string, input: T }
  },
});

// Cron expression (daily at 9 AM UTC)
const report = new CronJob(scope, "daily-report", {
  schedule: "cron(0 9 * * ? *)",
  timezone: "America/Los_Angeles",
  handler: async (event) => {
    await generateDailyReport();
  },
  description: "Generate daily sales report",
});

// With typed static input
const sync = new CronJob(scope, "sync", {
  schedule: "rate(5 minutes)",
  input: { source: "crm", maxRecords: 100 },
  handler: async (event) => {
    await syncData(event.input.source, event.input.maxRecords);
  },
  enabled: false, // register but don't run locally
});
```

**CronJobOptions:**
- `schedule` — `rate(N unit)` or `cron(min hr dom mon dow yr)` (AWS 6-field cron)
- `handler` — `(event: CronJobEvent<T>) => Promise<void>`
- `enabled` — default `true`; set `false` for dev-only registration
- `timezone` — IANA timezone for cron expressions
- `input` — static payload passed to handler on every invocation

⚠️ Handlers must be idempotent — EventBridge provides at-least-once delivery.

Local mock: `setInterval`/`setTimeout` timers. AWS: EventBridge Scheduler + Lambda.


## What It Provisions

- EventBridge Scheduler rule
- Lambda function (job handler)
- IAM role for scheduler to invoke Lambda

## See Also

- [async-job](./async-job.md) — On-demand background work
- [pipeline](./pipeline.md) — Event-driven multi-step processing
- [dashboard](./dashboard.md) — Monitoring cron job execution