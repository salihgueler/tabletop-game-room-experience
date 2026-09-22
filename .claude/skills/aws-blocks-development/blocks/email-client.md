# EmailClient

Transactional email via Amazon SES, with single send and partial-failure batch send.

**Use it for** welcome emails, password resets, receipts, notifications — one-to-one
or moderate-volume transactional mail.

**Don't use it for** marketing/bulk campaigns (use a dedicated ESP with its own
IPs) or in-app/real-time messaging (use Realtime).

## Import

```typescript
import { EmailClient, EmailErrors } from '@aws-blocks/bb-email-client';
// Both are also re-exported from '@aws-blocks/blocks'.
```

## Construct

```typescript
const email = new EmailClient(scope, 'mailer', {
  fromAddress: 'noreply@example.com',        // required
  replyTo: ['support@example.com'],          // optional
  configurationSet: 'my-tracking-set',       // optional — SES config set for delivery tracking
});
```

`EmailOptions`: `fromAddress` (required), `replyTo?`, `configurationSet?`, `logger?`.

## Sending

```typescript
const result = await email.send({
  to: 'user@example.com',                    // string | string[]
  subject: 'Welcome!',
  body: 'Hello from our app.',               // plain text (required)
  html: '<h1>Welcome!</h1>',                 // optional
  cc: ['manager@example.com'],
  bcc: ['audit@example.com'],
});
console.log(result.messageId);
```

`EmailMessage`: `to` (`string | string[]`), `subject`, `body` are required;
`html`, `cc`, `bcc` are optional. Each **individual message** is capped at 50
recipients total (To + CC + BCC combined) — `send()` throws `InvalidInput` past
that; `sendBatch()` marks the offending message failed rather than throwing.

## Batch send — the input array may exceed 50

```typescript
const batch = await email.sendBatch(messages); // messages.length may be > 50
batch.results.forEach((r, i) => {
  // r.status === 'success' | 'failed'; r.messageId on success, r.error on failure
});
```

`sendBatch` uses the SES `SendBulkEmail` API, whose limit is **50 destinations
per API call** — the client auto-chunks the input into groups of 50, so you may
pass an arbitrarily long array. Results come back in input order, one entry per
message, with per-message `status`. A whole chunk that fails at the API level
marks each of its messages `failed` with the mapped error.

## Errors

Match with `isBlocksError` from `@aws-blocks/core`.

| Constant | `error.name` | Cause |
|---|---|---|
| `EmailErrors.SendFailed` | `EmailSendFailedException` | Generic send failure; message over 40 MB |
| `EmailErrors.InvalidInput` | `InvalidInputException` | Malformed address, or > 50 recipients on a single message |
| `EmailErrors.DomainNotVerified` | `DomainNotVerifiedException` | Sending identity/domain not verified in SES |
| `EmailErrors.AccountPaused` | `AccountSendingPausedException` | SES account sending is paused |
| `EmailErrors.RateLimited` | `RateLimitedException` | SES throttled the request |

## SES sandbox caveat

New SES accounts start in the **sandbox**: you can only send to verified
addresses/domains, the daily quota is low, and send rate is throttled. Verify
your sending identity and request production access in the SES console before
relying on this in production — an unverified `fromAddress` (or recipient, in
sandbox) surfaces as `DomainNotVerified`.

## Local mock vs AWS

Local: nothing is actually sent. Each message is logged to the console
(recipient, subject, truncated body) and persisted to
`.bb-data/{fullId}/emails.json`, so tests can assert on what "would have" gone
out. AWS: real SES via `@aws-sdk/client-sesv2` (`SendEmail` / `SendBulkEmail`),
with SDK adaptive retry at `maxAttempts: 3`.

## What it provisions

- SES sending permissions on the shared Blocks handler Lambda's execution role
- No dedicated Lambda — sends run on the shared handler
- SES identity verification and configuration sets are managed in SES, not by this block
