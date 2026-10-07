# Hosting

Deploys a frontend — SPA, static site, or SSR app — to S3 + CloudFront in the
same stack as a Blocks backend, and proxies `/aws-blocks/*` through the same
CloudFront domain so the frontend calls the API with relative URLs and no CORS.

**Use it for** the production deploy of a Blocks app's frontend (React/Vue/
Angular SPA, a static site, or Next.js/Nuxt/Astro/SvelteKit SSR) alongside its
backend, with an optional custom domain, WAF, and per-request CSP.

**Don't use it for** an API-only backend (omit Hosting entirely — the backend
deploys without it), for serving user-uploaded files (that is FileBucket), or in
sandbox mode. The scaffolded `index.cdk.ts` only constructs Hosting when
`!sandboxMode`, so `npm run sandbox` is backend-only and Hosting is a
production-deploy concern.

## Which `Hosting` this is

This file documents the **core `Hosting` construct** exported from
`@aws-blocks/blocks/cdk`. That is what
every scaffolded `aws-blocks/index.cdk.ts` imports and constructs. It wraps the
lower-level L3 `HostingConstruct` with Blocks conventions (runs the build,
detects the framework, deploys `config.json`, wires the API proxy).

There is a **separate** L3 surface — the `defineHosting` / `HostingProps` type
from `@aws-blocks/hosting` — with a wider option set (`environment`,
`storage.encryption`, `compute.warmup`, `compute.tracing`, `storage.inventory`).
Those are NOT props of the construct documented here; do not pass them to
`new Hosting(...)`. When a caller means the L3, they are in a different API.
This file is the core construct only. (SSR edge caching is the exception: the
core construct gained top-level `ssrDefaultTtl` / `cacheKeyCookies` /
`cacheKeyHeaders` in `core@0.6.0` and forwards them to the L3 `cdn` config. See
"SSR edge caching" below.)

## Contents

- Import and minimal example
- `HostingProps`
- Framework detection and the `framework` values
- SSR runtime: OpenNext vs the Lambda Web Adapter
- The API proxy — why `api` is effectively required
- Custom domain
- WAF
- Content-Security-Policy (the default, and why passing your own is risky)
- On-by-default cost/behaviour: `monitoring` and `skewProtection`
- SSR edge caching: `ssrDefaultTtl` and the cache key
- Other options: `buildCache`, `errorPages`, `logging`, `geoRestriction`, `quotas`
- What there is NO surface for (VPC)
- Deploy commands
- What it provisions

## Import and minimal example

```typescript
import { Hosting, BlocksStack } from '@aws-blocks/blocks/cdk';
import { join } from 'node:path';

const blocksStack = await BlocksStack.create(app, stackName, { /* ... */ });

new Hosting(blocksStack, 'Hosting', {
  root: join(__dirname, '..'),      // frontend app root
  buildCommand: 'npm run build',    // runs during synth, with BLOCKS_API_URL injected
  api: blocksStack,                 // wires the /aws-blocks/* CloudFront proxy
});
```

`root` is the only structurally-required prop, but a real deploy always passes
`api` (see below). `buildCommand` runs during `cdk synth`; omit it only if the
build output already exists on disk.

## `HostingProps`

The `Hosting` construct options:

