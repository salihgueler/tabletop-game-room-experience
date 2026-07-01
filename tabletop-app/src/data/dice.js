// Dice sprite manifest. 24 red + 24 blue d20 sprites in /public/sprites/dice.
// Sprites show varied faces; we map a rolled value 1..20 to the closest-index
// sprite so the tray art loosely reflects the roll. Purely cosmetic.
export const DICE_COUNT = 24

export const diceUrl = (color, n) =>
  `/sprites/dice/${color}_${String(n).padStart(2, '0')}.png`

// Pick a sprite index (1..24) for a rolled value (1..20).
export const spriteForRoll = (value) =>
  Math.min(DICE_COUNT, Math.max(1, Math.round((value / 20) * DICE_COUNT)))

// A few showcased dice for the "Guild Dice Collection" widget.
export const COLLECTION = [
  { color: 'red', n: 24 },
  { color: 'blue', n: 20 },
  { color: 'blue', n: 8 },
]
