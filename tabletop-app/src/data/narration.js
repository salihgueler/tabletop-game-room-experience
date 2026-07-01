// Templated AI-DM narration. Deterministic given (rng) so play is reproducible
// per-session but varied. No real LLM — pure mock content.

export const OPENERS = {
  'Cave Crypt': 'A stone door stands before you, carved with runes. Cold air seeps from the cracks.',
  'Dungeon Crawl': 'Torchlight flickers down a corridor of damp brick. Something skitters in the dark ahead.',
  'Magic Tower': 'Arcane sigils spiral up the tower wall, humming with barely-contained power.',
  'Frozen Keep': 'Frost coats the iron gate. Your breath clouds as a distant howl echoes across the ice.',
  'Sunken Vault': 'Water laps at your ankles. Ahead, a rusted vault door glints beneath the surface.',
}

// Outcome flavor keyed by broad action category, split by success/failure.
const RESULTS = {
  attack: {
    hit: (a, t) => `${a} strikes true! Steel bites deep and ${t} reels from the blow.`,
    miss: (a, t) => `${a} lunges, but ${t} twists away at the last instant. The blade meets only air.`,
  },
  magic: {
    hit: (a) => `${a} weaves the incantation flawlessly — raw arcane force erupts, lighting the chamber.`,
    miss: (a) => `${a}'s spell sputters and fizzles, motes of wasted mana hissing into smoke.`,
  },
  skill: {
    hit: (a) => `${a} works with practiced precision. A soft click — success.`,
    miss: (a) => `${a}'s hands slip. The mechanism jams with an ominous grind.`,
  },
  investigate: {
    hit: (a) => `${a} studies the scene carefully and uncovers a hidden detail others missed.`,
    miss: (a) => `${a} searches, but the shadows keep their secrets for now.`,
  },
  support: {
    hit: (a) => `${a} bolsters the party — a warm glow steadies every hand in the room.`,
    miss: (a) => `${a}'s effort falters; the blessing flickers and fades before it takes hold.`,
  },
}

// Map an action label to a category.
export function categorize(action) {
  const s = action.toLowerCase()
  if (s.includes('attack') || s.includes('strike') || s.includes('arrow') || s.includes('fire')) return 'attack'
  if (s.includes('cast') || s.includes('magic') || s.includes('firebolt') || s.includes('shield') || s.includes('phase') || s.includes('haunt')) {
    if (s.includes('bless') || s.includes('shield') || s.includes('mark')) return 'support'
    if (s.includes('detect') || s.includes('magic')) return 'investigate'
    return 'magic'
  }
  if (s.includes('disarm') || s.includes('lock') || s.includes('pick') || s.includes('track') || s.includes('sneak') || s.includes('defend')) return 'skill'
  return 'investigate'
}

export function narrate(action, actorName, roll, dc) {
  const cat = categorize(action)
  const success = roll >= dc
  const bank = RESULTS[cat] || RESULTS.investigate
  const target = 'the shadowed figure'
  const line = success ? bank.hit(actorName, target) : bank.miss(actorName, target)
  const crit = roll === 20 ? ' A CRITICAL success — the whole party feels the momentum shift!' : ''
  const fumble = roll === 1 ? ' A critical fumble! The misstep costs the party dearly.' : ''
  return `${line}${crit}${fumble}`
}

// A short prompt the DM poses to the next player.
const PROMPTS = [
  (n) => `The path forks and the air grows colder. What do you do, ${n}?`,
  (n) => `A sound echoes from deeper within. ${n}, how do you proceed?`,
  (n) => `The party looks to you. ${n}, make your move.`,
  (n) => `Danger prickles at the back of your neck. Your call, ${n}.`,
]
export const promptFor = (name, rng) => PROMPTS[Math.floor(rng() * PROMPTS.length)](name)
