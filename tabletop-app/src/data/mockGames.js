// Mock public games shown in the Guild Hall list, plus seed chat.
export const SCENARIOS = ['Cave Crypt', 'Dungeon Crawl', 'Magic Tower', 'Frozen Keep', 'Sunken Vault']
export const DM_TYPES = ['Grimjaw', 'Xandros', 'Mistweaver', 'Hollowvoice']
export const DM_LEVELS = ['Novice', 'Intermediate', 'Master']

export const MOCK_GAMES = [
  {
    id: 'g1',
    name: 'The Gloomspire Sanctum',
    theme: 'Cave Crypt',
    note: 'Using themes from IMAGE 0',
    party: 2,
    maxParty: 4,
    dmLevel: 'Intermediate',
    dm: 'Grimjaw',
    status: 'Awaiting Players',
    joinable: true,
    partyClasses: ['paladin', 'sorcerer'],
  },
  {
    id: 'g2',
    name: 'Rune-Carved Door Mystery',
    theme: 'Magic Tower',
    note: 'Using themes from IMAGE 0',
    party: 2,
    maxParty: 4,
    dmLevel: 'Intermediate',
    dm: 'Grimjaw',
    status: 'In Session',
    joinable: true,
    partyClasses: ['rogue', 'ranger'],
  },
  {
    id: 'g3',
    name: 'Rune-Carved Ruiner',
    theme: 'Dungeon Crawl',
    note: 'Using themes from IMAGE 0',
    party: 1,
    maxParty: 4,
    dmLevel: 'Intermediate',
    dm: 'Xandros',
    status: 'In Session',
    joinable: true,
    partyClasses: ['sorcerer'],
  },
  {
    id: 'g4',
    name: 'Frostbite Hollow',
    theme: 'Frozen Keep',
    note: 'Cold-weather survival run',
    party: 3,
    maxParty: 4,
    dmLevel: 'Master',
    dm: 'Mistweaver',
    status: 'Awaiting Players',
    joinable: true,
    partyClasses: ['paladin', 'ranger', 'rogue'],
  },
]

export const SEED_CHAT = [
  { who: 'Tavern Keeper', color: 'var(--gold-bright)', text: 'Welcome, brave adventurers!' },
  { who: 'Kael', color: 'var(--paladin)', text: 'Anyone for a Gloomspire run?' },
  { who: 'Zara', color: 'var(--sorcerer)', text: 'Looking for a party for Rune-Carved Door.' },
]
