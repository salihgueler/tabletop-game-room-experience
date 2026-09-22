# Native Client SDKs

AWS Blocks generates typed native clients for **Kotlin** (Android / KMP / JVM),
**Swift** (iOS / macOS), and **Dart** (Flutter) from a `blocks.spec.json`
(OpenRPC). Each SDK ships its own build-time code generator that emits idiomatic
method signatures, models, and return types from the spec — the `ApiNamespace`
methods your backend exposes become typed client methods.

**Use it for** mobile/native front-ends that call a Blocks backend. **Don't use
it for** the TypeScript web client — that is generated alongside the server, no
separate SDK needed.

The three SDKs are at **different release maturity** — do not assume parity (see
Publishing coordinates). All three live in the `aws-devtools-labs` GitHub org,
**not** `aws-amplify`.

## Contents

- Generating the spec
- Kotlin (Android / KMP / JVM)
- Swift (iOS / macOS)
- Dart (Flutter)
- Publishing coordinates
- Capability matrix

## Generating the spec

`@aws-blocks/core` ships a **`blocks-generate-spec`** bin, a CLI wrapper around
`writeSpec()`. Any Blocks app can invoke it
via `npx blocks-generate-spec`, and every `create-blocks-app` template wires it as
the `spec` npm script:

```jsonc
// package.json (from every create-blocks-app template)
"scripts": {
  "spec": "blocks-generate-spec"
}
```

```bash
npm run spec          # runs blocks-generate-spec
# or directly:
npx blocks-generate-spec [backendPath] [outputPath]
```

Defaults: `backendPath = ./aws-blocks/index.ts`,
`outputPath = ./aws-blocks/blocks.spec.json`. For a TypeScript backend entry the
CLI lazily loads `tsx` and uses its programmatic `tsImport`, so no extra build
step is needed; JS entries use plain `import()`. It lives in its own CLI (rather
than being wired into `npm run dev`) because the spec emitter loads the
TypeScript compiler (~1.5s cold start).

`npm run spec` after any API or schema change, then hand `blocks.spec.json` to the
native teams.

Golden codegen fixtures under `native/codegen-fixtures/` regenerate through each
SDK's own runner via `native/codegen-fixtures/regenerate-all.sh`:
`./gradlew :codegen:regenerateFixtures` (Kotlin), `REGENERATE_FIXTURES=1 swift test`
(Swift), `REGENERATE_FIXTURES=1 dart test test/golden_file_test.dart` (Dart).

---

## Kotlin (Android / KMP / JVM)

A Gradle plugin (`com.aws.blocks.kotlin`) generates sources into your module. The
runtime is Kotlin Multiplatform (Ktor transport: OkHttp engine on Android/JVM,
Darwin/URLSession on iOS).

### Setup

```kotlin
// build.gradle.kts
plugins {
    id("com.aws.blocks.kotlin") version "0.2.0"
}

dependencies {
    implementation("com.aws.blocks.kotlin:runtime:0.2.0")
}
```

Maven group is `com.aws.blocks.kotlin`; the Gradle plugin id is
`com.aws.blocks.kotlin` (implementation class
`com.aws.blocks.plugin.AwsBlocksCodegenPlugin`).

### Configuration — the `awsBlocks { }` extension

```kotlin
import com.aws.blocks.plugin.GeneratedVisibility

awsBlocks {
    apiSpec = rootProject.file("blocks.spec.json")   // default: rootProject blocks.spec.json
    packageName.set("com.example.myapp.generated")   // default: com.aws.blocks.generated
    visibility.set(GeneratedVisibility.Internal)     // default: Public

    servers {
        local("http://10.0.2.2:3001")
        sandbox("https://sandbox.example.com")
        prod("https://api.example.com")
        custom("staging", "https://staging.example.com")
    }

    oidc {
        redirectUrl = "com.example.myapp://auth/callback"
    }
}
```

`GeneratedVisibility` has exactly two values: `Public` and `Internal` (not
`PUBLIC`/`INTERNAL`). Server overrides replace spec servers of the same name, or
append as new ones.

### Usage

Generated `ApiNamespace`s become classes (e.g. `Api`); enums and update payloads
are **nested** under the namespace class:

```kotlin
import com.example.myapp.generated.Api

val api = Api()   // uses the default server from the spec

val todo = api.createTodo(title = "Buy groceries", priority = 1.0)
val todos = api.listTodos(Api.ListTodos.SortBy.Priority)
val result = api.updateTodo(todo.todoId, Api.UpdateTodo.Updates(completed = true))
```

`priority` is a `Double` (JSON numbers generate as `Double`, hence `1.0`).
`BlocksClient.clearCookies()` clears the persisted session.

### Gradle tasks

- `awsBlocksCodegen<Variant>` — Android variant (e.g. `awsBlocksCodegenDebug`)
- `awsBlocksCodegen` — KMP `commonMain` / JVM `main`
- `awsBlocksDumpModel` — dumps the intermediate model for debugging

### Error handling

The runtime throws `NetworkException` (transport failures: timeout, DNS,
connection refused — retry-safe) and `ApiException` (JSON-RPC error body from the
backend — inspect `.code` / `.name` / `.message`). Both extend `BlocksException`,
which is an `open class` (not sealed), so you can subclass it or catch the base
type (`native/kotlin/runtime/src/commonMain/kotlin/com/aws/blocks/kotlin/exceptions/BlocksException.kt:10`).

### Encrypted cookie storage

Android uses `EncryptedSharedPreferences`; iOS uses Keychain Services; JVM uses
AES-256-GCM encrypted files. OIDC uses a Custom Tabs redirect flow implemented in
`androidMain` only — **Android is the only Kotlin target with OIDC**.

