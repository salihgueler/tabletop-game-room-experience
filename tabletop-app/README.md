# Adventurer's Guild Hall — Tabletop Game Room

A 16-bit pixel-art tabletop RPG room experience. Log in, forge a hero from 20
character sprites, browse/create/join campaigns in the Guild Hall, then play a
turn-based session with 3 players and one **AI Dungeon Master**.

All game logic runs client-side against **mock data** — no backend.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build to dist/
```

## Flow

1. **Login / Character Select** — enter a name, pick one of 20 sprites (Paladin,
   Sorcerer, Rogue, Ranger, Revenant), each mapped to a turn-ring color.
2. **Guild Hall** (`homepage.png`) — public game list (Join / View Party),
   Create-a-Game form (scenario theme, AI DM type, open-to-public), Join Private
   Game by access code, tavern chat, footer nav, Guild Dice Collection.
3. **Game Room** (`gamepage.png`) — turn-order rail (colored player rings + AI DM),
   dungeon board with tokens, DM narration + action menu, chat, inventory, dice
   tray. On your turn, choose an action → roll a d20 vs the round's DC → the AI DM
   narrates the outcome → turn passes. Bots auto-act; the DM speaks between rounds.

## Structure

- `src/theme.css` — design system: full color palette as CSS variables, wooden
  frames + gold studs, slate-navy panels, amber-gold buttons, Press Start 2P /
  VT323 fonts in cream.
- `src/data/` — classes, dice + character sprite manifests, mock games, DM
  narration templates.
- `src/engine/useGame.js` — the mock DnD engine (seeded RNG, turn rotation, d20
  resolution, bot AI, DM narration).
- `src/components/` — `Frame` (wooden border) and `Chat`.
- `src/screens/` — `Login`, `GuildHall`, `GameRoom`.
- `public/sprites/` — 20 character + 48 d20 dice sprites (sliced from the design
  reference sheet).
