# FileBucket

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
