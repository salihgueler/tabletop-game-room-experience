# Structure

Repository root contains two finished applications and two workshops:

```text
.
├─ tabletop-app/            # Standalone React + AWS Blocks application
├─ tabletop-flutter/        # Standalone Flutter + AWS Blocks application
├─ workshop/                # React workshop
├─ workshop-flutter/        # Flutter workshop
├─ designs/                 # Architecture and product assets
└─ .kiro/steering/          # Repository guidance
```

Each finished application owns its backend. Do not make Flutter depend on
`tabletop-app/aws-blocks/`, and do not assume local users or games are shared.

The React package:

```text
tabletop-app/
├─ aws-blocks/
│  ├─ index.ts              # Main backend: schemas, auth, game engine, agents, API
│  ├─ index.cdk.ts          # Generated; do not edit
│  ├─ index.handler.ts      # Generated; do not edit
│  ├─ client.js             # Generated typed RPC client; do not edit
│  └─ scripts/              # dev, sandbox, deploy, destroy, console, cleanup
├─ src/
│  ├─ api.js                # Frontend RPC/auth helpers
│  ├─ App.jsx, main.jsx     # App shell and entry point
│  ├─ screens/              # Auth, character select, Guild Hall, Game Room
│  ├─ components/           # Reusable UI components
│  ├─ data/                 # Sprite/class/dice presentation data only
│  └─ theme.css             # Pixel-art visual design system
├─ public/
│  ├─ sprites/              # Character and dice sprites
│  └─ ui/                   # Backgrounds and UI art
├─ docs/                    # Existing docs, including running guide
├─ README.md                # Product and architecture overview
└─ package.json             # Scripts, dependencies, workspace config
```

The Flutter package:

```text
tabletop-flutter/
├─ aws-blocks/
│  ├─ index.ts              # Flutter app backend and Agents
│  ├─ index.cdk.ts          # Flutter web Hosting and Blocks stack
│  ├─ index.handler.ts      # Lambda handler
│  ├─ client.js             # Generated JavaScript client
│  └─ scripts/              # dev, sandbox, deploy, destroy, console, cleanup
├─ lib/
│  ├─ blocks.spec.json      # Generated backend contract
│  ├─ blocks.blocks.dart    # Generated Dart RPC models and methods
│  ├─ data/                 # Services and repository
│  ├─ domain/               # Flutter domain models
│  └─ ui/                   # Views, view models, theme, and widgets
├─ test/                    # Flutter widget and view-model tests
├─ tool/                    # End-to-end Blocks smoke tools
├─ package.json             # Blocks, codegen, verify, and deploy scripts
├─ pubspec.yaml             # Flutter dependencies and assets
└─ README.md                # Standalone Flutter guide
```

## Architecture rules

- React backend changes belong in `tabletop-app/aws-blocks/index.ts`.
- Flutter backend changes belong in `tabletop-flutter/aws-blocks/index.ts`.
- Workshop changes stay in the selected workshop workspace.
- The frontend is a thin typed RPC + Realtime consumer; it should not duplicate authoritative game rules.
- Server state in `gameStates` is authoritative. Realtime `state` messages are version signals; clients should refetch state rather than trusting pushed state payloads.
- Authenticated API methods should use `auth.requireAuth(context)`.
- Keep top-level exports in `aws-blocks/index.ts` intentional: exports become API namespaces. Return domain constants through API methods such as `getConstants()` instead of exporting them.
- `DistributedTable` has no scan pattern here; list via partition keys and GSIs such as `listKey` + `byCreated`.
- Keep AWS Blocks scope and Realtime namespace IDs short because deployed namespace names have length limits.
- Regenerate Flutter's `lib/blocks.spec.json` and `lib/blocks.blocks.dart` after
  changing its backend contract.
- Do not hand-edit generated clients or handlers.
