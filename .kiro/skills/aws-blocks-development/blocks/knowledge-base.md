# KnowledgeBase

RAG (Retrieval-Augmented Generation) over documents with vector embeddings.

```typescript
const kb = new KnowledgeBase(scope, "docs", {
  source: "./knowledge",           // local folder synced to S3
  chunking: { strategy: "semantic" },
  embeddingDimensions: 1024,
  description: "Product documentation",
});

// Retrieve relevant chunks
const results = await kb.retrieve("How do I reset my password?", {
  maxResults: 5,
  filter: { folder: { equals: "faq" } },
});

for (const result of results) {
  console.log(result.text);   // chunk content
  console.log(result.score);  // 0.0–1.0 relevance
  console.log(result.source); // "faq/password-reset.md"
  console.log(result.metadata); // { folder: "faq", ... }
}
```

**KnowledgeBaseOptions:**
- `source` — local folder path or `s3://bucket` URI
- `chunking` — `{ strategy: 'semantic' | 'fixed' | 'hierarchical' | 'none' | 'sliding-window' | 'document' | 'paragraph', chunkSize?, chunkOverlap?, breakpointPercentile? }`
- `embeddingDimensions` — `256 | 512 | 1024` (default: 1024)
- `description` — human-readable description

**Chunking strategies (local dev):**
- `sliding-window` — overlapping word-count windows (`chunkSize` / `chunkOverlap`). Overlap is clamped to a safe range; trailing short window is always emitted
- `document` — keeps each document whole (no splitting)
- `paragraph` — splits on paragraph boundaries (blank lines)
- `chunkOverlap` is interpreted as a **percentage** of `chunkSize` in both local and production (CDK maps to Bedrock's 1–99 range)

**RetrieveOptions:**
- `maxResults` — 1–100 (default: 10)
- `filter` — metadata filter with AND semantics: `{ key: { equals: value } }`

**RetrieveResult:** `{ text, score, source, metadata }`

Local mock: TF-IDF search over local files with Unicode-aware tokenization. AWS: Bedrock Knowledge Base + OpenSearch Serverless.

**Source path requirements:**
- Source paths must be **relative** and resolve inside the project directory
- Absolute paths (POSIX `/`, UNC `\\`, drive-letter `C:\`) are rejected
- Symlinks that escape the project directory are rejected
- A source resolving to the project root itself emits a warning (recommends a dedicated docs subfolder)

**Cache invalidation:** The local implementation computes a SHA-256 hash over source files (paths, sizes, mtimes) plus chunking config. Cache is reused only when hash matches — editing documents, adding/removing files, or changing chunking config triggers a rebuild. Stale cache is never served; a deleted source folder surfaces a clear error.

**Metadata filter behavior:** When a metadata filter is supplied locally, all chunks are scored before filtering (no silent truncation). Note: an unknown/invalid filter key is rejected server-side in production but matches nothing locally.

**Unicode & CJK support:** The TF-IDF tokenizer NFD-normalizes text, strips combining diacritics (so `café` matches `cafe`), uses Unicode letter/number character classes, and extracts CJK bigrams with single-character fallback for isolated ideographs.

**Error mapping (AWS):**
- Filter-related `ValidationException` → `FilterException`
- Non-filter validation (query length, malformed request, content-safety) → `RetrievalException`
- `ThrottlingException` → `ThrottlingException`
- Unknown SDK errors → `RetrievalException` (original SDK message preserved; SDK error attached as non-enumerable `cause`)

**Ingestion sync (v0.2.0+):**

After deploy, Bedrock ingestion runs asynchronously — `retrieve()` returns empty during the sync window. Use these methods to check freshness:

```typescript
// Check if data is synced
const synced = await kb.isSynced(); // true once latest ingestion is COMPLETE

// Wait until synced (with timeout)
await kb.waitUntilSynced({
  timeoutMs: 300_000,       // 5 min default
  pollIntervalMs: 5_000,    // 5s default (±20% jitter)
  signal: abortController.signal, // optional AbortSignal
});

// Now retrieve() reflects the latest data
const results = await kb.retrieve("query");
```

- `isSynced()` — `true` once latest ingestion job is `COMPLETE`. Throws `IngestionFailedException` if job failed.
- `waitUntilSynced(options?)` — polls until synced. Throws `KnowledgeBaseTimeoutException` on timeout.
- Tolerates transient errors (throttling, not-yet-visible KB) up to `maxConsecutiveTransientErrors` (default: 3).
- Local mock: always reports synced immediately (no async ingestion in local dev).
- `retrieve()` is always callable — serves prior synced snapshot during re-ingestion.
