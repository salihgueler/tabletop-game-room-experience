# EmailClient

**When to use:** Sending transactional emails from your app — welcome emails, password resets, notifications, receipts.

**When NOT to use:** Marketing/bulk email campaigns (use SES directly with dedicated IPs). Real-time messaging (use Realtime).

Send transactional emails via SES with sender verification.

```typescript
const email = new EmailClient(scope, "mailer", {
  fromAddress: "noreply@example.com",
  replyTo: ["support@example.com"],
  configurationSet: "my-tracking-set",
});

// Single email
const result = await email.send({
  to: "user@example.com",
  subject: "Welcome!",
  body: "Hello from our app.",
  html: "<h1>Welcome!</h1><p>Hello from our app.</p>",
  cc: ["manager@example.com"],
});
console.log(result.messageId);

// Batch send (up to 50 messages)
const batch = await email.sendBatch([
  { to: "a@example.com", subject: "Hi", body: "..." },
  { to: "b@example.com", subject: "Hi", body: "..." },
]);
// batch.results[0].status === 'success' | 'failed'
```

**EmailMessage fields:** `to`, `subject`, `body` (required), `html`, `cc`, `bcc` (optional).

Local mock: Logs emails to console + writes to `.bb-data/`. AWS: Amazon SES.


## What It Provisions

- SES verified identity (domain or email)
- Lambda function for sending
- IAM role with SES send permissions

## See Also

- [async-job](./async-job.md) — Send emails in the background
- [cron-job](./cron-job.md) — Scheduled email digests
- [app-setting](./app-setting.md) — Store email templates/config