```typescript
interface HostingProps {
  root: string;                       // required — frontend app root
  buildCommand?: string;              // e.g. 'npm run build'; run during synth
  framework?: FrameworkType;          // auto-detected when omitted (see below)
  buildOutputDir?: string;            // auto-detected per framework when omitted
  customAdapter?: FrameworkAdapterFn; // for a framework with no built-in adapter
  basePath?: string;                  // serve under a sub-path, e.g. '/app'

  api?: BlocksStackApi;               // the Blocks backend (or any { apiUrl })
  backendConfig?: Record<string, unknown>;  // extra public keys in config.json

  compute?: ComputeConfig;            // SSR Lambda: memorySize, timeout, ...
  domain?: HostingDomainConfig;
  waf?: HostingWafConfig;
  retainOnDelete?: boolean;           // default false
  contentSecurityPolicy?: string;
  priceClass?: cdk.aws_cloudfront.PriceClass;  // default PRICE_CLASS_100
  geoRestriction?: { type: 'whitelist' | 'blacklist'; countries: string[] };
  quotas?: {
    cacheBehaviors?: number;          // default 25
    edgeFunctions?: number;           // default 25
    headerPolicies?: number;          // default 20 (account-wide)
    maxRouteChunks?: number;          // default 64
  };
  buildCache?: { enabled: boolean; bucket?: cdk.aws_s3.IBucket };
  errorPages?: { notFound?: string; serverError?: string };
  logging?: { enabled: boolean; retentionDays?: number };  // default retention 90
  monitoring?: {                                            // ON by default
    enabled?: boolean;
    subscriptions?: Array<EmailSubscription | UrlSubscription>; // aws-cdk-lib/aws-sns-subscriptions
  };
  skewProtection?: { enabled: boolean; maxAge?: number };    // ON by default
  ssrDefaultTtl?: cdk.Duration;       // default 0; > 0 needs a credential in the cache key
  cacheKeyCookies?: string[];         // session cookie name(s); max 8
  cacheKeyHeaders?: string[];         // e.g. ['authorization']; 'accept-encoding' rejected
}
```

`ComputeConfig` (SSR only): `memorySize` (MB, default 512), `timeout`
(`cdk.Duration` or a plain number of seconds, default 30 — a number outside 1–900
throws `compute.timeout must be between 1-900 seconds`),
`reservedConcurrency`, `imageOptimization.reservedConcurrency`, and
`logRetention` (default `TWO_WEEKS`).

There is **no `apiUrl` string prop** and there never was — pass the backend stack
via `api`. There is **no `spaFallback` prop** (it is an internal adapter field,
see below) and **no `storage` prop** on this construct.

## Framework detection and the `framework` values

`FrameworkType` is `'nextjs' | 'nitro' | 'nuxt' | 'astro' | 'sveltekit' | 'spa' |
'static'` (an open union — it also accepts any other string, which routes to a
`customAdapter` or throws `UnsupportedFrameworkError` if none is registered).

When `framework` is omitted, `detectFramework` reads the project's own
`package.json` (`dependencies` + `devDependencies` + `peerDependencies`, not
`node_modules`) and picks the first match in this order:

1. `next` present → `nextjs`
2. any of `nuxt`, `nitropack`, `@solidjs/start`, `@analogjs/platform-server`,
   `@tanstack/start` → `nitro`
3. `astro` → `astro`
4. `@sveltejs/kit` → `sveltekit` (bare `svelte` without kit is a Vite SPA)
5. otherwise → `spa`

Set `framework` explicitly to override — e.g. `framework: 'spa'` when a stray
`next` peer dependency would otherwise misfire SSR. `spa` means single-page
(client-side routing, `/index.html` fallback); `static` means multi-page
(directory-index resolution). Both use the same adapter; the only difference is
the internal `spaFallback` flag it derives (`spa` → true, `static` → false).

## SSR runtime: OpenNext vs the Lambda Web Adapter

Two different mechanisms, split by framework — do not conflate them:

- **Next.js → OpenNext** (`@opennextjs/aws`). The adapter runs the OpenNext
  build, reads `.open-next/`, and translates it to the deploy manifest. Not the
  Lambda Web Adapter.
- **Nitro/Nuxt, Astro, SvelteKit → the Lambda Web Adapter (LWA).** These emit a
  standard Node HTTP server (Astro via `@astrojs/node`, SvelteKit via
  `@sveltejs/adapter-node`) which runs behind the LWA.

SPA and static sites have no SSR runtime — they are S3 + CloudFront only.

## The API proxy — why `api` is effectively required

