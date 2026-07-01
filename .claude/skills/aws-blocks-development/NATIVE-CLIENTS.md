# Native Client SDKs

AWS Blocks generates typed native clients from your `blocks.spec.json` for mobile and multiplatform apps. All clients are fully type-safe — method signatures, params, and return types come from the spec.

## Contents
- [How it works](#how-it-works)
- [Generating the spec](#generating-the-spec)
- [Kotlin (Android / KMP / JVM)](#kotlin-android--kmp--jvm)
- [Swift (iOS / macOS)](#swift-ios--macos)
- [Dart (Flutter)](#dart-flutter)
- [Feature matrix](#feature-matrix)
- [Spec versioning](#spec-versioning)

## How it works

```
Backend (TypeScript) → npx blocks spec → blocks.spec.json → Native codegen → Typed client
```

The codegen reads an OpenRPC-based spec emitted by your Blocks backend. Each native SDK ships its own build-time code generator that emits idiomatic code for the target platform.

## Generating the spec

```bash
npx blocks spec            # outputs blocks.spec.json in project root
```

Commit this file to your repo and share it with mobile/native teams. Regenerate after any API or schema change.

---

## Kotlin (Android / KMP / JVM)

Package: `com.aws.blocks.kotlin`

### Setup

```kotlin
// build.gradle.kts
plugins {
    id("com.aws.blocks.kotlin") version "<version>"
}

dependencies {
    implementation("com.aws.blocks.kotlin:runtime:<version>")
}
```

### Configuration

```kotlin
import com.aws.blocks.plugin.GeneratedVisibility

awsBlocks {
    apiSpec = rootProject.file("blocks.spec.json")
    packageName = "com.example.myapp.generated"
    visibility = GeneratedVisibility.Internal

    servers {
        local("http://10.0.2.2:3001")
        prod("https://api.example.com")
        custom("staging", "https://staging.example.com")
    }
}
```

### Usage

```kotlin
import com.example.myapp.generated.Api
import com.example.myapp.generated.Todo

val api = Api()

val todo: Todo = api.createTodo(title = "Buy groceries", priority = 1.0)
val todos: List<Todo> = api.listTodos(sortBy = ListTodos.SortBy.Priority)
api.updateTodo(todoId = todo.todoId, updates = UpdateTodo.Updates(completed = true))
```

### Gradle tasks

| Task | Description |
|------|-------------|
| `awsBlocksCodegen<Variant>` | Generates sources for Android variant (e.g. `awsBlocksCodegenDebug`) |
| `awsBlocksCodegen` | Generates sources for KMP (commonMain) or JVM (main) |
| `awsBlocksDumpModel` | Dumps intermediate model for debugging |

### Platform support

| Platform | Engine | Cookie Storage |
|----------|--------|----------------|
| Android | OkHttp | EncryptedSharedPreferences |
| iOS | Darwin (URLSession) | Keychain Services |
| JVM | OkHttp | AES-256-GCM encrypted files |

### Block support (Kotlin)

| Block | Android | iOS | JVM |
|-------|---------|-----|-----|
| General/RPC | ✅ | ✅ | ✅ |
| Realtime | ✅ | ✅ | ✅ |
| File Bucket | ✅ | ✅ | ✅ |
| OIDC | ✅ | ❌ | ❌ |

### Error Handling (Kotlin)

| Exception | When |
|-----------|------|
| `NetworkException` | Transport-level failures (timeout, DNS, connection refused) |
| `ApiException` | Application-level errors (4xx/5xx from backend, JSON-RPC error body) |

Catch `NetworkException` for connectivity issues (retry-safe) and `ApiException` for business logic errors (inspect `.code` and `.message`).

**Requirements:** Kotlin 2.x, JDK 17+, Gradle 7.4+, AGP 7.1+ (Android)

**Known fixes:** Nullable discriminated unions now generate correct Kotlin code. Previously, optional union-typed fields produced non-compilable sealed class hierarchies. Update to the latest Kotlin SDK version if you encounter `sealed class` compile errors on nullable union fields.

---

## Swift (iOS / macOS)

Package: `aws-blocks-swift`

### Setup

```swift
// Package.swift
dependencies: [
    .package(url: "https://github.com/aws-amplify/aws-blocks-swift.git", from: "0.1.0"),
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

### Spec placement

Drop `blocks.spec.json` next to your target's source:
```
Sources/MyApp/
├── blocks.spec.json   ← discovered automatically
└── App.swift
```

The build plugin generates `Models.swift` and `API.swift` into derived sources on every build.

### Usage

```swift
import BlocksRuntime

let client = BlocksClient(url: URL(string: "https://api.example.com")!)

let todo = try await client.createTodo(title: "Buy milk", priority: 1)
let todos = try await client.listTodos(sortBy: .priority)
```

### Features

- **Native Foundation types** — `format: "uuid"` → `UUID`, `format: "date-time"` → `Date`, `format: "uri"` → `URL`
- **Discriminated unions** → Swift `enum` with associated values
- **Schema constraints** → `precondition` checks at construct time (`minLength`, `maxLength`, `pattern`, `minimum`, etc.)
- **Default values** from the spec become Swift initializer defaults
- **Open-shape records** — `T & Record<string, V>` renders as `let attributes: [String: V]`

### Targets

| Target | Purpose |
|--------|---------|
| `BlocksRuntime` | Runtime: HTTP client, WebSocket, file handles, Keychain cookies |
| `BlocksCodegen` | Build-time codegen library |
| `swift-code-generator` | CLI entry point for manual codegen |
| `BlocksCodegenBuildPlugin` | Auto-generates on `swift build` |
| `BlocksCodegenCommandPlugin` | Manual via `swift package plugin generate-code-from-blocks-spec` |

### Platform support

| Platform | Min version | Cookie storage |
|----------|-------------|----------------|
| iOS | 16.0 | Keychain Services |
| macOS | 13.0 | Keychain Services |

**Requirements:** Swift 5.9+, Xcode 15+

---

## Dart (Flutter)

Packages: `blocks_runtime`, `blocks_codegen`

### Setup

```yaml
# pubspec.yaml
dependencies:
  blocks_runtime: ^1.0.0

dev_dependencies:
  blocks_codegen: ^1.0.0
  build_runner: ^2.4.0
```

### Configuration

```yaml
# build.yaml
targets:
  $default:
    builders:
      blocks_codegen|blocks_codegen:
        options:
          spec: lib/blocks.spec.json
```

### Generate

```bash
dart run build_runner build
```

### Usage

```dart
import 'package:blocks_runtime/blocks_runtime.dart';
import 'blocks.blocks.dart';

final blocks = Blocks(baseUrl: 'https://your-api.example.com');

final todo = await blocks.api.createTodo(title: 'Buy milk', priority: 1);
final todos = await blocks.api.listTodos(sortBy: SortBy.priority);

// Realtime subscriptions
final channel = await blocks.api.getCursorChannel();
channel.subscribe().listen((cursor) {
  print('${cursor.userId} moved to (${cursor.x}, ${cursor.y})');
});
```

### Features

- **Type-safe API calls** — every method, parameter, and return type is generated
- **Realtime** — typed `Stream<T>` subscriptions over WebSocket
- **Auth flows** — discriminated unions become sealed classes
- **File transfers** — presigned upload/download via handle objects
- **No Flutter dependency** — `blocks_runtime` is pure Dart (works in CLI/server apps)

### Project structure

```
native/dart/
├── packages/
│   ├── blocks_runtime/          # Ships with your app
│   ├── blocks_codegen/          # Build-time only
│   └── blocks_runtime_flutter/  # Flutter integration (secure storage, browser launcher)
└── example/                     # Demo Flutter app
```

**Requirements:** Dart 3.3+, Node.js 22+ (local backend)

---

## Feature matrix

| Feature | Kotlin | Swift | Dart |
|---------|--------|-------|------|
| RPC/API methods | ✅ | ✅ | ✅ |
| Realtime (WebSocket) | ✅ | ✅ | ✅ |
| File Bucket | ✅ | ✅ | ✅ |
| OIDC Auth | ✅ (Android only) | ❌ | ❌ |
| Discriminated unions | ✅ (sealed) | ✅ (enum) | ✅ (sealed) |
| Schema validation | At construct | precondition | At construct |
| Cookie storage | Platform-native encrypted | Keychain | Flutter secure storage |

## Spec versioning

The spec file (`blocks.spec.json`) is the contract between your backend and native clients. Best practices:

1. **Commit the spec** — check it into your repo so mobile devs can pull updates
2. **CI validation** — regenerate on every backend PR to catch breaking changes
3. **Backwards compatibility** — adding methods/fields is non-breaking; removing or renaming is breaking
4. **Versioned URLs** — use the `servers` config in Kotlin or the `baseUrl` param in Swift/Dart to point at the correct environment
