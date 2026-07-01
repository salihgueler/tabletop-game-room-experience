/**
 * Backend — aws-blocks/index.ts
 *
 * Tabletop Game Room: authoritative D&D-style game engine for the Adventurer's
 * Guild Hall. All game logic lives here — the frontend is a typed RPC + Realtime
 * consumer with no game logic of its own.
 *
 * Blocks used:
 *   - AuthBasic ......... username/password login + sessions
 *   - DistributedTable .. games, gameState, chatMessages, characters (persistence)
 *   - Realtime .......... live broadcast of game state + chat to all players in a room
 *   - Agent ............. AI Dungeon Master narration (Bedrock deployed, Ollama local,
 *                         canned fallback offline)
 */
import {
  ApiNamespace,
  Scope,
  AuthBasic,
  DistributedTable,
  Realtime,
  Agent,
  BedrockModels,
  OllamaModels,
} from '@aws-blocks/blocks';
import { z } from 'zod';

// Short scope id — Realtime namespace names must stay under 50 chars.
const scope = new Scope('tt');

// ─── Domain constants (exposed to the frontend via the getConstants() method,
// NOT as module exports — the client codegen turns every export into an API
// namespace) ─────────────────────────────────────────────────────────────────
const SCENARIOS = ['Cave Crypt', 'Dungeon Crawl', 'Magic Tower', 'Frozen Keep', 'Sunken Vault'] as const
const DM_TYPES = ['Grimjaw', 'Xandros', 'Mistweaver', 'Hollowvoice'] as const
const CORE_CLASSES = ['paladin', 'sorcerer', 'rogue', 'ranger'] as const
const MAX_PARTY = 4

const CLASS_META: Record<string, { name: string; color: string; actions: string[] }> = {
  paladin: { name: 'Paladin', color: 'var(--paladin)', actions: ['Attack', 'Defend Ally', 'Cast Bless', 'Investigate'] },
  sorcerer: { name: 'Sorcerer', color: 'var(--sorcerer)', actions: ['Cast Firebolt', 'Detect Magic', 'Cast Shield', 'Investigate'] },
  rogue: { name: 'Rogue', color: 'var(--rogue)', actions: ['Sneak Attack', 'Disarm Trap', 'Pick Lock', 'Investigate'] },
  ranger: { name: 'Ranger', color: 'var(--ranger)', actions: ['Fire Arrow', 'Track', 'Cast Hunter’s Mark', 'Investigate'] },
}

const OPENERS: Record<string, string> = {
  'Cave Crypt': 'A stone door stands before you, carved with runes. Cold air seeps from the cracks.',
  'Dungeon Crawl': 'Torchlight flickers down a corridor of damp brick. Something skitters in the dark ahead.',
  'Magic Tower': 'Arcane sigils spiral up the tower wall, humming with barely-contained power.',
  'Frozen Keep': 'Frost coats the iron gate. Your breath clouds as a distant howl echoes across the ice.',
  'Sunken Vault': 'Water laps at your ankles. Ahead, a rusted vault door glints beneath the surface.',
}

// ─── Auth ────────────────────────────────────────────────────────────────────
const auth = new AuthBasic(scope, 'auth', {
  passwordPolicy: { minLength: 8 },
  crossDomain: process.env.BLOCKS_SANDBOX === 'true',
})
export const authApi = auth.createApi()

// ─── Data ────────────────────────────────────────────────────────────────────
// A player at the table (embedded inside game state).
const playerSchema = z.object({
  id: z.string(),
  name: z.string(),
  classKey: z.string(),
  sprite: z.string(),
  color: z.string(),
  isHuman: z.boolean(),
  userId: z.string().nullable(), // owning account for human players
  hp: z.number(),
  slot: z.number(),
})

const rollSchema = z.object({
  value: z.number(),
  sprite: z.number(),
  color: z.string(),
  dc: z.number(),
  success: z.boolean(),
  actor: z.string(),
  action: z.string(),
}).nullable()

