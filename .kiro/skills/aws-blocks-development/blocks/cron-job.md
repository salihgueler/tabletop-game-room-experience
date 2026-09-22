# CronJob

Scheduled task execution on a recurring `rate(...)` or `cron(...)` expression.
On AWS it is an EventBridge Scheduler schedule targeting the shared Lambda
handler; locally it fires in-process (see the trap below).

**Use it for** periodic work: cleanup, report generation, data sync, cache
warming, health checks.

**Don't use it for** one-off work triggered by a user action (use AsyncJob), or
reacting to a data change (subscribe to the relevant block's events).

## Contents

- The local-dev trap: the schedule DOES fire locally
- Import and minimal example
- `CronJobOptions`
- Schedule expressions
- `enabled` is construct-time only — there is no runtime enable/disable
- The handler event
- Failure and concurrency
- Errors
- What it provisions

## The local-dev trap: the schedule DOES fire locally

Agents reliably assume the mock is inert. It is not. In local dev the schedule
runs in-process:

- `rate(...)` schedules fire on a `setInterval`.
- `cron(...)` schedules compute the next fire time — **timezone-aware** — and fire
  on a `setTimeout`, then reschedule. The local next-fire search scans forward
  minute-by-minute up to **~1 year** (525,600 minutes); if no match is found in
  that window it **falls back to firing 1 hour from now** rather than never
  firing. (This is a local-mock detail only; on AWS EventBridge Scheduler owns
  the timing.)
- Both timers are `unref()`'d, so they do not by themselves keep the dev server
  alive, but while it runs your handler **will** be invoked on schedule and logs
  `[CronJob:{id}] triggered at {timestamp}`.
- `enabled: false` registers the job but does **not** start the timer.

So a `rate(1 minute)` job hitting a real database in local dev will actually hit
it every minute. Set `enabled: false` (or a long interval) if that is not what
you want during development.

## Import and minimal example

Re-exported from the umbrella `@aws-blocks/blocks`.

```typescript
import { CronJob } from '@aws-blocks/blocks';

const cleanup = new CronJob(scope, 'cleanup', {
  schedule: 'rate(1 hour)',
  handler: async (event) => {
    // event: { scheduledTime: string, jobName: string, input: T }
    await deleteExpiredRecords();
  },
});
```

## `CronJobOptions`

```typescript
interface CronJobOptions<T = void> {
  schedule: string;                                  // required — rate(...) or cron(...)
  handler: (event: CronJobEvent<T>) => Promise<void>; // required
  enabled?: boolean;    // default true
  description?: string;
  timezone?: string;    // IANA tz for cron(...) expressions; rate(...) ignores it. default UTC
  input?: T;            // static payload passed on every invocation
  logger?: ChildLogger;
}
```

`input` is a **static** value baked into the schedule at synth time and passed
to every invocation as `event.input` — it is not a way to pass data per-fire.
Type it with the class generic: `new CronJob<{ mode: string }>(...)`.

## Schedule expressions

**Rate** — a value and a unit; the plural must agree with the value
(`rate(1 hour)`, `rate(5 minutes)`, `rate(7 days)`). `rate(1 minutes)` or
`rate(5 minute)` throw `InvalidSchedule`. The **only accepted units are
`minute(s)`, `hour(s)`, and `day(s)`** — `rate(...)` has **no seconds unit**
(EventBridge's minimum granularity is 1 minute), so `rate(10 seconds)` throws
`InvalidSchedule`. The value must be `>= 1`.

**Cron** — the AWS 6-field form `cron(minute hour day-of-month month day-of-week year)`.
Exactly one of day-of-month / day-of-week must be `?`.

```
cron(0 9 * * ? *)         daily at 09:00
cron(0 */2 * * ? *)       every 2 hours
cron(30 9 ? * MON-FRI *)  weekdays at 09:30
cron(0 0 1 * ? *)         first of the month at 00:00
```

`timezone` applies to `cron(...)` only; `rate(...)` always runs in UTC.

## `enabled` is construct-time only — there is no runtime enable/disable

`CronJob` is a pure infrastructure declaration. It exposes **no runtime methods**
— no `enable()`, `disable()`, `pause()`, or `trigger()`. `enabled` is read once,
at construction: `true` (default) provisions an `ENABLED` schedule, `false`
provisions a `DISABLED` one. To turn a job on or off you change `enabled` and
redeploy. To run it on demand, invoke the underlying logic directly (extract the
handler body into a function and call it), not through the CronJob.

Contrast with AsyncJob, which is programmatic and *does* have runtime methods
(`submit`, `submitBatch`).

## The handler event

```typescript
interface CronJobEvent<T = void> {
  scheduledTime: string;  // ISO 8601 of the scheduled invocation
  jobName: string;        // the CronJob's fullId
  input: T;               // the static `input`, or undefined when none was set
}
```

## Failure and concurrency

- **At-least-once delivery** — a schedule can fire twice in rare cases, so
  handlers must be idempotent.
- **Overlap** — if a handler runs longer than the interval, the next invocation
  starts while the previous is still running. Design for concurrency or take an
  application-level lock (e.g. in KVStore).
- **Retries** — a handler exception is retried by Lambda's async-invoke retry
  policy (2 retries, exponential backoff); after that the error is logged to
  CloudWatch. There is no per-CronJob DLQ.

## Errors

Import `CronJobErrors` from `@aws-blocks/blocks`. `InvalidSchedule`,
`InvalidTimezone`, and `UnsupportedCompute` are thrown at construction time
(fail-fast), so you see them at synth; `ScheduleNotSupported` is a local-mock
runtime condition.

| Constant | `name` value | Cause |
|---|---|---|
| `InvalidSchedule` | `InvalidScheduleExpression` | `schedule` is not a valid `rate(...)` or `cron(...)` expression |
| `InvalidTimezone` | `InvalidTimezoneExpression` | `timezone` is not a valid IANA timezone |
| `ScheduleNotSupported` | `ScheduleNotSupportedInMock` | the schedule can't be simulated by the local mock |
| `UnsupportedCompute` | `UnsupportedComputeException` | the resolved compute is not Lambda |

## What it provisions

One `AWS::Scheduler::Schedule` (EventBridge Scheduler) per CronJob, targeting the
shared Lambda handler, plus a single per-stack EventBridge Scheduler IAM role
with `lambda:InvokeFunction`. No dedicated Lambda per job — CronJob, AsyncJob and
API routes share one handler.
