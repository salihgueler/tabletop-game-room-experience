# Hosting

Deploy frontend apps to AWS (S3 + CloudFront) with API proxy, custom domains, WAF, and SSR support.

**When to use:** Production deployment of SPA or SSR frontends alongside a Blocks backend. Supports Vite/React/Vue/Angular (SPA) and Next.js/Nuxt (SSR via Lambda Web Adapter + OpenNext).

```typescript
import { Hosting, BlocksStack } from '@aws-blocks/blocks/cdk';
import { join } from 'node:path';

const blocksStack = await BlocksStack.create(app, 'my-app', { /* ... */ });

new Hosting(blocksStack, 'Hosting', {
  root: join(__dirname, '..'),
  buildCommand: 'npm run build',
  api: blocksStack,
});
```

**⚠️ Always use `api: blocksStack`** — sets up CloudFront proxy for `/api/*` and generates `config.json`. The old `apiUrl` string prop was removed in 0.4.0.

## Framework Auto-Detection

Hosting auto-detects from `package.json`:
- Has `next` dependency → `'nextjs'` (SSR via Lambda Web Adapter)
- Has `nuxt` dependency → `'nuxt'` (SSR via OpenNext for Nuxt)
- Has `index.html` in build output → `'spa'` (S3 + CloudFront)
- Otherwise → `'static'`

Override: `framework: 'spa'` if a stray `next` dependency triggers unwanted SSR.

## SSR Deployment (Next.js / Nuxt)

```typescript
new Hosting(blocksStack, 'Hosting', {
  root: join(__dirname, '..'),
  buildCommand: 'npm run build',
  framework: 'nextjs', // or 'nuxt'
  api: blocksStack,
  compute: { memorySize: 1024, timeout: 30 },
});
```

SSR runs via Lambda Web Adapter. `BLOCKS_API_URL` is injected automatically for server components.

**Nuxt local dev** — set `BLOCKS_API_URL` in `nuxt.config.ts` runtimeConfig:
```typescript
export default defineNuxtConfig({ runtimeConfig: { blocksApiUrl: 'http://localhost:3001/api' } });
```

**Next.js local dev** — use concurrently:
```json
{
  "scripts": {
    "dev": "concurrently \"npm:dev:api\" \"npm:dev:next\"",
    "dev:api": "tsx watch aws-blocks/scripts/server.ts",
    "dev:next": "BLOCKS_API_URL=http://localhost:3001/api next dev"
  }
}
```
Server components use `BLOCKS_API_URL` env var. Client components fetch `/.blocks-sandbox/config.json`.

## SPA Fallback Behavior

The `spaFallback` prop explicitly controls whether unknown routes rewrite to `/index.html` (SPA) or return 404 (multi-page static):

- `spaFallback: true` — all extensionless paths rewrite to `/index.html` (for SPAs like React, Vue)
- `spaFallback: false` — unknown paths return 404 (for static multi-page sites like Astro static)
- When omitted, the Hosting construct infers behavior from the framework adapter (backward-compatible)

Multi-page static sites without a custom `404.html` get a **branded default 404 page** (HTTP 404, not raw S3 403 XML). Precedence: user-provided 404 → framework-provided 404 → built-in default 404.

**Atomic redeploys:** S3 asset uploads are now atomic — no gap where old assets are deleted before new ones land. Eliminates the brief 403 window during redeployments.

## Custom Domain + WAF + CSP

```typescript
new Hosting(blocksStack, 'Hosting', {
  root: join(__dirname, '..'),
  buildCommand: 'npm run build',
  api: blocksStack,
  domain: {
    domainName: 'app.example.com',
    certificateArn: 'arn:aws:acm:us-east-1:123456789:certificate/abc-123',
  },
  waf: { enabled: true },
  contentSecurityPolicy:
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.amazonaws.com wss://*.amazonaws.com; img-src 'self' data:;",
});
```

Certificate MUST be in `us-east-1` (CloudFront requirement). CSP does NOT support double wildcards.

**CSP note:** The default CSP blocks external resources. If you use Google Fonts, analytics, or external CDNs, add those origins to `contentSecurityPolicy`. Always include `https://*.amazonaws.com wss://*.amazonaws.com` in `connect-src` if using Realtime (AppSync WebSocket). For apps with user-generated content (markdown images), use `img-src 'self' data: https:`.

## basePath (v0.1.4)

For apps served at a sub-path instead of the domain root:

```typescript
new Hosting(blocksStack, 'Hosting', {
  root: join(__dirname, '..'),
  buildCommand: 'npm run build',
  api: blocksStack,
  basePath: '/app',
});
```

Auto-detects Nuxt `app.baseURL` from `nuxt.config.ts`. For Next.js, also set `basePath` in `next.config.js`.

## Quotas (v0.1.4)

For accounts with raised AWS service quotas, override defaults:

```typescript
new Hosting(blocksStack, 'Hosting', {
  root: join(__dirname, '..'),
  buildCommand: 'npm run build',
  api: blocksStack,
  quotas: {
    cacheBehaviors: 50,    // default: 25
    edgeFunctions: 25,     // default: 10
    headerPolicies: 50,    // default: 20
  },
});
```

## Storage Deployment Override (v0.1.4)

