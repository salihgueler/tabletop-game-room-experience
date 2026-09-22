# KnowledgeBase

RAG (Retrieval-Augmented Generation) over your own documents: point it at a
folder, query with natural language, get back ranked chunks. Backed by Amazon
Bedrock Knowledge Bases with an **S3 Vectors** store (serverless, scales to
zero — no idle cost).

**When to use:** semantic search over documents — FAQs, product guides, support
articles, internal wikis; context retrieval for an AI feature; document Q&A.

**When NOT to use:** a full conversational agent (use the Agent block with a
KnowledgeBase wired in as a tool — see the Agent block); structured key-value
lookups (KVStore); relational queries (Database); pure keyword/full-text search
with no semantic understanding (roll your own over DistributedTable).

Import `KnowledgeBase` and `KnowledgeBaseErrors` from `@aws-blocks/blocks` (both
are re-exported from the umbrella; `WaitUntilSyncedOptions` is too). The block is
**server-side only** — constructing it in the browser throws
`BrowserNotSupportedException`.

## Contents

- Minimal example
- `KnowledgeBaseOptions`
- Chunking — the four real strategies
- `retrieve()` and results
- Metadata filtering and the `.metadata.json` sidecar convention
- Ingestion sync — `isSynced()` / `waitUntilSynced()`
- Local development — it genuinely works, no AWS needed
- Error handling
- What it provisions

## Minimal example

```typescript
import { KnowledgeBase } from '@aws-blocks/blocks';

const kb = new KnowledgeBase(scope, 'docs', {
  source: './knowledge',              // local folder synced to S3 on deploy
  chunking: { strategy: 'semantic' },
  embeddingDimensions: 1024,
  description: 'Product documentation',
});

const results = await kb.retrieve('How do I reset my password?', {
  maxResults: 5,
  filter: { folder: { equals: 'faq' } },
});

for (const r of results) {
  console.log(r.text);      // chunk content
  console.log(r.score);     // 0.0–1.0 relevance
  console.log(r.source);    // "faq/password-reset.md"
  console.log(r.metadata);  // { folder: "faq", ... }
}
```

## `KnowledgeBaseOptions`

```typescript
interface KnowledgeBaseOptions {
  source: string;                             // required
  chunking?: ChunkingConfig;                  // default { strategy: 'semantic' }
  embeddingDimensions?: 256 | 512 | 1024;     // default 1024
  description?: string;
  removalPolicy?: 'destroy' | 'retain';       // default: stack `defaults`
  logger?: ChildLogger;
}
```

- `source` — a local folder path (`'./knowledge'`) or an `s3://bucket[/prefix]`
  URI. A folder is synced to S3 on deploy and its subfolders auto-populate the
  `folder` metadata key (see below). An `s3://` URI imports an existing bucket:
  no `BucketDeployment` runs, so your documents must already be there; an
  optional path prefix narrows what Bedrock ingests. `s3://` sources are **not
  supported in local dev** — use a folder path there.
- `embeddingDimensions` — Titan V2 Matryoshka output width. Smaller is cheaper
  and smaller storage; larger is more accurate. 1024 is full fidelity; 256 is
  viable for cost-sensitive workloads.
- `removalPolicy` — CDK teardown behavior for the **BB-created** data bucket
  (imported `s3://` sources are unaffected). Omitted → stack `defaults`
  (`production` → RETAIN, `sandbox` → DESTROY). `'destroy'` also enables
  `autoDeleteObjects` and drops the S3 Vectors bucket/index alongside the data
  bucket, so a sandbox teardown fully cleans up. Relying only on a stack-level
  `RemovalPolicies.of(stack).destroy()` aspect will stall on `BucketNotEmpty` —
  that aspect cannot enable `autoDeleteObjects`, so pass `removalPolicy:
  'destroy'` (or run in sandbox) for a clean teardown.

## Chunking — the four real strategies

`ChunkingStrategy` is **exactly** `'semantic' | 'fixed' | 'hierarchical' |
'none'`. There are no other accepted values — passing anything else is a type
error.

```typescript
interface ChunkingConfig {
  strategy?: ChunkingStrategy;   // default 'semantic'
  chunkSize?: number;            // 'fixed' only, default 300 (max tokens/chunk)
  chunkOverlap?: number;         // 'fixed' only, default 20 — a PERCENTAGE (0–100)
  breakpointPercentile?: number; // 'semantic' only, default 95
}
```

| Strategy | Behavior |
|---|---|
| `'semantic'` (default) | Splits at topic boundaries via breakpoint detection. `breakpointPercentile` (default 95) tunes granularity — higher = fewer, larger chunks. |
| `'fixed'` | Fixed-size chunks. `chunkSize` (max tokens, default 300) and `chunkOverlap`. |
| `'hierarchical'` | Two levels — parent 1500 tokens, child 300, 60-token overlap. |
| `'none'` | Each document is a single chunk. |

