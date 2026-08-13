# FileBucket

**When to use:** Storing and serving files — user uploads, images, documents, static assets, any binary data with presigned URL access.

**When NOT to use:** Structured data (use DistributedTable). Small config values (use AppSetting/KVStore). Hosting static site assets (use Hosting — it handles S3 internally).

File storage with presigned URLs for upload/download.

```typescript
const bucket = new FileBucket(scope, "uploads", {
  versioned: false,
  corsRules: [{ allowedOrigins: ["*"], allowedMethods: ["GET", "PUT"] }],
  lifecycleRules: [{ prefix: "tmp/", expirationDays: 7 }],
});

// Server-side operations
await bucket.put("photos/cat.jpg", buffer, { contentType: "image/jpeg" });
const file = await bucket.get("photos/cat.jpg"); // { body: Buffer, contentType, metadata, size }
await bucket.delete("photos/cat.jpg");

// Presigned URLs (return to frontend for direct S3 access)
const downloadHandle = await bucket.getFileHandle("photos/cat.jpg", { expiresIn: 3600 });
const uploadHandle = await bucket.getPutUrl("photos/new.jpg", { contentType: "image/jpeg" });

// Short-form aliases (equivalent):
const downloadUrl = await bucket.getUrl("photos/cat.jpg", { expiresIn: 3600 });  // returns URL string
const uploadUrl = await bucket.putUrl("photos/new.jpg", { contentType: "image/jpeg" }); // returns URL string
// getFileHandle/getPutUrl return handle objects; getUrl/putUrl return raw URL strings.

// List files
const files = await bucket.scan({ prefix: "photos/" }); // FileInfo[]

// Versioned bucket
const vBucket = new FileBucket(scope, "docs", { versioned: true });
const versions = await vBucket.listVersions("report.pdf"); // FileVersionInfo[]
await vBucket.get("report.pdf", { versionId: "v1" });
```

**Frontend (using returned handles):**

```typescript
const handle = await api.getUploadUrl("photo.jpg");
await handle.upload(file); // uses presigned URL

const download = await api.getPhoto("photo.jpg");
const blob = await download.download();
```

Local mock: Files on disk in `.bb-data/`. AWS: S3.


## What It Provisions

- S3 bucket with configured access policies
- Lambda function for presigned URL generation
- IAM roles for S3 access
- Optional: CloudFront distribution for CDN

## See Also

- [hosting](./hosting.md) — Static site assets are handled by Hosting, not FileBucket
- [knowledge-base](./knowledge-base.md) — Document ingestion from FileBucket for RAG
- [async-job](./async-job.md) — Process uploaded files in background