Passing `api: blocksStack` does three things: it adds CloudFront behaviors that
proxy `/aws-blocks` and `/aws-blocks/*` (plus the auth subtree `/aws-blocks-auth/*`
and any registered RawRoute paths) to the API Gateway origin; it injects
`BLOCKS_API_URL` (and `BLOCKS_CONFIG` from `backendConfig`) into the SSR Lambda;
and it writes `config.json` with a *relative* `apiUrl` so the browser fetches
through the same domain. Omit `api` only for a genuinely static, backend-less
site. Without it, the frontend has no API URL to call.

`config.json` is deployed to `/.blocks-sandbox/config.json` and served no-cache;
client code reads it for API discovery. `backendConfig` keys are merged into it
and are **publicly readable** — never put secrets there.

## Custom domain

`HostingDomainConfig` (re-exported from `@aws-blocks/hosting`):

```typescript
domain: {
  domainName: string | string[];              // single or multi-domain
  certificate?: ICertificate;                 // BYO ACM cert — MUST be us-east-1
  hostedZone?: string;                        // Route 53 zone name; creates A/AAAA
  hostedZoneId?: string;                      // avoids HostedZone.fromLookup()
  wwwRedirect?: 'toApex' | 'toWww' | 'none';  // default 'none'
}
```

There is **no `certificateArn` field**. Pass a certificate object:

```typescript
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';

domain: {
  domainName: 'app.example.com',
  certificate: Certificate.fromCertificateArn(
    stack, 'Cert',
    'arn:aws:acm:us-east-1:123456789012:certificate/abc-123',
  ),
  hostedZone: 'example.com',
}
```

The certificate must live in **us-east-1** (CloudFront requirement). With a
`hostedZone`/`hostedZoneId`, Route 53 records are created automatically; without
either, you manage DNS externally and CNAME to the distribution domain.
`wwwRedirect` only takes effect when both the apex and `www` names are in
`domainName`.

## WAF

`HostingWafConfig`:

```typescript
waf: {
  enabled: boolean;
  rateLimit?: number;    // requests per 5-minute window per IP; default 1000
  webAclArn?: string;    // BYO existing WAFv2 WebACL — must be us-east-1
}
```

`rateLimit` is the AWS WAF rate-based-rule floor: **the minimum accepted value is
100** (AWS rejects lower). A BYO `webAclArn`, like the certificate, must be scoped
`CLOUDFRONT` in **us-east-1**; region validation enforces this at synth unless
`skipRegionValidation` is set on the L3 (not exposed here).

## Content-Security-Policy (the default, and why passing your own is risky)

