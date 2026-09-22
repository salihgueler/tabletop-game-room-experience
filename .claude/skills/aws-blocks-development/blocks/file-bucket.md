# FileBucket

File storage backed by Amazon S3, with presigned URLs for direct browser
upload/download, batch delete, prefix-scoped listing, and optional versioning.

**Use it for** user uploads, generated reports, images, videos, any binary blob.

**Don't use it for** structured key-value data (KVStore), queryable records with
indexes (DistributedTable), or serving a static site (Hosting handles S3 itself).

## Contents

- Import
- Construct and options
- Server-side operations
- Presigned URLs and browser handles
- Listing — `scan()` is an async iterable
- Versioning
- Wrapping an existing bucket
- Errors
- Local mock vs AWS
- What it provisions

## Import

```typescript
import { FileBucket, FileBucketErrors } from '@aws-blocks/bb-file-bucket';
// FileBucket + FileBucketErrors are also re-exported from '@aws-blocks/blocks'.
```

## Construct and options

```typescript
const bucket = new FileBucket(scope, 'uploads', {
  versioned: false,                                                  // default
  corsRules: [{
    allowedOrigins: ['*'],
    allowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],        // POST is supported
    allowedHeaders: ['*'],                                           // optional
    exposedHeaders: ['ETag'],                                        // optional
    maxAge: 3000,                                                    // optional, seconds
  }],
  lifecycleRules: [{ prefix: 'tmp/', expirationDays: 7, transitionToIaDays: 30 }],
  removalPolicy: 'retain',                                           // 'destroy' for sandbox
});
```

`FileBucketOptions`: `versioned?`, `corsRules?`, `lifecycleRules?`, `logger?`,
`bucket?` (an `ExternalBucketRef`), `removalPolicy?: 'destroy' | 'retain'`.
`removalPolicy` defaults to CDK's RETAIN; `'destroy'` also enables
`autoDeleteObjects` so teardown can empty the bucket first. Ignored by the mock.

`CorsRule`: `allowedOrigins: string[]` and `allowedMethods` (any of
`'GET' | 'PUT' | 'POST' | 'DELETE' | 'HEAD'`) are required; `allowedHeaders?`,
`exposedHeaders?` (both `string[]`) and `maxAge?` (number, seconds) are optional.

`LifecycleRule`: `prefix?`, `expirationDays?` (days after creation to expire),
and `transitionToIaDays?` (days after creation to transition to S3 Infrequent
Access) — all optional.

## Server-side operations

```typescript
await bucket.put('photos/cat.jpg', buffer, {
  contentType: 'image/jpeg',
  metadata: { owner: 'user-1', album: 'cats' },   // custom x-amz-meta-* pairs
  cacheControl: 'public, max-age=31536000',        // Cache-Control header
});

const file = await bucket.get('photos/cat.jpg'); // FileContent | null
if (!file) return null;                          // get() returns null for a missing key
// file: { body: Buffer, contentType: string, metadata: Record<string,string>, size: number }

await bucket.delete('photos/cat.jpg');           // no-op if absent
await bucket.deleteBatch(paths);                 // auto-chunks at 1,000 keys per S3 call
```

`PutOptions`: `contentType?`, `metadata?` (`Record<string, string>` of custom
metadata), `cacheControl?` (the `Cache-Control` header value) — all optional.

`get()` does **not** throw for a missing key — it returns `null`. There is no
`deleteMany`; the bulk method is `deleteBatch(paths: string[])`.

## Presigned URLs and browser handles

```typescript
// Raw URL strings:
const downloadUrl = await bucket.getUrl('photos/cat.jpg', { expiresIn: 3600 });
const uploadUrl   = await bucket.putUrl('photos/new.jpg', { contentType: 'image/jpeg' });

// Typed handles — return these from an API method for the frontend:
const downloadHandle = await bucket.getFileHandle('photos/cat.jpg', { expiresIn: 3600 });
const uploadHandle   = await bucket.createUploadHandle('photos/new.jpg', { contentType: 'image/jpeg' });
```

`getUrl`/`putUrl` return a URL string; `getFileHandle`/`createUploadHandle`
return handle objects that serialize over the wire and expose typed
`download()` / `upload(body)` on the client. There is no `getPutUrl` method —
the upload-handle method is `createUploadHandle(path, options?)`.

Frontend:

```typescript
const handle = await api.getUploadUrl('photo.jpg');   // FileUploadClient
await handle.upload(file);                            // Blob | File | ArrayBuffer

const download = await api.getPhoto('photo.jpg');     // FileDownloadClient
const blob = await download.download();
```

## Listing — `scan()` is an async iterable

`scan(options?)` returns `AsyncIterable<FileInfo>`, not an array. Consume it with
`for await`; it paginates S3 transparently.

```typescript
const files: FileInfo[] = [];
for await (const file of bucket.scan({ prefix: 'photos/' })) {
  files.push(file); // { path, size, lastModified }
}
```

## Versioning

Only on `{ versioned: true }` buckets, where `get`/`getUrl`/`delete` accept a
`{ versionId }` option.

```typescript
const docs = new FileBucket(scope, 'docs', { versioned: true });
const versions = await docs.listVersions('report.pdf'); // FileVersionInfo[], newest first
await docs.get('report.pdf', { versionId: versions[1].versionId });
await docs.restoreVersion('report.pdf', versions[1].versionId);
```

## Wrapping an existing bucket

```typescript
const bucket = new FileBucket(scope, 'legacy', {
  bucket: FileBucket.fromExisting('my-existing-bucket'),
});
```

`FileBucket.fromExisting(bucketName)` is a static that returns an
`ExternalBucketRef` for the `bucket` option — it does not construct a block.

## Errors

Match with `isBlocksError` from `@aws-blocks/core`.

| Constant | `error.name` | Cause |
|---|---|---|
| `FileBucketErrors.FileNotFound` | `NoSuchKey` | Surfaced by other operations (e.g. `restoreVersion` on a missing version). **Not** thrown by `get()`, which returns `null`. |
| `FileBucketErrors.FileTooLarge` | `EntityTooLarge` | Object exceeds S3 size limits. |

## Local mock vs AWS

Local: files on disk under `.bb-data/{fullId}/`; presigned URLs served by the
dev server; versioning supported; CORS and lifecycle rules have no local effect.
AWS: S3, presigned via `@aws-sdk/s3-request-presigner`.

If a key segment can contain URL-shaped characters (e.g. an OIDC `userId` like
`https://issuer:sub`), wrap it in `encodeURIComponent()` — the mock normalizes
`//` via the filesystem, so an un-encoded `//` makes local `scan({ prefix })`
miss the file even though it works against S3.

## What it provisions

- S3 bucket with the configured CORS, lifecycle, and removal policy
- Presigned-URL generation via the shared Blocks handler Lambda
- IAM grants on the shared execution role for S3 access