const logEntrySchema = z.object({
  kind: z.enum(['dm', 'action', 'roll']),
  who: z.string(),
  color: z.string().optional(),
  text: z.string(),
})

// A game room in the lobby list.
const gameSchema = z.object({
  listKey: z.string(),        // constant partition key for public listing ("all")
  gameId: z.string(),         // sort key
  name: z.string(),
  theme: z.string(),
  note: z.string(),
  dmType: z.string(),
  dmLevel: z.string(),
  maxParty: z.number(),
  status: z.string(),         // 'Awaiting Players' | 'In Session'
  isPublic: z.boolean(),
  accessCode: z.string().nullable(),
  hostUserId: z.string(),
  createdAt: z.number(),
})

const games = new DistributedTable(scope, 'games', {
  schema: gameSchema,
  key: { partitionKey: 'listKey', sortKey: 'gameId' },
  indexes: {
    byCreated: { partitionKey: 'listKey', sortKey: 'createdAt' },
  },
})

// Authoritative per-game state (one item per game).
const gameStateSchema = z.object({
  gameId: z.string(),
  scenario: z.string(),
  dmName: z.string(),
  players: z.array(playerSchema),
  turnIndex: z.number(),
  round: z.number(),
  phase: z.enum(['player', 'resolving', 'dm']),
  dc: z.number(),
  lastRoll: rollSchema,
  log: z.array(logEntrySchema),
  inventory: z.array(z.string()),
  version: z.number(),
})

const gameStates = new DistributedTable(scope, 'gameStates', {
  schema: gameStateSchema,
  key: { partitionKey: 'gameId' },
})

// Chat history per game.
const chatSchema = z.object({
  gameId: z.string(),
  ts: z.number(),
  who: z.string(),
  color: z.string(),
  text: z.string(),
})

const chatMessages = new DistributedTable(scope, 'chat', {
  schema: chatSchema,
  key: { partitionKey: 'gameId', sortKey: 'ts' },
})

// A user's chosen character.
const characterSchema = z.object({
  userId: z.string(),
  name: z.string(),
  classKey: z.string(),
  spriteId: z.string(),
  sprite: z.string(),
})

const characters = new DistributedTable(scope, 'characters', {
  schema: characterSchema,
  key: { partitionKey: 'userId' },
})

// ─── Realtime ────────────────────────────────────────────────────────────────
// One channel per game (keyed by gameId). Clients subscribe to receive live
// state snapshots and chat messages.
const rt = new Realtime(scope, 'rt', {
  namespaces: {
    state: Realtime.namespace(z.object({ gameId: z.string(), version: z.number() })),
    chat: Realtime.namespace(chatSchema),
  },
})

// ─── AI Dungeon Master (Agent) ───────────────────────────────────────────────
// Inference-only: we just want a narrated line per action, no conversation
// persistence. Bedrock when deployed, Ollama (llama3.1:8b) locally, canned
// provider as the implicit final fallback (works fully offline).
const dm = new Agent(scope, 'dm', {
  inferenceOnly: true,
  model: {
    deployed: BedrockModels.BALANCED,
    local: OllamaModels.SMALL,
  },
  systemPrompt: [
    'You are a witty, atmospheric Dungeon Master for a 16-bit fantasy tabletop game.',
    'Given a player action, their d20 roll, and whether it beat the difficulty class,',
    'narrate the outcome in 1-2 vivid sentences. On a natural 20 add a triumphant flourish;',
    'on a natural 1 add a comedic or costly fumble. Never break character, never mention',
    'dice mechanics or numbers directly, and keep it under 45 words.',
  ].join(' '),
})

// ─── Deterministic canned narration (fallback + variety) ─────────────────────
function categorize(action: string): 'attack' | 'magic' | 'skill' | 'investigate' | 'support' {
  const s = action.toLowerCase()
  if (/(attack|strike|arrow|fire)/.test(s)) return 'attack'
  if (/(cast|magic|firebolt|shield|phase|haunt)/.test(s)) {
    if (/(bless|shield|mark)/.test(s)) return 'support'
    if (/(detect|magic)/.test(s)) return 'investigate'
    return 'magic'
  }
  if (/(disarm|lock|pick|track|sneak|defend)/.test(s)) return 'skill'
  return 'investigate'
}

