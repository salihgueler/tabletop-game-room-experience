# AsyncJob

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
