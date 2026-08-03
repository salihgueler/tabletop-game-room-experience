# Testing Reference

## Contents
- [Workflow](#recommended-workflow) · [Setup Pattern](#test-setup-pattern) · [Run Command](#run-command)
- [No Type Casts Rule](#no-type-casts-rule) · [Customer vs Infra Code](#customer-code-vs-test-infrastructure)
- [Example Test](#example-test-file) · [Dev Server](#dev-server-for-tests) · [Array.fromAsync](#arrayfromasync)

## Recommended Workflow

Test API via direct imports — no browser needed. Write tests in `test/e2e.test.ts`, import the typed client from `aws-blocks`, assert against return values. Fastest feedback loop.

## Test Setup Pattern

```typescript
import { test } from 'node:test';
import assert from 'node:assert';
import type { api as ApiType } from 'aws-blocks';

let api: typeof ApiType;
test.before(async () => {
  const mod = await import('aws-blocks');
  api = mod.api;
});
```

Declare `api` with `typeof ApiType` (static type import, dynamic value assignment). The `test.before()` dynamic `import()` ensures the dev server is running before module resolution.

## Run Command

```bash
npm run test:e2e
```

PRs are blocked on passing e2e tests in CI.

## No Type Casts Rule

**E2E tests represent the customer DX.** Code exercising API calls, return values, callback params, and result chaining must compile without `as any`, `: any`, or other casts. If a cast is needed, the BB's public types are wrong — fix at the source.

## Customer Code vs Test Infrastructure

| Category | Casts OK? | Examples |
|----------|-----------|----------|
| Customer code | ❌ Never | API calls, return values, callback params, result chaining |
| Test infrastructure | ✅ Fine | Fetch spies, server lifecycle, deploy scripts, process mgmt |

Rule: if a customer would write it in their app, it must be cast-free.

## Example Test File

```typescript
import { test } from 'node:test';
import assert from 'node:assert';
import type { api as ApiType } from 'aws-blocks';

let api: typeof ApiType;
test.before(async () => {
  const mod = await import('aws-blocks');
  api = mod.api;
});

test('creates and retrieves an item', async () => {
  const created = await api.createItem('test-item');
  assert.ok(created.id);
  const retrieved = await api.getItem(created.id);
  assert.strictEqual(retrieved.name, 'test-item');
});
```

## Dev Server for Tests

For long-lived processes (dev server running during tests), use tmux + polling:

```typescript
import { execSync } from 'node:child_process';

execSync('tmux new-session -d -s test-server "npm run dev"');

const waitForServer = async (url: string, timeout = 30_000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { await fetch(url); return; }
    catch { await new Promise(r => setTimeout(r, 500)); }
  }
  throw new Error(`Server not ready at ${url} after ${timeout}ms`);
};
```

## Array.fromAsync

Use `Array.fromAsync()` to collect async iterables — no mutable accumulators:

```typescript
// ✅ Preferred
const records = await Array.fromAsync(table.query({ where: { userId: { equals: id } } }));

// ❌ Avoid — mutable accumulator with for-await
const items: string[] = [];
for await (const r of table.query(...)) { items.push(r.name); }
```