const RESULTS: Record<string, { hit: (a: string) => string; miss: (a: string) => string }> = {
  attack: { hit: (a) => `${a} strikes true! Steel bites deep and the shadowed figure reels.`, miss: (a) => `${a} lunges, but the target twists away. The blade meets only air.` },
  magic: { hit: (a) => `${a} weaves the incantation flawlessly — arcane force erupts, lighting the chamber.`, miss: (a) => `${a}'s spell sputters and fizzles into wasted motes of mana.` },
  skill: { hit: (a) => `${a} works with practiced precision. A soft click — success.`, miss: (a) => `${a}'s hands slip. The mechanism jams with an ominous grind.` },
  investigate: { hit: (a) => `${a} studies the scene and uncovers a hidden detail the others missed.`, miss: (a) => `${a} searches, but the shadows keep their secrets for now.` },
  support: { hit: (a) => `${a} bolsters the party — a warm glow steadies every hand in the room.`, miss: (a) => `${a}'s effort falters; the blessing fades before it takes hold.` },
}

function cannedNarration(action: string, actor: string, roll: number, dc: number): string {
  const bank = RESULTS[categorize(action)] || RESULTS.investigate
  const line = roll >= dc ? bank.hit(actor) : bank.miss(actor)
  const crit = roll === 20 ? ' A CRITICAL success — the whole party feels the momentum shift!' : ''
  const fumble = roll === 1 ? ' A critical fumble! The misstep costs the party dearly.' : ''
  return `${line}${crit}${fumble}`
}

const PROMPTS = [
  (n: string) => `The path forks and the air grows colder. What do you do, ${n}?`,
  (n: string) => `A sound echoes from deeper within. ${n}, how do you proceed?`,
  (n: string) => `The party looks to you. ${n}, make your move.`,
  (n: string) => `Danger prickles at the back of your neck. Your call, ${n}.`,
]
const promptFor = (name: string) => PROMPTS[Math.floor(Math.random() * PROMPTS.length)](name)

// Ask the AI DM to narrate; fall back to canned text if the model errors.
async function narrate(scenario: string, action: string, actor: string, roll: number, dc: number): Promise<string> {
  const outcome = roll >= dc ? 'succeeds' : 'fails'
  const crit = roll === 20 ? ' (a natural 20!)' : roll === 1 ? ' (a natural 1!)' : ''
  const message = `Scenario: ${scenario}. ${actor} attempts "${action}" and ${outcome}${crit}. Narrate the outcome.`
  try {
    const result = await dm.stream(message)
    const done = await result.complete()
    const text = (done.text || '').trim()
    if (text) return text
  } catch {
    // model unavailable — fall through to canned
  }
  return cannedNarration(action, actor, roll, dc)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const rollD20 = () => 1 + Math.floor(Math.random() * 20)
const spriteForRoll = (value: number) => Math.min(24, Math.max(1, Math.round((value / 20) * 24)))
const diceColorFor = (classKey: string) => (['paladin', 'sorcerer'].includes(classKey) ? 'blue' : 'red')

const BOT_NAMES = ['Zara', 'Thorn', 'Lyra', 'Fen', 'Mira', 'Bram']

type Player = z.infer<typeof playerSchema>
type GameState = z.infer<typeof gameStateSchema>

// Build the 4-seat party: the human first, then bots for each remaining class.
function buildParty(human: { name: string; classKey: string; sprite: string; userId: string }): Player[] {
  const players: Player[] = [{
    id: 'you', name: human.name, classKey: human.classKey, sprite: human.sprite,
    color: CLASS_META[human.classKey]?.color ?? 'var(--paladin)', isHuman: true,
    userId: human.userId, hp: 20, slot: 0,
  }]
  const botClasses = CORE_CLASSES.filter((c) => c !== human.classKey)
  const usedNames: string[] = []
  for (let i = 0; i < 3; i++) {
    const ck = botClasses[i % botClasses.length]
    const variant = `${ck}_${'abcd'[Math.floor(Math.random() * 4)]}`
    let name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]
    while (usedNames.includes(name)) name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]
    usedNames.push(name)
    players.push({
      id: `bot${i}`, name, classKey: ck, sprite: `/sprites/characters/${variant}.png`,
      color: CLASS_META[ck]?.color ?? 'var(--rogue)', isHuman: false, userId: null, hp: 20, slot: i + 1,
    })
  }
  return players
}

