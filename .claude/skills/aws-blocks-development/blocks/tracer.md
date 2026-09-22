# Tracer

Distributed tracing over AWS X-Ray. Wrap an operation in `startSegment` to record
it as an X-Ray subsegment with annotations, metadata, and error state; correlate
logs to traces with `getTraceId()`.

**Use it for** following one request across Lambda, DynamoDB, S3 and external
calls, and finding where time or failures go in a complex flow.

**Don't use it for** plain log messages (use Logger) or numeric KPIs (use
Metrics).

## Contents

- Import and minimal example
- `TracerOptions`
- The two levels: root Tracer methods and the `Segment` handle
- The trap: `startSegment` silently no-ops without an active X-Ray segment
- What it provisions

## Import and minimal example

Re-exported from the umbrella `@aws-blocks/blocks`.

```typescript
import { Tracer } from '@aws-blocks/blocks';

const tracer = new Tracer(scope, 'tracer', { enabled: true });

const user = await tracer.startSegment('fetchUserData', async (segment) => {
  segment.addAnnotation('userId', 'u123');      // indexed, searchable in X-Ray
  segment.addMetadata('query', { limit: 10 });  // visible in trace detail, not indexed
  try {
    const u = await fetchUser('u123');
    segment.setHttpStatus(200);
    return u;
  } catch (err) {
    segment.addError(err as Error);             // marks the segment faulted
    throw err;
  }
});
```

## `TracerOptions`

```typescript
interface TracerOptions {
  enabled?: boolean;      // default true; false makes all ops silent no-ops
  samplingRate?: number;  // 0–1, LOCAL MOCK ONLY (see below)
  logger?: ChildLogger;
}
```

`samplingRate` affects **only the local mock** — on AWS, sampling is governed by
X-Ray sampling rules and this value is ignored. `enabled: false` makes every
tracing operation a no-op, but `startSegment` still runs the wrapped function
normally, so wrapping code in it is always safe.

## The two levels: root Tracer methods and the `Segment` handle

Root-level methods act on the Lambda's ambient (facade) segment; the `Segment`
passed to a `startSegment` callback acts on that subsegment.

Root `Tracer`:

```typescript
startSegment<T>(name: string, fn: (segment: Segment) => Promise<T>): Promise<T>;
addAnnotation(key: string, value: string | number | boolean): void;  // on the facade segment
addMetadata(key: string, value: unknown): void;                      // on the facade segment
getTraceId(): string | null;
```

`Segment` (the callback argument):

```typescript
interface Segment {
  addAnnotation(key: string, value: string | number | boolean): void;  // indexed/searchable
  addMetadata(key: string, value: unknown): void;                       // not indexed
  addError(error: Error): void;                                         // mark faulted
  setHttpStatus(statusCode: number): void;                             // 5xx→fault, 4xx→error flag
}
```

`getTraceId()` returns the current X-Ray root trace id, or `null` when tracing is
disabled or there is no active trace. It is the documented way to correlate logs
with traces — log it, or rely on the Logger block auto-injecting `traceId` when
X-Ray tracing is active.

## The trap: `startSegment` silently no-ops without an active X-Ray segment

On AWS, `startSegment` records a subsegment only when there is already an active
X-Ray segment (the Lambda facade). If none exists, it **silently runs your
function with a no-op segment** — annotations and metadata go nowhere and no
subsegment appears in X-Ray. No error is thrown.

That active segment exists only when **X-Ray active tracing is enabled on the
Lambda**. `enabled: true` on the Tracer is **not sufficient by itself** — it is
what causes the block to turn active tracing on (its CDK layer sets the
function's `tracingConfig.mode = 'Active'` and grants
`xray:PutTraceSegments` / `xray:PutTelemetryRecords`). So keep the Tracer
`enabled` (the default); if you construct it with `enabled: false`, active
tracing is not configured and traces will be silently empty. `addAnnotation` /
`addMetadata` / `getTraceId` on the root are guarded the same way — they do
nothing when there is no active segment.

## What it provisions

No standalone resources. **Presence-gated fleet-wide in `0.6.0`
(`bb-tracer@0.2.0`):** constructing *any* `Tracer` in the app now enables X-Ray
active tracing on **every** compute, not just one implicit compute — X-Ray is
real, costed infrastructure, so it stays off until the app opts in by
constructing a Tracer. Internally `@aws-blocks/core/cdk` records the Tracer's
presence (`registerTracer()`) and turns tracing on across all computes at finalize
(`finalizeTracing()`); `Compute.enableTracing()` is idempotent. When `enabled`
(the default), it flips each compute's `tracingConfig` to `Active` and attaches an
IAM policy allowing `xray:PutTraceSegments` and `xray:PutTelemetryRecords`.
Locally, mock traces are written to `.bb-data/` and logged to stdout.
