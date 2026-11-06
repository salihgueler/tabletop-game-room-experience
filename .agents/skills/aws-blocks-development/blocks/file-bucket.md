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
- Key rules
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
  versioned: true,                                                   // default
  corsRules: [{
    allowedOrigins: ['https://app.example.com'],                     // your frontend origin
    allowedMethods: ['GET', 'PUT'],
    allowedHeaders: ['Content-Type'],                                // optional
    exposedHeaders: ['ETag'],                                        // optional
    maxAge: 3000,                                                    // optional, seconds
  }],
  lifecycleRules: [{ prefix: 'tmp/', expirationDays: 7, transitionToIaDays: 30 }],
  removalPolicy: 'retain',                                           // 'destroy' for sandbox
});
```

`FileBucketOptions`: `versioned?` (default `true`; opt out with the literal
`false`), `corsRules?`, `lifecycleRules?`, `accessLogging?`, `encryption?`,
`objectLock?`, `noncurrentVersionExpirationDays?` (default `90`), `bucket?` (an
`ExternalBucketRef`), `removalPolicy?: 'destroy' | 'retain'`, `logger?`.
`removalPolicy` defaults to CDK's RETAIN; `'destroy'` also enables
`autoDeleteObjects` so teardown can empty the bucket first. Ignored by the mock.

**CORS is required for browser uploads and downloads.** The deployed bucket has
no CORS configuration unless you set `corsRules`, and it does **not** inherit
`defaults.allowedOrigins` or the Hosting domain. Without it, presigned
uploads/downloads that worked under `npm run dev` (the local file server accepts
any origin) fail after deploy with `No 'Access-Control-Allow-Origin' header is
present on the requested resource`. List the deployed frontend origin (the
`HostingUrl` stack output) in `allowedOrigins`. A wildcard origin combined with a
mutating method is rejected at synth. `corsRules` is ignored for a wrapped bucket.

### Encryption (`bb-file-bucket@0.4.0`)

`encryption` takes the same values as `KVStore` and `DistributedTable`:

- `'aws-managed'` (default): SSE-S3.
- `'customer-managed'`: a dedicated KMS key for this bucket, rotation on, that
  follows the bucket's removal policy.
- `FileBucket.fromKmsKey(keyArn)`: an existing KMS key you own. Its key policy
  must delegate to IAM, because Blocks grants the runtime role `kms:Decrypt` /
  `kms:GenerateDataKey*` through IAM.

Both KMS options turn on S3 Bucket Keys, and presigned URLs keep working because
the runtime role holds the key permissions. The access-log bucket always uses
SSE-S3. The key reference type is re-exported from the umbrella as
`FBExternalKmsKeyRef`.

### Object Lock (`bb-file-bucket@0.4.0`)

```typescript
new FileBucket(scope, 'audit-exports', {
  objectLock: { mode: 'governance', retentionDays: 365 },   // ObjectLockOptions
  removalPolicy: 'retain',                                  // required, see below
});
```

- `mode: 'governance'` lets principals with `s3:BypassGovernanceRetention`
  shorten retention or delete a locked version. `mode: 'compliance'` lets nobody,
  including the root user, do so until retention expires.
- `retentionDays` is a positive integer up to 36500.
- Synth rejects `versioned: false` and a `'destroy'` removal policy, **including
  the sandbox preset's default**. Pass `removalPolicy: 'retain'` to use Object
  Lock in a sandbox.
- Decide at creation. Adding `objectLock` to a deployed bucket fails the deploy
  (use a new FileBucket id), and S3 can't turn it off later.
- `delete(path)` still works (it adds a delete marker); deleting a locked
  version with `{ versionId }` fails until retention expires.
- **No presigned uploads.** S3 needs a signed checksum on every upload to such a
  bucket. `putUrl()` and `createUploadHandle()` throw
  `FileBucketErrors.PresignedUploadUnsupported`; upload with server-side `put()`.
  Downloads are unaffected.
- The mock validates the option and rejects presigned uploads but does not
  enforce retention.

`encryption` and `objectLock` are ignored, with a synth warning, on a bucket
wrapped with `FileBucket.fromExisting`.

### Access logging

`accessLogging: true` ships S3 server access logs to a dedicated log bucket. When
omitted it resolves from `defaults.storageAccessLogging` (new in `core@0.8.0`,
unset in both presets), then from `defaults.accessLogging`. Set
`storageAccessLogging` to turn S3 access logs on or off for every `FileBucket`
without changing API Gateway access logging.

Long derived bucket names (over S3's 63 characters, from a long stack name or
deep scope ids) no longer fail synth as of `0.9.0`: they are shortened to a
prefix plus `-` and an 8-character hash. Names that already fit are unchanged.

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

Versioning is on by default. On a versioned bucket `get`/`getUrl`/`delete`
accept a `{ versionId }` option; the literal `versioned: false` drops it.

```typescript
const docs = new FileBucket(scope, 'docs', { versioned: true });
const versions = await docs.listVersions('report.pdf'); // FileVersionInfo[], newest first
await docs.get('report.pdf', { versionId: versions[1].versionId });
await docs.restoreVersion('report.pdf', versions[1].versionId);
```

An unknown `versionId` behaves the same locally and on AWS (`bb-file-bucket@0.3.0`):
`get()` returns `null`, `delete()` is a silent no-op, and `restoreVersion()`
throws `FileBucketErrors.VersionNotFound` (`NoSuchVersion`). Before 0.3.0 the AWS
runtime threw raw S3 `InvalidArgument` / `InvalidRequest` errors instead.

## Key rules

As of `bb-file-bucket@0.3.0` keys are validated identically in local dev and on
AWS (before, only the mock checked). A key is rejected with an error named
`ValidationFailed` when it:

- is empty or starts with `/`
- has an empty segment (`a//b`, or a trailing `a/`)
- contains ASCII control characters
- has a `.` or `..` segment

This applies to `get`, `put`, `delete`, `listVersions`, `restoreVersion`, and the
URL and batch methods. If production already holds objects under such keys,
re-key them before upgrading. There is no `FileBucketErrors` constant for this
case; match on `e.name === 'ValidationFailed'`.

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
| `FileBucketErrors.VersionNotFound` | `NoSuchVersion` | `restoreVersion()` with an unknown `versionId` (`bb-file-bucket@0.3.0`). |
| `FileBucketErrors.PresignedUploadUnsupported` | `PresignedUploadUnsupported` | `putUrl()` / `createUploadHandle()` on an `objectLock` bucket (`bb-file-bucket@0.4.0`). |

As of `0.9.0`, `FileBucketErrors` is exported from the browser entry too, so
frontend code can import it for `isBlocksError` checks.

## Local mock vs AWS

Local: files on disk under `.bb-data/{fullId}/`; presigned URLs served by the
dev server; versioning supported; CORS and lifecycle rules have no local effect.
AWS: S3, presigned via `@aws-sdk/s3-request-presigner`.

If a key segment can contain URL-shaped characters (e.g. an OIDC `userId` like
`https://issuer:sub`), wrap it in `encodeURIComponent()`. An un-encoded `//`
creates an empty segment, which is now rejected on both runtimes.

## What it provisions

- S3 bucket with the configured CORS, lifecycle, encryption, Object Lock and
  removal policy, plus a log bucket when access logging is on
- Presigned-URL generation via the shared Blocks handler Lambda
- IAM grants on the shared execution role for S3 access