async function loadState(gameId: string): Promise<GameState> {
  const state = await gameStates.get({ gameId })
  if (!state) throw new Error('Game not found')
  return state
}

async function saveAndBroadcast(state: GameState) {
  const next = { ...state, version: state.version + 1 }
  await gameStates.put(next)
  await rt.publish('state', next.gameId, { gameId: next.gameId, version: next.version })
  return next
}

// Resolve a single actor's action into narration + roll + log entries, mutating state.
async function resolveAction(state: GameState, action: string) {
  const actor = state.players[state.turnIndex]
  const value = rollD20()
  const success = value >= state.dc
  const text = await narrate(state.scenario, action, actor.name, value, state.dc)
  state.lastRoll = {
    value, sprite: spriteForRoll(value), color: diceColorFor(actor.classKey),
    dc: state.dc, success, actor: actor.name, action,
  }
  state.log = [
    ...state.log,
    { kind: 'action', who: actor.name, color: actor.color, text: `${actor.name} chooses ${action}.` },
    { kind: 'roll', who: actor.name, color: actor.color, text: `rolls a d20 → ${value} vs DC ${state.dc} (${success ? 'SUCCESS' : 'fail'})` },
    { kind: 'dm', who: `AI DM: ${state.dmName}`, text },
  ]
}

// Advance to the next turn; wrap to a new round (with a fresh DC + DM prompt)
// after the last player.
function advanceTurn(state: GameState) {
  const next = state.turnIndex + 1
  state.lastRoll = null
  if (next >= state.players.length) {
    state.turnIndex = 0
    state.round += 1
    state.dc = 10 + Math.floor(Math.random() * 8)
    state.phase = 'player'
    state.log = [...state.log, { kind: 'dm', who: `AI DM: ${state.dmName}`, text: `Round ${state.round}. ${promptFor(state.players[0].name)}` }]
  } else {
    state.turnIndex = next
    state.phase = 'player'
    state.log = [...state.log, { kind: 'dm', who: `AI DM: ${state.dmName}`, text: promptFor(state.players[next].name) }]
  }
}

// After a human acts, auto-resolve any consecutive bot turns until it's a
// human's turn again (or we loop back to the human).
async function runBotTurns(state: GameState) {
  let guard = 0
  while (state.phase === 'player' && !state.players[state.turnIndex].isHuman && guard < 8) {
    const bot = state.players[state.turnIndex]
    const options = CLASS_META[bot.classKey]?.actions ?? ['Investigate']
    const choice = options[Math.floor(Math.random() * options.length)]
    await resolveAction(state, choice)
    advanceTurn(state)
    guard += 1
  }
}

// Showcase public games seeded on first lobby load so the hall isn't empty.
// Each is hosted by a system bot party (no human seat filled yet).
const SEED_GAMES = [
  { name: 'The Gloomspire Sanctum', theme: 'Cave Crypt', dmType: 'Grimjaw', dmLevel: 'Intermediate', host: 'paladin' },
  { name: 'Rune-Carved Door Mystery', theme: 'Magic Tower', dmType: 'Grimjaw', dmLevel: 'Intermediate', host: 'rogue' },
  { name: 'Frostbite Hollow', theme: 'Frozen Keep', dmType: 'Mistweaver', dmLevel: 'Master', host: 'ranger' },
]

