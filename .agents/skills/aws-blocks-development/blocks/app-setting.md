# AppSetting

**When to use:** Single config values or secrets that your app reads at runtime — feature flags, API keys, environment-specific URLs.

**When NOT to use:** Structured data with multiple records (use DistributedTable), large blobs (use FileBucket), or data that changes per-user (use KVStore).

Single configuration value backed by SSM Parameter Store. Supports runtime updates and schema validation.

```typescript
import { z } from "zod";

// Simple string setting
const apiUrl = new AppSetting(scope, "api-url", {
  value: "https://api.example.com",
});

// Typed with schema validation
const configSchema = z.object({ maxRetries: z.number(), timeout: z.number() });
const config = new AppSetting(scope, "config", {
  value: { maxRetries: 3, timeout: 5000 },
  schema: configSchema,
});

// Secret (SSM SecureString)
const apiKey = new AppSetting(scope, "api-key", { secret: true });

// Read
const url = await apiUrl.get();           // string
const cfg = await config.get();           // { maxRetries: number, timeout: number }

// Update at runtime
await config.put({ maxRetries: 5, timeout: 10000 });
```

**AppSettingOptions:**
- `value` — initial value (required for non-secrets)
- `schema` — StandardSchemaV1 (Zod, Valibot, ArkType) for typed values
- `secret` — `true` for SSM SecureString (encrypted with KMS)
- `name` — explicit SSM parameter path (auto-derived if omitted)

**Key methods:**
- `get()` — retrieve current value
- `put(value)` — update at runtime (validates against schema, max 4KB)

Local mock: `.bb-data/settings.json` (single consolidated file, values JSON-serialized). AWS: SSM Parameter Store.


## Common Mistakes

❌ `Storing user-specific data in AppSetting`
✅ `Use KVStore or DistributedTable for per-user data. AppSetting is for app-wide config.`
_AppSetting is a single shared value, not per-user_


## What It Provisions

- SSM Parameter Store parameter (standard or secure string)
- IAM policy for Lambda to read the parameter

## See Also

- [kv-store](./kv-store.md) — Per-user or per-entity key-value data
- [distributed-table](./distributed-table.md) — Structured records with queries