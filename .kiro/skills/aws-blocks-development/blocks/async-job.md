# AsyncJob

Fire-and-forget background work: `submit()` returns immediately, the handler
runs later on its own Lambda. On AWS it is an SQS queue plus a DLQ feeding the
shared Lambda handler; locally the handler runs in-process on the next tick.

**Use it for** sending email, processing an upload, calling a slow external API —
anything that must not block the API response.

**Don't use it for** scheduled/recurring work (use CronJob), streaming tokens to
the user (use Agent + Realtime), or work whose result the caller must have before
responding (do it inline).

## Contents

- Import and minimal example
- `AsyncJobOptions`
- The handler contract: at-least-once, idempotent, batched
- Partial batch failure: throw the one you want redelivered
- `submit` and `submitBatch` — and the throw-on-partial-failure trap
- Job status tracking: `trackStatus`, `getStatus`, `waitUntilComplete`
- Errors
- What it provisions

## Import and minimal example

Everything here is re-exported from the umbrella `@aws-blocks/blocks`.

```typescript
import { AsyncJob } from '@aws-blocks/blocks';
import { z } from 'zod';

const payload = z.object({ to: z.string().email(), subject: z.string(), body: z.string() });

const emailJob = new AsyncJob(scope, 'send-email', {
  schema: payload,                         // optional StandardSchemaV1 (Zod/Valibot/ArkType)
  handler: async (data, context) => {      // context is AsyncJobContext, see below
    await sendEmail(data.to, data.subject, data.body);
  },
});

// In an API handler — returns as soon as the message is enqueued:
const { jobId } = await emailJob.submit({ to: 'user@example.com', subject: 'Hi', body: '...' });
```

`schema` validates on `submit()`/`submitBatch()` before the message is enqueued;
a failure throws `ValidationFailed`. Without a schema the payload is sent as-is.

## `AsyncJobOptions`

```typescript
interface AsyncJobOptions<T> {
  handler: (payload: T, context: AsyncJobContext) => Promise<void>;   // required
  schema?: StandardSchemaV1<T>;
  maxRetries?: number;                  // default 3
  batchSize?: number;                   // default 10
  maxBatchingWindowSeconds?: number;    // default 5
  trackStatus?: boolean;                // default false
  logger?: ChildLogger;
}
```

- `maxRetries` (default **3**) is the SQS `maxReceiveCount`: after this many
  deliveries fail, the message goes to the DLQ. It counts deliveries of *one*
  message, unchanged by batching.
- `batchSize` (default **10**) is how many messages the Lambda receives per
  invocation. Range 1–10, or up to 10000 when `maxBatchingWindowSeconds > 0`.
  Out-of-range throws `InvalidOption` at synth time.
- `maxBatchingWindowSeconds` (default **5**) is how long SQS waits to fill a
  batch before invoking. Range 0–300; out-of-range throws `InvalidOption` at
  synth. Higher fills batches more completely (lower cost) at the price of
  latency.

## The handler contract: at-least-once, idempotent, batched

Delivery is **at-least-once**. The same message can be delivered more than once
(SQS redrive, a timeout that fires after the work completed), so **handlers must
be idempotent** — key writes on something stable, or check-before-write.

The handler signature carries an `AsyncJobContext` as its second argument:

```typescript
interface AsyncJobContext {
  jobId: string;        // SQS message id on AWS; a truncated UUID in the mock
  receiveCount: number; // 1 on first delivery, higher on a redelivery
  sentAt: string;       // ISO 8601 timestamp the message was enqueued
}
```

`receiveCount` is the cheap way to tell a first attempt from a retry (e.g. log
loudly only when `receiveCount > 1`).

## Partial batch failure: throw the one you want redelivered

The Lambda receives up to `batchSize` messages and runs your handler **once per
message**. The framework uses SQS partial-batch responses, so failure is
per-message and the contract is simply:

**To fail one message, `throw` from the handler for that payload.** Only that
message is redelivered (its `receiveCount` increments toward `maxRetries` → DLQ);
every message that returned normally is deleted. You do **not** return a special
shape — the framework converts a thrown handler into `{ batchItemFailures }` for
you.

```typescript
const job = new AsyncJob<{ id: string }>(scope, 'process', {
  handler: async (data) => {
    // Throwing here fails ONLY this message. Siblings in the same batch still succeed.
    await processOne(data.id);
  },
});
```

The one exception: a **whole-invocation death** — a Lambda timeout or OOM —
cannot report per-message success, so SQS redelivers the **entire batch**. That
is the other reason every handler must be idempotent: a message that already
succeeded can be redelivered because a *different* message in its batch killed
the invocation.

## `submit` and `submitBatch` — and the throw-on-partial-failure trap

```typescript
submit(payload: T, options?: SubmitOptions): Promise<{ jobId: string }>;
submitBatch(payloads: T[], options?: SubmitOptions): Promise<BatchSubmitResult>;

interface SubmitOptions { delaySeconds?: number; }   // 0–900, default 0
```

`delaySeconds` (0–900) delays when the message becomes visible for processing.