async function seedIfEmpty() {
  const existing = await Array.fromAsync(games.query({ index: 'byCreated', where: { listKey: { equals: 'all' } } }))
  if (existing.length > 0) return
  let i = 0
  for (const g of SEED_GAMES) {
    const gameId = `seed-${i}`
    await games.put({
      listKey: 'all', gameId, name: g.name, theme: g.theme, note: `A ${g.theme} adventure`,
      dmType: g.dmType, dmLevel: g.dmLevel, maxParty: MAX_PARTY, status: 'Awaiting Players',
      isPublic: true, accessCode: null, hostUserId: 'system', createdAt: i,
    })
    // Build a party led by a system-owned host character so it's playable/joinable.
    const hostName = ['Kael', 'Zara', 'Lyra'][i] ?? 'Host'
    const players = buildParty({ name: hostName, classKey: g.host, sprite: `/sprites/characters/${g.host}_a.png`, userId: 'system' })
    await gameStates.put({
      gameId, scenario: g.theme, dmName: g.dmType, players, turnIndex: 0, round: 1,
      phase: 'player', dc: 12, lastRoll: null,
      log: [
        { kind: 'dm', who: `AI DM: ${g.dmType}`, text: OPENERS[g.theme] ?? OPENERS['Cave Crypt'] },
        { kind: 'dm', who: `AI DM: ${g.dmType}`, text: promptFor(players[0].name) },
      ],
      inventory: ['scroll', 'potion', 'key', 'gem', 'map'], version: 0,
    })
    i += 1
  }
}

