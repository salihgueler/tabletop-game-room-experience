// Character classes — each maps to a turn-ring color and a set of sprite variants.
// Sprite files live in /public/sprites/characters/<key>_<a..d>.png
export const CLASSES = {
  paladin: {
    name: 'Paladin',
    color: 'var(--paladin)',
    hex: '#00f0ff',
    blurb: 'Holy warrior. High defense, protects the party.',
    variants: ['paladin_a', 'paladin_b', 'paladin_c', 'paladin_d'],
    actions: ['Attack', 'Defend Ally', 'Cast Bless', 'Investigate'],
    abilities: ['⚔', '🛡'],
  },
  sorcerer: {
    name: 'Sorcerer',
    color: 'var(--sorcerer)',
    hex: '#bd00ff',
    blurb: 'Arcane spellcaster. Devastating magic, fragile body.',
    variants: ['sorcerer_a', 'sorcerer_b', 'sorcerer_c', 'sorcerer_d'],
    actions: ['Cast Firebolt', 'Detect Magic', 'Cast Shield', 'Investigate'],
    abilities: ['🔥', '✨'],
  },
  rogue: {
    name: 'Rogue',
    color: 'var(--rogue)',
    hex: '#39ff14',
    blurb: 'Shadow and steel. Stealth, traps, and sneak attacks.',
    variants: ['rogue_a', 'rogue_b', 'rogue_c', 'rogue_d'],
    actions: ['Sneak Attack', 'Disarm Trap', 'Pick Lock', 'Investigate'],
    abilities: ['🗡', '🎯'],
  },
  ranger: {
    name: 'Ranger',
    color: 'var(--ranger)',
    hex: '#ffaa00',
    blurb: 'Wilderness hunter. Ranged precision and tracking.',
    variants: ['ranger_a', 'ranger_b', 'ranger_c', 'ranger_d'],
    actions: ['Fire Arrow', 'Track', 'Cast Hunter’s Mark', 'Investigate'],
    abilities: ['🏹', '🐾'],
  },
  ai: {
    name: 'Revenant',
    color: 'var(--dm)',
    hex: '#9d4edd',
    blurb: 'Spectral wanderer wreathed in ghost flame.',
    variants: ['ai_a', 'ai_b', 'ai_c', 'ai_d'],
    actions: ['Spectral Strike', 'Haunt', 'Phase', 'Investigate'],
    abilities: ['💀', '🔮'],
  },
}

export const CLASS_ORDER = ['paladin', 'sorcerer', 'rogue', 'ranger', 'ai']

// Flattened list of all 20 selectable character sprites for the picker.
export const ALL_CHARACTERS = CLASS_ORDER.flatMap((key) =>
  CLASSES[key].variants.map((sprite, i) => ({
    id: sprite,
    classKey: key,
    sprite: `/sprites/characters/${sprite}.png`,
    label: `${CLASSES[key].name} ${String.fromCharCode(65 + i)}`,
  })),
)

export const spriteUrl = (id) => `/sprites/characters/${id}.png`
