# Build a Multiplayer AI Game on AWS Blocks — Workshop

Turn a **mock-backed** tabletop RPG into a real cloud application — one AWS
[Building Block](https://github.com/aws) at a time.

You start with [`app/`](app/): the **Adventurer's Guild Hall** game _frontend_. In
Module 01 you scaffold the backend with `create-blocks-app` and drop in a mock backend
that fakes everything in memory (auth, persistence, real-time, AI). Each module then
replaces one mock with a real AWS Block until the whole thing runs on Auth, DynamoDB,
WebSockets, Bedrock, and CloudFront — with **no servers, containers, or IAM policies to
hand-write**.

The finished reference implementation lives in [`../tabletop-app/`](../tabletop-app/).

---

## The model: one app, nine steps

**You work in a single project — [`app/`](app/) — the whole way through.** Set it up once
(Module 01: scaffold + `npm install`). After that, each module is a _step_ that edits
`app/aws-blocks/index.ts` (the backend is one file). The app stays runnable after every
module.

```
workshop/
├─ README.md          ← you are here
├─ app/               ← THE project you edit — FRONTEND ONLY until Module 01 scaffolds
│  ├─ src/             ← the finished React frontend (you rarely touch this)
│  ├─ package.json     ← Module 01's `create-blocks-app` adds the aws-blocks/ backend here
│  └─ vite.config.js
└─ 01-scaffold/ … 09-deploy/
   └─ README.md        ← concepts, steps, and how to verify — PLUS the changed
                          file(s) for that module, so you can diff / catch up
```

`app/` ships **without an `aws-blocks/` folder** on purpose — Module 01 generates it with
the official CLI (the scaffolder refuses to run if one already exists). From Module 02 on,
each module folder holds its guide (`README.md`) and just the backend file(s) that change —
almost always a new `aws-blocks/index.ts`. If you fall behind or want to jump ahead, copy
that module's `index.ts` into `app/aws-blocks/` and keep going.

## Why the starter is all mocks

The backend you scaffold in Module 01 is a single file where auth, data, real-time, and
AI are faked in-memory. That's deliberate:

- **It runs instantly** — no AWS account, no API keys, no model downloads. Once scaffolded,
  `npm run dev` and you're playing a full game (solo, vs. canned AI companions).
- **The seams are the syllabus.** Each mock is clearly labelled with the module that
  replaces it (`// MOCK: auth (Module 02 → AuthBasic)`). Your job each module is to
  delete one mock and wire in the real Block behind the _same_ function shape — so the
  frontend never changes and you see exactly what a Block gives you over a hand-roll.

## What you'll build

A 16-bit pixel-art game room: sign in, forge a hero, gather a party in a lobby, and play
a turn-based dungeon crawl narrated by an **AI Dungeon Master** with **AI companions** —
server-authoritative, real-time-synced across players.

## Modules

Work through them in order. Each is a runnable checkpoint.

| #   | Module                                          | Mock replaced                       | Block introduced         |
| --- | ----------------------------------------------- | ----------------------------------- | ------------------------ |
| 01  | [Scaffold with create-blocks-app](01-scaffold/) | — (setup)                           | `Scope`, `ApiNamespace`  |
| 02  | [Auth](02-auth/)                                | `fakeAuth`                          | `AuthBasic`              |
| 03  | Characters                                      | `characterStore` Map                | `DistributedTable`       |
| 04  | Guild Hall lobby                                | `gameStore` Map                     | `DistributedTable` + GSI |
| 05  | Game state & chat (turn engine)                 | `gameStateStore` / `chatStore` Maps | `DistributedTable`       |
| 06  | Realtime                                        | `fakeChannel` / `publish`           | `Realtime`               |
| 07  | AI Dungeon Master                               | `narrate` / `nextScene`             | `Agent`                  |
| 08  | AI companions                                   | `companionDecide`                   | `Agent` × party          |
| 09  | Deploy                                          | —                                   | CDK `Hosting`            |

## Prerequisites

- **Node.js ≥ 22** and **npm ≥ 10** (`node -v`, `npm -v`)
- A TypeScript-aware editor (VS Code recommended)
- _(Module 07+ only, optional)_ [Ollama](https://ollama.com) for real local AI. Without
  it the game keeps using the canned provider and stays fully playable.
- _(Module 09 only)_ An AWS account with credentials configured and CDK bootstrapped.

The frontend is **React 19 + Vite 6** (matching what `create-blocks-app`'s `react`
template installs), so the scaffolded backend deps line up with the app on the same majors.

## Get started

Head straight to **[Module 01](01-scaffold/)** — it walks you through scaffolding the
backend with `create-blocks-app`, dropping in the mock backend, and running your first
turn:

```bash
cd app
npm create @aws-blocks/blocks-app@latest . -- --template react   # answer y
# copy the game backend from ../01-scaffold/ (see Module 01), then:
npm install
npm run dev        # client → http://localhost:3000, backend → http://localhost:3001
```

## Conventions (true for every module)

- **Only edit `aws-blocks/index.ts`** for backend logic. `index.cdk.ts`,
  `index.handler.ts`, and `client.js` are generated — never hand-edit them.
- **Every top-level `export` becomes an API namespace.** The typed client
  (`client.js`) is generated from those exports; run `npm run dev` once after
  adding/removing an exported method to regenerate it.
- **Verify the backend before the frontend:** `npm run typecheck` → dev server →
  `curl` the method → then use the UI.
- **Reset local state** any time with `rm -rf app/.bb-data` (real Blocks persist there
  locally from module 03 on).