// ─── API ─────────────────────────────────────────────────────────────────────
export const api = new ApiNamespace(scope, 'api', (context) => ({
  // --- Reference data (no auth needed) ---
  async getConstants() {
    return { scenarios: SCENARIOS, dmTypes: DM_TYPES, classMeta: CLASS_META }
  },

  // --- Character ---
  async saveCharacter(input: { name: string; classKey: string; spriteId: string; sprite: string }) {
    const user = await auth.requireAuth(context)
    const character = { userId: user.username, ...input }
    await characters.put(character)
    return character
  },

  async getCharacter() {
    const user = await auth.requireAuth(context)
    return (await characters.get({ userId: user.username })) ?? null
  },

  // --- Lobby ---
  async listGames() {
    await seedIfEmpty()
    // Public listing via constant-PK GSI (no scan).
    const all = await Array.fromAsync(
      games.query({ index: 'byCreated', where: { listKey: { equals: 'all' } } }),
    )
    // Only public games in the lobby; newest first. Attach live party size.
    const publicGames = all.filter((g) => g.isPublic).reverse()
    const result = []
    for (const g of publicGames) {
      const st = await gameStates.get({ gameId: g.gameId })
      result.push({
        id: g.gameId,
        name: g.name,
        theme: g.theme,
        note: g.note,
        maxParty: g.maxParty,
        dmLevel: g.dmLevel,
        dm: g.dmType,
        status: g.status,
        party: st ? st.players.filter((p) => p.isHuman).length : 1,
        partyClasses: st ? st.players.map((p) => p.classKey) : [],
      })
    }
    return result
  },

  async createGame(input: { scenario: string; dmType: string; isPublic: boolean; accessCode?: string }) {
    const user = await auth.requireAuth(context)
    const character = await characters.get({ userId: user.username })
    if (!character) throw new Error('Choose a character first')

    const gameId = uid()
    const scenario = (SCENARIOS as readonly string[]).includes(input.scenario) ? input.scenario : 'Cave Crypt'
    const dmName = (DM_TYPES as readonly string[]).includes(input.dmType) ? input.dmType : 'Grimjaw'
    const name = `${character.name}'s ${scenario} Run`

    await games.put({
      listKey: 'all',
      gameId,
      name,
      theme: scenario,
      note: `A ${scenario} adventure`,
      dmType: dmName,
      dmLevel: 'Intermediate',
      maxParty: MAX_PARTY,
      status: 'In Session',
      isPublic: input.isPublic,
      accessCode: input.accessCode ?? null,
      hostUserId: user.username,
      createdAt: Date.now(),
    })

    const players = buildParty({ name: character.name, classKey: character.classKey, sprite: character.sprite, userId: user.username })
    const state: GameState = {
      gameId,
      scenario,
      dmName,
      players,
      turnIndex: 0,
      round: 1,
      phase: 'player',
      dc: 12,
      lastRoll: null,
      log: [
        { kind: 'dm', who: `AI DM: ${dmName}`, text: OPENERS[scenario] ?? OPENERS['Cave Crypt'] },
        { kind: 'dm', who: `AI DM: ${dmName}`, text: promptFor(players[0].name) },
      ],
      inventory: ['scroll', 'potion', 'key', 'gem', 'map'],
      version: 0,
    }
    await gameStates.put(state)
    return { gameId }
  },

  async joinPrivate(accessCode: string) {
    await auth.requireAuth(context)
    const all = await Array.fromAsync(games.query({ index: 'byCreated', where: { listKey: { equals: 'all' } } }))
    const game = all.find((g) => g.accessCode && g.accessCode === accessCode)
    if (!game) throw new Error('No game found for that access code')
    return { gameId: game.gameId }
  },

  async getState(gameId: string) {
    await auth.requireAuth(context)
    return await loadState(gameId)
  },

  // Claim a seat in a game. If the player already holds a seat, no-op. Otherwise
  // take over the first system-owned (unclaimed) human seat so they can act.
  async joinGame(gameId: string) {
    const user = await auth.requireAuth(context)
    const character = await characters.get({ userId: user.username })
    if (!character) throw new Error('Choose a character first')
    const state = await loadState(gameId)

    if (state.players.some((p) => p.userId === user.username)) {
      return { gameId } // already seated
    }
    const openSeat = state.players.find((p) => p.isHuman && (p.userId === 'system' || p.userId === null))
    if (openSeat) {
      openSeat.userId = user.username
      openSeat.name = character.name
      openSeat.classKey = character.classKey
      openSeat.sprite = character.sprite
      openSeat.color = CLASS_META[character.classKey]?.color ?? openSeat.color
      const g = await games.get({ listKey: 'all', gameId })
      if (g) await games.put({ ...g, status: 'In Session' })
      await saveAndBroadcast(state)
    }
    return { gameId }
  },

  // --- Turn engine ---
  async takeAction(gameId: string, action: string) {
    const user = await auth.requireAuth(context)
    const state = await loadState(gameId)
    const actor = state.players[state.turnIndex]
    if (state.phase !== 'player') throw new Error('Not ready for an action')
    if (!actor.isHuman || actor.userId !== user.username) throw new Error('Not your turn')

    await resolveAction(state, action)
    advanceTurn(state)
    await runBotTurns(state)
    return await saveAndBroadcast(state)
  },

  // --- Realtime channels ---
  async getStateChannel(gameId: string) {
    await auth.requireAuth(context)
    return rt.getChannel('state', gameId)
  },

  async getChatChannel(gameId: string) {
    await auth.requireAuth(context)
    return rt.getChannel('chat', gameId)
  },

  // --- Chat ---
  async getChatHistory(gameId: string) {
    await auth.requireAuth(context)
    return await Array.fromAsync(chatMessages.query({ where: { gameId: { equals: gameId } } }))
  },

  async sendChat(gameId: string, text: string) {
    const user = await auth.requireAuth(context)
    if (!text.trim()) return { ok: false }
    const character = await characters.get({ userId: user.username })
    const msg = {
      gameId,
      ts: Date.now(),
      who: character?.name ?? user.username,
      color: character ? (CLASS_META[character.classKey]?.color ?? 'var(--text)') : 'var(--text)',
      text: text.trim(),
    }
    await chatMessages.put(msg)
    await rt.publish('chat', gameId, msg)
    return { ok: true }
  },
}))
