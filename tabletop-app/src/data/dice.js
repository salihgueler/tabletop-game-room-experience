// Dice sprite manifest. 24 red + 24 blue d20 sprites in /public/sprites/dice.
// Sprites show varied faces; we map a rolled value 1..20 to the closest-index
// sprite so the tray art loosely reflects the roll. Purely cosmetic.
export const DICE_COUNT = 24
export const DICE_FRAMES = Array.from(
  { length: DICE_COUNT },
  (_, index) => index + 1,
).filter((frame) => frame !== 11 && frame !== 12)

export const diceUrl = (color, n) =>
  `/sprites/dice/${color}_${String(n).padStart(2, '0')}.png`

// Pick a sprite index (1..24) for a rolled value (1..20).
export const spriteForRoll = (value) =>
  DICE_FRAMES[
    Math.round(((Math.min(20, Math.max(1, value)) - 1) / 19) * (DICE_FRAMES.length - 1))
  ]

// A few showcased dice for the "Guild Dice Collection" widget.
export const COLLECTION = [
  { color: 'red', n: 24 },
  { color: 'blue', n: 20 },
  { color: 'blue', n: 8 },
]
