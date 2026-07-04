# Structure

Repository root contains design assets and the main app package:

```text
.
├─ designs/                 # Excalidraw architecture and product mockups/assets
├─ .kiro/steering/          # AI assistant steering documents
└─ tabletop-app/            # Main React + AWS Blocks application
```

`tabletop-app/` is the working package:

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

## Architecture rules

- Backend game logic belongs in `tabletop-app/aws-blocks/index.ts`.
- The frontend is a thin typed RPC + Realtime consumer; it should not duplicate authoritative game rules.
- Server state in `gameStates` is authoritative. Realtime `state` messages are version signals; clients should refetch state rather than trusting pushed state payloads.
- Authenticated API methods should use `auth.requireAuth(context)`.
- Keep top-level exports in `aws-blocks/index.ts` intentional: exports become API namespaces. Return domain constants through API methods such as `getConstants()` instead of exporting them.
- `DistributedTable` has no scan pattern here; list via partition keys and GSIs such as `listKey` + `byCreated`.
- Keep AWS Blocks scope and Realtime namespace IDs short because deployed namespace names have length limits.
- Do not edit generated files: `aws-blocks/client.js`, `aws-blocks/index.cdk.ts`, or `aws-blocks/index.handler.ts`.