`submitBatch` takes **1–10,000** payloads (empty throws `BatchEmpty`, >10,000
throws `BatchTooLarge`). It **auto-chunks** internally: SQS caps a single
`SendMessageBatch` at 10 entries (and 256 KB total), so the framework splits your
payloads into ≤10-message chunks and sends up to 5 chunks concurrently. The
10,000 cap is a client-side guardrail, not an SQS limit. A multi-chunk submit is
**not atomic** — see the `BatchSubmitFailed` trap below.

**The trap:** on AWS, if *any* entry fails to enqueue, `submitBatch` **throws**
`BatchSubmitFailed` — it does **not** return a result with a populated `failed`
array. The thrown error carries the detail:

```typescript
try {
  await job.submitBatch(payloads);
} catch (err) {
  if (isBlocksError(err, AsyncJobErrors.BatchSubmitFailed)) {
    // err.jobIds: Array<string | null>  — null at each failed index
    // err.failed: Array<{ index, code, message }>
    //   code ∈ 'BatchSubmitAborted' (chunk skipped after an earlier chunk failed),
    //          'MissingResult' (SQS returned no result for the entry),
    //          'TransportError' (fallback = the thrown error's .name)
  }
}
```

So destructuring `const { failed } = await job.submitBatch(...)` to inspect
failures is wrong — on a partial failure you never reach the assignment. The
returned `BatchSubmitResult` (`{ jobIds, failed }`) only comes back when **every**
entry succeeded, and its `failed` array is then empty.

## Job status tracking: `trackStatus`, `getStatus`, `waitUntilComplete`

By default AsyncJob records nothing — "did my job run?" has no answer. Opt in
with `trackStatus: true`, which provisions a DynamoDB table and writes a record
on submit and on each state change:

```typescript
const job = new AsyncJob(scope, 'import', { trackStatus: true, handler });

const { jobId } = await job.submit(payload);
const status = await job.getStatus(jobId);            // AsyncJobStatus | null
const final  = await job.waitUntilComplete(jobId, { timeoutMs: 60_000 });
```

```typescript
type AsyncJobState = 'queued' | 'processing' | 'complete' | 'failed';

interface AsyncJobStatus {
  jobId: string;
  state: AsyncJobState;
  transitions: AsyncJobTransition[];   // append-only history, in order
  attempts: number;
  submittedAt: string;
  updatedAt: string;
  error?: string;                      // last handler error, set when state is 'failed'
}

interface AsyncJobTransition { state: AsyncJobState; at: string; attempt: number; }
```

`getStatus` returns `null` when nothing is recorded for that id. `transitions`
is append-only, so a single read after the job settled still shows it passed
through `processing` — you do not need to poll to observe intermediate states.
`attempt` is **`0` for the `queued` transition** and **`1` on first delivery**,
incrementing on each redelivery.
Status records **expire after 24 h** — `STATUS_RETENTION_SECONDS = 86_400`, written
as a per-record TTL, so `getStatus` on a day-old `jobId` returns
`null`.

`waitUntilComplete(jobId, options?)` resolves on either terminal state
(`complete` or `failed`) — inspect `state`/`error` to tell them apart — and
throws `Timeout` if the job does not settle within `timeoutMs`:

```typescript
interface WaitUntilCompleteOptions {
  timeoutMs?: number;      // default 30000
  pollIntervalMs?: number; // default 250, ±20% jitter
  signal?: AbortSignal;
}
```

**Both `getStatus` and `waitUntilComplete` throw `StatusNotTracked` on a job
created without `trackStatus: true`.** Leave `trackStatus` off for pure
fire-and-forget work — it adds a table plus a write per transition.

## Errors

Import `AsyncJobErrors` from `@aws-blocks/blocks`; match with `isBlocksError`.

| Constant | `name` value | Cause |
|---|---|---|
| `PayloadTooLarge` | `PayloadTooLargeException` | Serialized payload > 256 KB (the SQS message limit) |
| `BatchEmpty` | `BatchEmptyException` | `submitBatch([])` |
| `BatchTooLarge` | `BatchTooLargeException` | `submitBatch` with > 10000 payloads (the per-call client-side cap) |
| `ValidationFailed` | `ValidationFailedException` | Payload failed the `schema` |
| `BatchSubmitFailed` | `BatchSubmitFailedException` | One+ entries failed to enqueue (AWS); carries `.jobIds` / `.failed` |
| `Timeout` | `AsyncJobTimeoutException` | `waitUntilComplete` gave up before a terminal state |
| `StatusNotTracked` | `StatusNotTrackedException` | `getStatus`/`waitUntilComplete` without `trackStatus: true` |
| `InvalidOption` | `InvalidOptionException` | `batchSize`/`maxBatchingWindowSeconds` out of range (thrown at synth) |
| `UnsupportedCompute` | `UnsupportedComputeException` | the resolved compute is not Lambda (thrown at synth) |

For a payload over 256 KB, store the blob in FileBucket or KVStore and put a
reference key in the job payload.

## What it provisions

An SQS queue, an SQS DLQ (14-day retention, `maxReceiveCount = maxRetries`), an
SQS event source on the shared Lambda handler with `reportBatchItemFailures`
always on, and — only with `trackStatus: true` — a DynamoDB status table. There
is no dedicated Lambda per job; AsyncJob, CronJob and API routes share one.