For large static sites that exceed default S3 deployment limits:

```typescript
new Hosting(blocksStack, 'Hosting', {
  root: join(__dirname, '..'),
  buildCommand: 'npm run build',
  api: blocksStack,
  storage: {
    deployment: {
      memoryLimit: 1024,    // MB, for asset bundling Lambda
      ephemeralStorage: 2048, // MB, for large build outputs
    },
  },
});
```

## CloudFront Behaviors and Cache Policies

CloudFront is configured with these default behaviors:

| Path Pattern | Origin | Cache Policy |
|---|---|---|
| `/api/*` | API Gateway | CachingDisabled (proxy) |
| `/_next/static/*` | S3 | CachingOptimized (immutable assets) |
| `/.blocks-sandbox/*` | S3 | CachingDisabled (config) |
| `*` (default) | S3 or Lambda (SSR) | CachingOptimized or CachingDisabled |

For SSR frameworks, the default behavior routes to the Lambda Web Adapter. Static assets (`/_next/static/`, `/assets/`) are served directly from S3 with long-lived cache headers.

## CloudFront Subpath Directory Indexes

Static site generators like Astro produce `/posts/index.html` for a `/posts` route. CloudFront + S3 only resolves `index.html` for the root path (`/`), not subpaths. Requesting `/posts` returns 403/404. For Astro, use `build.format: "file"` in `astro.config.mjs` which generates `/posts.html` instead.

## CORS Handling

- Hosting construct automatically adds the CloudFront domain to `CORS_ALLOWED_ORIGINS` on the Lambda
- In sandbox mode, `http://localhost:*` patterns are auto-preserved for local frontend dev
- For additional origins (e.g. staging domains), set `CORS_ALLOWED_ORIGINS` env var with comma-separated regex patterns

## All Options

| Option | Type | Description |
|---|---|---|
| `root` | string | Path to frontend app root |
| `buildCommand` | string | Build command (e.g., `'npm run build'`) |
| `framework` | `'nextjs' \| 'nuxt' \| 'spa'` | Auto-detected if omitted |
| `buildOutputDir` | string | Output directory (auto-detected) |
| `api` | BlocksStackApi | **Required.** BlocksStack instance — enables API proxy via CloudFront |
| `basePath` | string | Sub-path prefix (e.g., `'/app'`). Auto-detects Nuxt `app.baseURL` |
| `backendConfig` | Record<string, unknown> | Extra keys in config.json (⚠️ publicly accessible) |
| `compute` | ComputeConfig | SSR Lambda config (memorySize, timeout) |
| `spaFallback` | boolean | Explicit SPA fallback (true=rewrite to index.html, false=404) |
| `domain` | HostingDomainConfig | Custom domain (domainName, hostedZone, certificate) |
| `waf` | HostingWafConfig | WAF protection (enabled, rateLimit) |
| `contentSecurityPolicy` | string | Custom CSP header |
| `quotas` | QuotasConfig | Override default service quotas (cacheBehaviors, edgeFunctions, headerPolicies) |
| `storage` | StorageConfig | Override deployment storage limits (memoryLimit, ephemeralStorage) |
| `retainOnDelete` | boolean | Keep S3 bucket on stack deletion |
| `priceClass` | PriceClass | CloudFront price class (default PRICE_CLASS_100) |

## Framework-Specific Notes

### TanStack Start (NOT supported)

TanStack Start is an SSR framework **NOT supported** by Hosting. If your app uses TanStack Start but all data fetching is client-side, convert to a standard Vite + React SPA:
1. Replace TanStack Start config with standard Vite + `@vitejs/plugin-react`
2. Add `index.html` and `src/main.tsx` as SPA entry points
3. Remove SSR-specific code (`HeadContent`, `Scripts`, `shellComponent`)
4. Set `framework: "spa"` in Hosting

TanStack Router (client-side routing) works fine — only Start's SSR layer is incompatible.

### Angular

Angular's `ng serve` doesn't serve `.blocks-sandbox/config.json`. Fix: add as static asset in `angular.json` and/or use `proxy.conf.json` to forward requests to Blocks dev server.

### Astro

- Use `client:only="react"` (NOT `client:load`) for React islands importing `aws-blocks`
- Use `build.format: "file"` — CloudFront doesn't resolve subpath directory indexes
- React components passed as Astro slot children lose interactivity; compose within the same island

## Deploy Commands

```bash
npm run sandbox          # Deploy ephemeral sandbox (backend only, no Hosting)
npm run sandbox:destroy  # Tear down sandbox
npm run deploy           # Production deploy with Hosting (S3 + CloudFront)
```

Do NOT run `cdk deploy` directly — use the scaffolded scripts which handle sandbox IDs, removal policies, and CDK context.

## Key Facts

- Hosting is **disabled in sandbox mode** (backend-only). Only active in production deploys (`npm run deploy`).
- CORS is auto-handled — CloudFront domain auto-added to `CORS_ALLOWED_ORIGINS`.
- `config.json` is generated at `/.blocks-sandbox/config.json` with the API URL for frontend client discovery.
- Do NOT write your own `index.cdk.ts` — the scaffolder generates it correctly.

Local mock: N/A (Hosting is deploy-time only). AWS: S3 + CloudFront + Lambda (SSR).