`chunkOverlap` is a **percentage of `chunkSize`**, not a token count, and it
transfers directly between environments: the local mock overlaps by `chunkSize ×
chunkOverlap / 100` words, and the CDK layer maps it to Bedrock's
`overlapPercentage` (Bedrock accepts 1–99; the mock also accepts 0). Options that
don't apply to the chosen strategy are silently ignored.

## `retrieve()` and results

```typescript
retrieve(query: string, options?: RetrieveOptions): Promise<RetrieveResult[]>

interface RetrieveOptions {
  maxResults?: number;      // finite integer clamped to 1–100, default 10; non-integer throws
  filter?: MetadataFilter;
}

interface RetrieveResult {
  text: string;             // chunk content
  score: number;            // relevance 0.0–1.0
  source: string;           // source path (relative to root) or URL
  metadata: Record<string, string>;  // includes auto-populated `folder`
}
```

`maxResults` is normalized by `normalizeMaxResults`: a **finite integer** is clamped
to the range **1–100** (`Math.min(Math.max(n, 1), 100)`), and `undefined`/`null`
falls back to the default **10**. Any **non-integer** value (`1.5`, `NaN`,
`Infinity`) — which slips in when the option is built from a query string or
untyped JSON — is **rejected**, throwing `KnowledgeBaseValidationError`
(`KnowledgeBaseErrors.ValidationError`) on both the mock and AWS runtimes rather
than being silently coerced. So only finite integers clamp; fractional and
non-finite values throw.

`retrieve()` is always callable. After an initial deploy it returns an empty
array until the first ingestion job completes; once at least one job has
completed it always serves the most recent synced snapshot, even while a later
re-ingestion is in flight.

## Metadata filtering and the `.metadata.json` sidecar convention

```typescript
type MetadataFilter = Record<string, { equals: string }>;
```

Filters use **AND** semantics — every condition must match — and only the
`equals` comparator ships today. **Filter values must be strings** (the type is
`Record<string, { equals: string }>`), so a numeric or boolean attribute has to
be stored and matched as a string.

```typescript
await kb.retrieve('pricing', {
  filter: { folder: { equals: 'products' }, category: { equals: 'enterprise' } },
});
```

**Folder metadata is automatic.** A file at `./knowledge/faq/billing.md` gets
`metadata.folder = 'faq'` (the top-level subfolder name), so `filter: { folder:
{ equals: 'faq' } }` works with no setup. Documents at the source root get no
`folder` key (nothing to derive).

**Sidecar files for custom metadata.** To attach your own attributes, drop a
`<document>.metadata.json` sidecar next to the document, in Bedrock's metadata
format:

```json
{
  "metadataAttributes": {
    "category": { "value": { "type": "STRING", "stringValue": "enterprise" } }
  }
}
```

Two things to know, both load-bearing:

- **A sidecar you provide REPLACES the auto-generated `folder` key** for that
  document — it is not merged. During synth the block only generates a `folder`
  sidecar for documents that don't already have one, so if you write your own
  sidecar and still want folder filtering, include the `folder` attribute in it
  yourself.
- Sidecars are only read on the AWS/Bedrock path and by the mock; they are keyed
  to the document by filename (`billing.md` → `billing.md.metadata.json`).

## Ingestion sync — `isSynced()` / `waitUntilSynced()`

Bedrock ingestion runs asynchronously after deploy (fire-and-forget), so there
is a window where `retrieve()` returns empty for queries that will later match.
These methods gate on ingestion completion and track *freshness*, not
availability.

```typescript
isSynced(): Promise<boolean>
waitUntilSynced(options?: WaitUntilSyncedOptions): Promise<void>

interface WaitUntilSyncedOptions {
  timeoutMs?: number;                    // default 300_000 (5 min)
  pollIntervalMs?: number;               // default 5_000, ±20% jitter, min 1ms
  maxConsecutiveTransientErrors?: number;// default 3, min 0
  signal?: AbortSignal;                  // cancel the wait
}
```

```typescript
await kb.waitUntilSynced({ timeoutMs: 600_000 });
const results = await kb.retrieve('getting started');

// or cancel with a deadline
await kb.waitUntilSynced({ signal: AbortSignal.timeout(120_000) });
```

- `isSynced()` → `true` once the data source's most recent ingestion job is
  `COMPLETE`. Throws `IngestionFailedException` (with `failureReasons`) if the
  job failed. After `COMPLETE`, newly-written embeddings can take a few minutes
  to become fully queryable (S3 Vectors propagation lag).
- `waitUntilSynced()` polls until synced, throwing `KnowledgeBaseTimeoutException`
  on timeout. It rides out up to `maxConsecutiveTransientErrors` *consecutive*
  transient control-plane errors (throttling/network, and a not-yet-visible KB
  returning `ResourceNotFoundException` in the post-deploy window); the counter
  resets on any clean poll. Terminal errors short-circuit immediately: a
  `FAILED` job, and a missing `KB_ID` config.
- Both local-folder and imported `s3://` sources register a BB-managed data
  source, so sync is tracked in both cases. The only "synced immediately without
  checking a job" case is a deployment that predates this API (no
  `DATA_SOURCE_ID` injected) — re-deploy to restore real tracking.

