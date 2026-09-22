# Logger

Structured JSON logging with levels, inherited context, and child loggers. Both
locally and on AWS it writes one JSON line per entry to stdout (stderr for
`error`); on Lambda those lines land in CloudWatch Logs.

**Use it for** request tracking, error reporting, audit trails, debugging
context.

**Don't use it for** numeric measurements over time (use Metrics) or
cross-service request tracing (use Tracer).

## Contents

- Import and minimal example
- `LoggingOptions`
- Level: constructor option, default `'info'`
- Methods are synchronous
- Log entry format
- Errors
- What it provisions

## Import and minimal example

Re-exported from the umbrella `@aws-blocks/blocks`.

```typescript
import { Logger } from '@aws-blocks/blocks';

const logger = new Logger(scope, 'log', {
  level: 'info',
  defaultContext: { service: 'my-app' },
});

logger.info('User signed in', { userId: 'u123' });
logger.error('Payment failed', { orderId: 'o1', error: err.message });
logger.debug('Cache miss', { key: 'user:u123' });   // dropped when level > debug

const requestLogger = logger.child({ requestId: 'req-abc' });
requestLogger.info('Processing');   // entry carries { service, requestId }
```

## `LoggingOptions`

```typescript
interface LoggingOptions {
  level?: LogLevel;               // 'debug' | 'info' | 'warn' | 'error'
  defaultContext?: Record<string, unknown>;
}
```

- `level` sets the minimum; anything below is dropped. Default `'info'`.
- `defaultContext` merges into every entry. The reserved structural keys
  `level`, `message`, `timestamp`, `logger`, and `traceId` are owned by the
  logger — any such keys in your context (or a `child()` context) are ignored so
  they cannot corrupt the entry.
- **Retention moved to the compute in `0.6.0`** (`bb-logger@0.2.0`). `LoggingOptions`
  no longer has a `retention` field; logging is always on and you set log
  retention with `logRetention` on the compute (e.g. via `BlocksPresets`), not on
  the Logger. A `retention` key on `LoggingOptions` is now a type error.

## Level: constructor option, default `'info'`

The effective level is the `level` you pass in options, or `'info'` when omitted.
**`Logger` no longer reads the `LOG_LEVEL` environment variable** as of `0.6.0`
(`bb-logger@0.2.0`) — set the level explicitly in options.

## Methods are synchronous

```
debug(msg, ctx?)  info(msg, ctx?)  warn(msg, ctx?)  error(msg, ctx?)  child(ctx)
```

All logging methods return `void`, **not** a Promise — do not `await` them.
Writing to stdout/stderr is synchronous and Lambda captures the stream
asynchronously, so returning a Promise would add overhead for no benefit.

`child(ctx)` returns a `ChildLogger` (the same five methods) whose context is the
parent's merged with `ctx`; children can be nested. A `ChildLogger` is not a
Scope node.

## Log entry format

```typescript
interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;   // ISO 8601
  logger: string;      // the logger's id
  traceId?: string;    // auto-injected in Lambda when X-Ray tracing is active
  [key: string]: unknown;   // your merged context
}
```

`traceId` appears automatically when the function runs in Lambda **with X-Ray
active tracing on** — which the Tracer block enables. That is what lets you pivot
from a log line to its trace; without a Tracer (or with tracing off) the field is
simply absent.

## Security: Logger does not redact

Logger provides serialization safety (circular refs, `BigInt`, type coercion) but
**does not redact sensitive content**. Never pass raw credentials, tokens,
passwords, or secrets to any Logger method — anything you log lands in CloudWatch
verbatim. Sanitize (drop or mask) sensitive fields on the context object before
logging.

## Errors

`LoggingErrors.SerializationFailed` (`SerializationFailedException`) — a context
value could not be JSON-serialized (e.g. a `BigInt` or a circular reference).
Import `LoggingErrors` from `@aws-blocks/blocks`.

## What it provisions

Nothing of its own — logs flow through the compute's log group. Log retention is
a compute-level setting (`logRetention`), not a Logger option; when unset, the
Lambda's auto-created log group applies and logs never expire.
