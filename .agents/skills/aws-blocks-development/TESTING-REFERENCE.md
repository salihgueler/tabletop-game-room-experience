# Testing Reference

## Contents
- [Workflow](#recommended-workflow)
- [Setup pattern](#test-setup-pattern)
- [installCookieJar & isServerRunning](#installcookiejar--isserverrunning)
- [Run command](#run-command)
- [Array.fromAsync](#arrayfromasync)

## Recommended Workflow

Test the API via direct imports — no browser needed. Write tests in
`test/e2e.test.ts`, import the typed client from `aws-blocks` (the same client the
frontend uses), and assert against return values. This is the fastest feedback
loop and is what the scaffolded templates ship.

## Test Setup Pattern

This is the real setup boilerplate from a scaffolded project's
`test/e2e.test.ts`. Type the client
statically (`typeof ApiType`) but assign it via a dynamic `import()` inside
`test.before()`, so the dev server is up before the module resolves:

```typescript
import { test } from 'node:test';
import assert from 'node:assert';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { installCookieJar, isServerRunning } from '@aws-blocks/blocks/utils';
import type { api as ApiType, authApi as AuthApiType } from 'aws-blocks';

// Install the cookie jar BEFORE importing the API client (see below).
installCookieJar();

let server: ChildProcess | null = null;
let api: typeof ApiType;
let authApi: typeof AuthApiType;

test.before(async () => {
  if (!(await isServerRunning())) {
    server = spawn('npm', ['run', 'dev:server'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      env: { ...process.env, NODE_OPTIONS: '' },
    });
    server.unref();
    await setTimeout(2000);
  }
  const mod = await import('aws-blocks');
  api = mod.api;
  authApi = mod.authApi;
});

test.after(() => {
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch {}
  }
});

test('auth: sign up creates account and signs in', async () => {
  const state = await authApi.setAuthState({
    action: 'signUp',
    username: 'testuser@example.com',
    password: 'TestPass123!',
  });
  assert.strictEqual(state.state, 'signedIn');
});

test('todos: create', async () => {
  const todo = await api.createTodo('Buy milk', 1);
  assert.strictEqual(todo.title, 'Buy milk');
});
```

## installCookieJar & isServerRunning

Both are exported from `@aws-blocks/blocks/utils`.

`installCookieJar()` patches `global.fetch` with a cookie jar so `Set-Cookie`
response headers persist across requests — Node's native fetch does not do this,
which otherwise breaks every authenticated API call. **Call it once, before you
import the API client** (i.e. before the dynamic `import('aws-blocks')`). It
throws if called twice, and returns a cleanup function that restores the original
`fetch`.

`isServerRunning(port = 3000)` returns `true` if something is already listening on
`port`. Use it in setup to reuse a dev server that's already up instead of
spawning a second one (as the setup pattern above does). It resolves `false` only
on `ECONNREFUSED` and rethrows other errors.

## Run Command

Templates run e2e tests through `tsx` with the `browser` export condition:

```bash
npm run test:e2e
# → tsx -C browser test/e2e.test.ts
```

The `-C browser` condition makes `aws-blocks` resolve to the client bundle
(`client.js`) — the same module the frontend loads. CI blocks PRs on these tests
passing.

## Array.fromAsync

`table.query(...)` returns an async iterable. Collect it with `Array.fromAsync()`
rather than a mutable accumulator — this is the idiom used in the scaffolded
`aws-blocks/index.ts` templates:

```typescript
// ✅ Preferred
const records = await Array.fromAsync(
  table.query({ where: { userId: { equals: id } } }),
);

// ❌ Avoid — mutable accumulator with for-await
const items = [];
for await (const r of table.query(...)) { items.push(r); }
```