## Local development — it genuinely works, no AWS needed

This is a full local implementation, not an AWS-only stub. In local dev the
block reads documents from the source folder, chunks them, and scores with a
**TF-IDF** index (term frequency–inverse document frequency) — keyword-based, not
real embeddings. The API contract (signatures, error types, result shape) is
identical to AWS.

- **`isSynced()` always returns `true` and `waitUntilSynced()` resolves
  immediately** locally — there is no async ingestion to wait on. (Caveat: this
  is unconditional, so a `true` here does *not* imply a working `retrieve()` for
  an `s3://` source, which the mock rejects — the inverse of the production
  contract. Validate `s3://` sources in sandbox/production.)
- Scores are relative within the mock and won't match Bedrock's exactly.
- The tokenizer is Unicode-aware: accents are normalized (`résumé` matches
  `resume`) and CJK text is matched via character bigrams.
- Chunking is approximated: `'fixed'` uses word-count windows, `'none'` keeps
  each document whole, and `'semantic'`/`'hierarchical'` split on paragraphs.
- Metadata filtering uses the same `equals`/AND semantics. One asymmetry: an
  unknown/invalid filter key is rejected server-side in production
  (`InvalidFilterException`) but silently matches nothing locally.
- Chunks cache to `.bb-data/{fullId}/chunks.json`, keyed on source contents +
  chunking config; the cache rebuilds when documents or config change. Wipe with
  `rm -rf .bb-data`.
- Supported formats locally: `.md`, `.txt`, `.html`, `.htm`, `.csv`, `.json`.
  Binary formats (`.pdf`, `.doc(x)`, `.xls(x)`) are skipped locally but parsed on
  AWS.
- `source` must be a relative path inside the project; absolute paths and paths
  escaping the project via `..` are rejected with `InvalidSourceConfigException`.

## Error handling

Catch with `isBlocksError(e, KnowledgeBaseErrors.X)`. The full set:

| Constant | Name | When |
|---|---|---|
| `RetrievalFailed` | `RetrievalFailedException` | Bedrock retrieval call failed (network, outage, unrecognized SDK error) |
| `NotReady` | `KnowledgeBaseNotReadyException` | KB not deployed, or `KB_ID` env var missing — run `cdk deploy` first |
| `InvalidSource` | `InvalidSourceConfigException` | Source folder not found, or source invalid for the current runtime (e.g. `s3://` locally) |
| `InvalidFilter` | `InvalidFilterException` | Invalid metadata filter key/structure in the Bedrock query |
| `ValidationError` | `KnowledgeBaseValidationError` | Query validation — empty/whitespace-only query, or a non-integer `maxResults` (`1.5`/`NaN`/`Infinity`) |
| `BrowserNotSupported` | `BrowserNotSupportedException` | Used in a browser context (server-side only) |
| `IngestionFailed` | `IngestionFailedException` | Latest ingestion job failed (message includes `failureReasons`) — thrown by `isSynced()` / `waitUntilSynced()` |
| `Timeout` | `KnowledgeBaseTimeoutException` | `waitUntilSynced()` exceeded its timeout |

```typescript
import { isBlocksError } from '@aws-blocks/core';
import { KnowledgeBaseErrors } from '@aws-blocks/blocks';

try {
  const results = await kb.retrieve('query');
} catch (e: unknown) {
  if (isBlocksError(e, KnowledgeBaseErrors.NotReady)) { /* not yet ingested */ }
  if (isBlocksError(e, KnowledgeBaseErrors.ValidationError)) { /* empty query */ }
  throw e;
}
```

## What it provisions

- **S3 data bucket** — stores source documents (created new for a folder source;
  imported for an `s3://` source). Block-public-access on, SSE-S3, `enforceSSL`.
- **S3 Vectors vector bucket + index** (`AWS::S3Vectors::VectorBucket` +
  `CfnIndex`) — the serverless vector store, `float32` / cosine / configurable
  dimensions. This is **not** OpenSearch Serverless: S3 Vectors has no idle
  floor and scales to zero, whereas OpenSearch Serverless carries a ~$700/month
  baseline. That difference is the whole reason this block fits the "no idle
  cost" model — do not cost a RAG design as if it ran on OpenSearch.
- **IAM role** assumed by `bedrock.amazonaws.com` (scoped via `aws:SourceAccount`)
  — S3 read on the data bucket, S3 Vectors CRUD, `bedrock:InvokeModel` on Titan
  Text Embeddings V2.
- **Bedrock `CfnKnowledgeBase`** (VECTOR type, Titan V2) + **`CfnDataSource`**
  (chunking config; `inclusionPrefixes` for `s3://` prefixes).
- **BucketDeployment** — syncs the local folder to S3 (folder source only),
  layering auto-generated `.metadata.json` sidecars on top.
- **AwsCustomResource** — fires `StartIngestionJob` on create/update
  (fire-and-forget).
- Handler grants: `bedrock:Retrieve`, `bedrock:GetIngestionJob`,
  `bedrock:ListIngestionJobs` on the KB ARN.