When you pass **no** `contentSecurityPolicy`, the construct emits this default,
with `override: false`:

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https: wss:; media-src 'self'; object-src 'none'; frame-ancestors 'self'
```

`override: false` is deliberate: it lets an SSR origin's own per-request CSP
(carrying a nonce, e.g. Next.js Server Components) win. The moment you pass your
own `contentSecurityPolicy`, the header flips to `override: true` — CloudFront
then forces your static string onto every response and **strips the SSR
per-request nonce**, breaking nonce-based inline scripts. So for a nonce-using
SSR app, prefer setting CSP at the origin and leaving this prop unset. The
default already allows `connect-src 'self' https: wss:`, so Realtime/API
connections work without a custom CSP.

## On-by-default cost/behaviour: `monitoring` and `skewProtection`

Two options default to **on** and change cost/behaviour silently — know they are
there:

- **`monitoring` (default `{ enabled: true }`)** — wires CloudWatch alarms
  (CloudFront 5xx, SSR Lambda errors/throttles, revalidation DLQ) to SNS alarm
  topics that it always **creates**. Costs a few cents/month per alarm. Opt out
  with `monitoring: { enabled: false }`.
  - **Get notified** with `monitoring.subscriptions` (endpoint subscriptions
    only, as of `hosting@0.4.0`):
    ```typescript
    import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
    new Hosting(blocksStack, 'Hosting', {
      root, buildCommand: 'npm run build', api: blocksStack,
      monitoring: { subscriptions: [new subs.EmailSubscription('oncall@example.com')] },
    });
    ```
    Each subscription is attached to **every** alarm topic, so one list covers
    all alarms in both regions.
  - **Off-region stacks.** `AWS/CloudFront` metrics publish only in us-east-1,
    so a stack in any other region gets a synthesized
    `<stackName>-CfMonitoring-<addr>` support stack in us-east-1 holding the
    CloudFront 5xx alarm and its own encrypted topic. That stack needs a
    resolved account: set `env: { account, region }`. With an unresolved account
    (single-synth multi-account pipeline) the CloudFront alarm is skipped with a
    synth warning and the other alarms are kept.
  - **Route to an existing / central topic:** there is no prop for that. Use
    the construct attribute:
    `hosting.monitoring?.alarms.forEach((a) => a.addAlarmAction(new cw_actions.SnsAction(myTopic)))`.
  - **Lambda / SQS subscribers:** add them on the regional topic with
    `hosting.monitoring?.alarmTopics[0].addSubscription(...)`. They do not fan
    out to the us-east-1 CloudFront topic.
  - **Removed in `hosting@0.4.0` / `core@0.6.0`:** the `monitoring.snsTopicArn`
    prop and the `hosting.monitoringTopic` attribute. Code using either no longer
    compiles; migrate to `subscriptions` and `hosting.monitoring`
    (`{ alarms, alarmTopics }`).
- **`skewProtection` (default `{ enabled: true }`)** — a cookie (`__dpl`) pins a
  mid-session viewer to the build they started on, preventing asset mismatch
  during a rolling deploy. `maxAge` defaults to 86400s (24h). Keep `maxAge` ≤ the
  build retention window, or a returning viewer can be pinned to a
  lifecycle-deleted build prefix and get a 403.

## SSR edge caching: `ssrDefaultTtl` and the cache key

By default (`ssrDefaultTtl` = 0) SSR responses are not cached at the edge.
Setting `ssrDefaultTtl` above 0 makes an SSR response with no `Cache-Control`
header cacheable and **shared** at CloudFront, which ignores `Vary`. Without a
credential in the cache key, one user's page could be served to another.

As of `hosting@0.4.0` synth **fails closed**: `ssrDefaultTtl > 0` (an unresolved
token counts as `> 0`) throws `SsrCacheKeyCredentialsRequiredError` unless you
set `cacheKeyCookies` and/or `cacheKeyHeaders`:

```typescript
new Hosting(blocksStack, 'Hosting', {
  root, buildCommand: 'npm run build', api: blocksStack, framework: 'nextjs',
  ssrDefaultTtl: cdk.Duration.seconds(60),
  cacheKeyCookies: ['session'],        // your auth cookie name(s)
  cacheKeyHeaders: ['authorization'],  // if clients send bearer tokens
});
```

- At most **8** caller cookies (CloudFront allows 10, 2 are reserved for Next.js
  preview mode); `'accept-encoding'` is rejected as a header (brotli/gzip
  handles it). The caps are only raisable through the L3 `quotas` budget, not
  through this construct's `quotas` prop.
- On a static-only deploy (no SSR compute) the three options do nothing and
  synth warns that they are ignored.
- Compute deploys send every request through one default behavior, so the edge
  router strips the configured cookies and `authorization` on static and image
  routes. Shared assets keep a shared cache entry; SSR routes are keyed per
  credential.
- The guard only covers `ssrDefaultTtl`. A route that sets cookies, or varies
  per user without being in the cache key, must still send
  `Cache-Control: private`.
- To opt out, remove `ssrDefaultTtl` (and keep personalized routes on
  `Cache-Control: private`).

## Other options

- **`buildCache: { enabled: true }`** — provisions (or reuses) an S3 bucket for
  framework build caches (e.g. `.next/cache`), exported as a CfnOutput and set as
  `HOSTING_BUILD_CACHE_BUCKET`; you sync it in CI. Reduces cold-build time.
- **`errorPages: { notFound, serverError }`** — custom 404/500 HTML (paths
  relative to project root, present in build output). Incompatible with SPA
  client-side routing: enabling them disables SPA fallback, which breaks deep
  links. Use for static/SSR only. If the adapter already detected an error page
  (e.g. SPA `404.html` in build output), the prop is ignored to avoid duplicate
  CloudFront error responses.
- **`logging: { enabled: true, retentionDays }`** — CloudFront access logs to a
  dedicated S3 bucket, default 90-day retention.
- **`geoRestriction: { type: 'whitelist' | 'blacklist', countries }`** — CloudFront
  geo restriction by ISO country code.
- **`quotas`** — raise these ONLY to match an AWS quota increase you were actually
  granted; over-setting does not raise the AWS ceiling, it just turns a clear
  synth error into an opaque CloudFormation rollback. `edgeFunctions` default is
  **25** (not 10). `maxRouteChunks` (default 64, ≈1600 route/redirect/header
  entries) is a self-imposed KVS guard, not an AWS quota — raise it only for a
  very large `trailingSlash`-canonicalizing site after measuring edge-function
  headroom.

## `basePath` and Astro subpaths

Set `basePath: '/app'` (leading slash, no trailing) to serve the whole site under
a sub-path; CloudFront behaviors are prefixed and the bare root 308-redirects to
`/app/`. For Nuxt set `app.baseURL`, for Next.js also set `basePath` in
`next.config.js`. The prop is the source of truth and overrides adapter detection.

Do **not** set Astro `build.format: 'file'` to fix subpath routing. Astro's
static output is multi-page and the adapter marks it `spaFallback: false`, so the
CloudFront/KVS edge router already resolves directory indexes (`/about` →
`about/index.html`). The reference test-app (`test-apps/hosting-ssr-astro-default404`)
deploys default `output: 'static'` with no `build.format` and routes correctly.

## What there is NO surface for: VPC

The core `Hosting` construct exposes **no VPC configuration** — there is no `vpc`
prop on `HostingProps` and none on the SSR compute config. `test-apps/vpc-smoke`
is a stub (a package.json, a `.blocks/config.json`, and a `client.js` — no VPC
infrastructure), not a working example. Do not go looking for a VPC option; wiring
the SSR Lambda into a VPC is not a supported first-class feature here.

## Deploy commands

```bash
npm run sandbox           # backend-only ephemeral sandbox — Hosting is NOT built
npm run sandbox:destroy   # tear down the sandbox
npm run deploy            # production deploy — builds the frontend and Hosting
npm run destroy           # tear down the production stack
```

Use the scaffolded scripts, not raw `cdk deploy` — they resolve the stack/sandbox
IDs and CDK context. The scaffolded `index.cdk.ts` is correct as generated; you
rarely edit the `Hosting` block by hand.

## What it provisions

A private S3 bucket (CloudFront OAC only), a CloudFront distribution with the
security-headers policy, the `config.json` deployment, and — as configured — an
SSR Lambda (OpenNext or LWA), image-optimization Lambda, CloudFront Functions /
Lambda@Edge for routing and skew protection, an ACM-backed alias + Route 53
records (custom domain), a WAF WebACL (`waf.enabled`), a build-cache bucket
(`buildCache`), an access-log bucket (`logging`), and CloudWatch alarms + an SNS
topics (`monitoring`, on by default; plus a us-east-1 support stack for the
CloudFront alarm when the app is deployed in another region).

Public members on the construct: `bucket`, `distribution`, `url`, `ssrFunction`
(the SSR Lambda, if any), `buildCacheBucket`, and `monitoring`
(`{ alarms, alarmTopics }`, present when monitoring is enabled).

Related blocks: ApiNamespace is the backend Hosting proxies to; FileBucket is for
user file uploads, which Hosting does not serve.
