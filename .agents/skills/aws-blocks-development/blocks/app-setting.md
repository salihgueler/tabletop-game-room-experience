# AppSetting

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
