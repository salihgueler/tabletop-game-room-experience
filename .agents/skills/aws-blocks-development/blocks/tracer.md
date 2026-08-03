# Tracer

Distributed tracing with X-Ray subsegments, annotations, and metadata.

```typescript
const tracer = new Tracer(scope, "tracer", {
  enabled: true,
  samplingRate: 1.0,
});

// Wrap an operation in a traced segment
const result = await tracer.startSegment("fetchUserData", async (segment) => {
  segment.addAnnotation("userId", "u123");       // searchable in X-Ray
  segment.addMetadata("query", { limit: 10 });   // visible in trace details
  segment.setHttpStatus(200);

  try {
    return await fetchUser("u123");
  } catch (err) {
    segment.addError(err);
    throw err;
  }
});
```

**TracerOptions:**
- `enabled` — default `true`; `false` makes all ops silent no-ops
- `samplingRate` — 0–1 (local mock only; AWS uses X-Ray sampling rules). Sampling is now a **per-trace decision** — when a trace starts sampled, all its subsegments are recorded consistently. Previously sampling was applied globally which could produce incomplete traces.

**Segment methods:**
- `addAnnotation(key, value)` — indexed, searchable (string | number | boolean)
- `addMetadata(key, value)` — non-indexed, any JSON-serializable value
- `addError(error)` — mark segment as faulted
- `setHttpStatus(code)` — categorize response (2xx/4xx/5xx)

Local mock: Console logs with timing. AWS: X-Ray.
