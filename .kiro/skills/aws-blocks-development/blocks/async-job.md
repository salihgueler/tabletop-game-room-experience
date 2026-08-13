# AsyncJob

**When to use:** Fire-and-forget background work — sending emails, processing uploads, calling slow external APIs, anything that shouldn't block the API response.

**When NOT to use:** Scheduled/recurring tasks (use CronJob), real-time streaming to the user (use Agent + Realtime), or simple synchronous operations.

Fire-and-forget background work. Returns immediately, handler runs asynchronously.

```typescript
import { z } from "zod";

const payload = z.object({
  to: z.string().email(),
  subject: z.string(),
  body: z.string(),
});

const emailJob = new AsyncJob(scope, "send-email", {
  schema: payload,
  handler: async (data, context) => {
    await sendEmail(data.to, data.subject, data.body);
  },
});

// In API — returns immediately
await emailJob.submit({ to: "user@example.com", subject: "Hi", body: "..." });

// Batch (max 10)
await emailJob.submitBatch([
  { to: "a@example.com", subject: "Hi", body: "..." },
  { to: "b@example.com", subject: "Hi", body: "..." },
]);
```

Local mock: runs handler in-process immediately. AWS: SQS + Lambda with retries.

Limits: payload max 256KB, batch max 10 items.


## Common Mistakes

❌ `Payload > 256KB in `submit()``
✅ `Store large data in KVStore or FileBucket, pass a reference key in the job payload`
_SQS message limit is 256KB — "PayloadTooLarge" error_

❌ ``submitBatch()` with > 10 items`
✅ `Split into multiple `submitBatch()` calls of ≤10 items each`
_SQS batch limit is 10 — "BatchTooLarge" error_


## What It Provisions

- SQS queue
- Lambda function (job handler)
- DLQ for failed messages
- IAM roles

## See Also

- [cron-job](./cron-job.md) — Scheduled/recurring background work
- [agent](./agent.md) — Uses AsyncJob internally for agent execution
- [pipeline](./pipeline.md) — Multi-step event-driven workflows