**Requirements:** Android `minSdk` 23 (`compileSdk` 36); iOS targets `iosX64`,
`iosArm64`, `iosSimulatorArm64`; Ktor 3.x.

---

## Swift (iOS / macOS)

A SwiftPM build-tool plugin generates `Models.swift` and `API.swift` into the
target's derived sources on every build — nothing to commit. Published as the
**separate** `aws-blocks-swift` repository, not the monorepo.

### Setup

```swift
// Package.swift
dependencies: [
    .package(url: "https://github.com/aws-devtools-labs/aws-blocks-swift.git", from: "0.1.0"),
],
targets: [
    .target(
        name: "MyApp",
        dependencies: [
            .product(name: "BlocksRuntime", package: "aws-blocks-swift"),
        ],
        plugins: [
            .plugin(name: "BlocksCodegenBuildPlugin", package: "aws-blocks-swift"),
        ],
    ),
]
```

Drop `blocks.spec.json` next to the target's sources (e.g. `Sources/MyApp/`) — the
build plugin discovers it automatically.

### Products and targets

- `BlocksRuntime` (library) — HTTP client, WebSocket, file handles, Keychain cookies
- `BlocksCodegenBuildPlugin` — build-tool plugin; auto-generates on `swift build`
- `BlocksCodegenCommandPlugin` — command plugin; manual generation via
  `swift package plugin generate-code-from-blocks-spec`
- `BlocksCodegen` / `swift-code-generator` — codegen library and CLI (used by the plugins)

### Usage

Each API namespace becomes its own class carrying a `BlocksClient`. Discriminated
unions map to Swift `enum`s with associated values:

```swift
import BlocksRuntime

let auth = AuthApi(server: BlocksServer(name: "prod", url: "https://api.example.com"))

let state = try await auth.setAuthState(input: .signIn(SetAuthState.SignIn(
    username: "alice",
    password: "P@ss1"
)))
```

Native mappings: `format: "uuid"` → `UUID`, `format: "date-time"` → `Date`,
`format: "uri"` → `URL`; schema constraints (`minLength`, `pattern`, `minimum`, …)
become `precondition` checks at construct time; open-shape records
(`T & Record<string, V>`) render as `[String: V]`. OIDC is supported via the
`OIDCClient` actor in `BlocksRuntime` (`Sources/BlocksRuntime/OIDC/`).

**Requirements:** swift-tools 5.9; platforms iOS 16, macOS 13.

---

## Dart (Flutter)

Three pub packages, all at version **0.1.2** and all with **no git release tag
yet**:

- `blocks_runtime` — JSON-RPC 2.0 HTTP client, WebSocket realtime, file
  transferables. Pure Dart (works in CLI/server apps).
- `blocks_codegen` — build_runner code generator (reads the OpenRPC spec).
- `blocks_runtime_flutter` — Flutter-specific implementations (secure storage,
  OAuth browser flow via `flutter_secure_storage` / `url_launcher` / `app_links`).

### Setup

```yaml
# pubspec.yaml
dependencies:
  blocks_runtime: ^0.1.2

dev_dependencies:
  blocks_codegen: ^0.1.2
  build_runner: ^2.16.0
```

`build_runner` is the standard Dart codegen driver — its version (`^2.x`) is
independent of the Blocks package versions.

### Configuration and generation

```yaml
# build.yaml
targets:
  $default:
    builders:
      blocks_codegen|blocks_codegen:
        options:
          spec: lib/blocks.spec.json
```

```bash
dart run build_runner build
```

### Usage

Named parameters; enums render as top-level `Api<Method><Field>` types:

```dart
import 'package:blocks_runtime/blocks_runtime.dart';
import 'blocks.blocks.dart';

final blocks = Blocks(baseUrl: 'https://api.example.com');

final todo = await blocks.api.createTodo(title: 'Buy milk', priority: 1);
final byPriority = await blocks.api.listTodos(sortBy: ApiListTodosSortBy.priority);
final got = await blocks.api.getTodo(todoId: todo.todoId);
```

**Requirements:** Dart SDK `^3.11.0`; `blocks_runtime_flutter` needs Flutter `>=3.41.0`.

---

## Publishing coordinates

| SDK | Package / coordinate | Latest tag | Repo (org `aws-devtools-labs`) |
|-----|----------------------|------------|--------------------------------|
| Kotlin | Maven group `com.aws.blocks.kotlin` (`:runtime`); Gradle plugin `com.aws.blocks.kotlin` | `kotlin@0.2.0` | `aws-blocks` (monorepo) |
| Swift | SwiftPM `aws-blocks-swift`, product `BlocksRuntime` | `swift@0.1.1` | `aws-blocks-swift` |
| Dart | `blocks_runtime`, `blocks_codegen`, `blocks_runtime_flutter` | none yet | `aws-blocks` (monorepo) |

## Capability matrix

| Capability | Kotlin | Swift | Dart |
|------------|--------|-------|------|
| RPC / API methods | ✅ | ✅ | ✅ |
| Realtime (WebSocket) | ✅ | ✅ | ✅ |
| File Bucket | ✅ | ✅ | ✅ |
| OIDC auth | ✅ Android only | ✅ `OIDCClient` | ✅ `OidcClient` (Flutter launcher in `blocks_runtime_flutter`) |
| Discriminated unions | ✅ sealed | ✅ enum | ✅ sealed |
| Schema validation | at construct | `precondition` | at construct |
| Encrypted cookie storage | Android `EncryptedSharedPreferences` / iOS Keychain / JVM AES-256-GCM | Keychain | `flutter_secure_storage` |
