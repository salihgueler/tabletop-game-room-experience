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
  // Seat kind: 'human' = a real player (has userId), 'ai' = AI companion,
  // 'open' = an unclaimed seat waiting for a human to join.
  seat: z.enum(['human', 'ai', 'open']),
  isHuman: z.boolean(), // true for human & open seats (i.e. NOT AI-controlled)
  userId: z.string().nullable(), // owning account for a claimed human seat
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
  kind: z.enum(['dm', 'action', 'roll', 'system']),
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
  // 'lobby' = still gathering the party (open seats remain, turns don't run);
  // 'live' = all seats filled, the adventure is in progress.
  roomPhase: z.enum(['lobby', 'live']),
  turnIndex: z.number(),
  round: z.number(),
  phase: z.enum(['player', 'resolving', 'dm']),
  dc: z.number(),
  lastRoll: rollSchema,
  log: z.array(logEntrySchema),
  inventory: z.array(z.string()),
  // The current actor's available choices this turn — generated by the DM from
  // the unfolding scene, NOT a fixed class list.
  options: z.array(z.string()),
  version: z.number(),
})

const gameStates = new DistributedTable(scope, 'gameStates', {
  schema: gameStateSchema,
  key: { partitionKey: 'gameId' },
})

// Chat history per game — the full readable transcript. Every DM narration,
// player/AI action, dice roll, and player message lands here.
const chatSchema = z.object({
  gameId: z.string(),
  ts: z.number(),
  who: z.string(),
  color: z.string(),
  text: z.string(),
  // How the line should read in the transcript. 'say' = spoken chat/quip,
  // 'dm' = Dungeon Master narration, 'action' = a chosen action, 'roll' = a
  // dice result, 'system' = lobby/status notes.
  kind: z.enum(['say', 'dm', 'action', 'roll', 'system']).default('say'),
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
    // Live "thinking" feed for the currently-acting companion: streamed tokens
    // of its reasoning, plus start/end markers, so the player can watch the
    // agent reason in real time.
    thinking: Realtime.namespace(z.object({
      gameId: z.string(),
      who: z.string(),
      color: z.string(),
      phase: z.enum(['start', 'delta', 'end']),
      text: z.string(),
    })),
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

// ─── AI Companion party members (one Agent persona per class) ────────────────
// Each non-human seat is driven by its own agent. On its turn the companion
// picks one of its class actions AND speaks a short in-character line. This is
// what makes a session genuinely multi-agent: the DM plus up to three distinct
// companion agents, each reasoning independently.
//
// FAST model when deployed (bots act often — keep latency/cost low), Ollama
// locally, canned fallback offline. inferenceOnly: stateless one-shot calls.
const COMPANION_PERSONAS: Record<string, string> = {
  paladin: 'a stalwart, honorable Paladin who shields allies and speaks with steady resolve',
  sorcerer: 'a brash, curious Sorcerer who loves flashy magic and dry wit',
  rogue: 'a sly, cautious Rogue who trusts shadows and sarcasm over brute force',
  ranger: 'a calm, watchful Ranger attuned to danger, terse and practical',
}

const companions: Record<string, Agent> = {}
for (const cls of CORE_CLASSES) {
  companions[cls] = new Agent(scope, `c-${cls}`, {
    inferenceOnly: true,
    model: {
      deployed: BedrockModels.FAST,
      local: OllamaModels.SMALL,
    },
    systemPrompt: [
      `You role-play ${COMPANION_PERSONAS[cls]} in a 16-bit fantasy tabletop game.`,
      'On your turn you MUST choose exactly one action from the list you are given.',
      'First think out loud in one short sentence (your in-character reasoning for the choice),',
      'then give a short spoken line (max 15 words).',
      'Respond with ONLY compact JSON, no prose, no code fences:',
      '{"reasoning":"<one sentence of why>","action":"<one exact action from the list>","line":"<your spoken line>"}',
    ].join(' '),
  })
}

// Ask a companion agent to decide its move. Streams the agent's raw reasoning
// tokens to the `thinking` channel as they arrive (so the player watches it
// think in real time), then returns the validated action + spoken line +
// reasoning. Falls back to a random action if the model errors or returns junk.
async function companionDecide(
  gameId: string,
  classKey: string,
  name: string,
  color: string,
  scenario: string,
  situation: string,
  options: string[],
): Promise<{ action: string; line: string; reasoning: string }> {
  if (!options || options.length === 0) options = CLASS_META[classKey]?.actions ?? ['Investigate']
  const fallback = { action: options[Math.floor(Math.random() * options.length)], line: '', reasoning: '' }
  const agent = companions[classKey]
  const emit = (phase: 'start' | 'delta' | 'end', text: string) =>
    rt.publish('thinking', gameId, { gameId, who: name, color, phase, text })

  if (!agent) {
    await emit('start', ''); await emit('end', '')
    return fallback
  }

  const message = [
    `Scenario: ${scenario}.`,
    `Situation: ${situation}`,
    `You are ${name}. Choose ONE action from: ${options.join(', ')}.`,
    'Reply with JSON only.',
  ].join(' ')

  await emit('start', '')
  let raw = ''
  try {
    const result = await agent.stream(message)
    // Stream tokens live to the thinking channel as the agent produces them.
    try {
      const channel = await result.channel
      const sub = channel.subscribe((chunk) => {
        if (chunk.type === 'text-delta' && chunk.text) {
          raw += chunk.text
          void emit('delta', chunk.text)
        }
      })
      await sub.established
    } catch {
      // channel not available (e.g. some local mocks) — complete() still works
    }
    const done = await result.complete()
    if (!raw) raw = (done.text || '')
    raw = raw.trim()

    const match = raw.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0]) as { action?: string; line?: string; reasoning?: string }
      const picked = options.find(
        (o) => o.toLowerCase() === (parsed.action || '').toLowerCase() ||
               (parsed.action || '').toLowerCase().includes(o.toLowerCase()) ||
               o.toLowerCase().includes((parsed.action || '').toLowerCase()),
      )
      if (picked) {
        await emit('end', (parsed.reasoning || '').toString().slice(0, 200))
        return {
          action: picked,
          line: (parsed.line || '').toString().slice(0, 120),
          reasoning: (parsed.reasoning || '').toString().slice(0, 200),
        }
      }
    }
  } catch {
    // model unavailable / bad output — fall through
  }
  await emit('end', '')
  return fallback
}

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

// Ask the AI DM to set the scene for the *next* actor and offer 3-4 concrete,
// situation-specific choices tailored to who is up and what just happened. This
// is what makes actions reflect the campaign state instead of a fixed class
// menu. Returns { prompt, options }. Falls back to a generic prompt + the
// actor's class actions if the model errors or returns junk.
async function nextScene(
  gameId: string,
  dmName: string,
  scenario: string,
  recentLog: string,
  actorName: string,
  actorClass: string,
): Promise<{ prompt: string; options: string[] }> {
  const className = CLASS_META[actorClass]?.name ?? 'Adventurer'
  const fallback = { prompt: promptFor(actorName), options: CLASS_META[actorClass]?.actions ?? ['Investigate'] }
  // The DM "thinks" on the shared thinking channel so the player watches the
  // scene being set before their options unlock.
  const emit = (phase: 'start' | 'delta' | 'end', text: string) =>
    rt.publish('thinking', gameId, { gameId, who: `DM ${dmName}`, color: 'var(--dm)', phase, text })
  const message = [
    `Scenario: ${scenario}.`,
    `Recent events:\n${recentLog}`,
    `It is now ${actorName} the ${className}'s turn.`,
    `Address ${actorName} directly with a one-sentence prompt describing the immediate situation,`,
    `then offer 3 to 4 SHORT, concrete action choices that fit THIS moment and a ${className}'s abilities`,
    `(2-4 words each, e.g. "Pry open the door", "Cast light", "Listen at the wall"). Vary them by scene.`,
    'Respond with ONLY compact JSON, no prose, no code fences:',
    '{"prompt":"<one sentence to the player>","options":["...","...","..."]}',
  ].join(' ')
  // Coerce whatever the model returns for `options` into a clean string[].
  const coerceOptions = (v: unknown): string[] => {
    let arr: unknown[] = []
    if (Array.isArray(v)) arr = v
    else if (typeof v === 'string') arr = v.split(/[\n,]/) // comma/newline list
    return arr
      .map((o) => (typeof o === 'string' ? o : (o as any)?.action ?? (o as any)?.label ?? ''))
      .map((s) => String(s).replace(/^[\s"'\-*\d.)]+/, '').trim())
      .filter(Boolean)
      .slice(0, 4)
  }

  await emit('start', '')
  // Up to two attempts — the small local model occasionally emits malformed JSON.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await dm.stream(message)
      let raw = ''
      try {
        const channel = await result.channel
        const sub = channel.subscribe((chunk) => {
          if (chunk.type === 'text-delta' && chunk.text) { raw += chunk.text; void emit('delta', chunk.text) }
        })
        await sub.established
      } catch { /* no channel (some mocks) — complete() still works */ }
      const done = await result.complete()
      if (!raw) raw = (done.text || '')
      const match = raw.trim().match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0]) as { prompt?: string; options?: unknown }
        const opts = coerceOptions(parsed.options)
        if (opts.length >= 2) {
          const prompt = (parsed.prompt || fallback.prompt).toString().slice(0, 200)
          await emit('end', prompt)
          return { prompt, options: opts }
        }
      }
    } catch {
      // malformed output — retry once, then fall through to fallback
    }
  }
  await emit('end', fallback.prompt)
  return fallback
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const rollD20 = () => 1 + Math.floor(Math.random() * 20)
const spriteForRoll = (value: number) => Math.min(24, Math.max(1, Math.round((value / 20) * 24)))
const diceColorFor = (classKey: string) => (['paladin', 'sorcerer'].includes(classKey) ? 'blue' : 'red')

const BOT_NAMES = ['Zara', 'Thorn', 'Lyra', 'Fen', 'Mira', 'Bram']

type Player = z.infer<typeof playerSchema>
type GameState = z.infer<typeof gameStateSchema>

// Seat predicates — the single source of truth for occupancy across the app.
const isRealHuman = (p: Player) => p.seat === 'human' && !!p.userId
const isOpenSeat = (p: Player) => p.seat === 'open'
const isAiSeat = (p: Player) => p.seat === 'ai'
// An actor takes a turn only when the room is 'live'. Humans act via the API;
// AI seats are auto-resolved by the bot stepper. Open seats never get here
// because turns don't run until the room is full.

// Build the 4-seat party. Seat 0 is the creating human. The other 3 seats are
// either AI companions (fillMode='ai') or left open for other humans
// (fillMode='humans').
function buildParty(
  human: { name: string; classKey: string; sprite: string; userId: string },
  fillMode: 'ai' | 'humans',
): Player[] {
  const players: Player[] = [{
    id: 'you', name: human.name, classKey: human.classKey, sprite: human.sprite,
    color: CLASS_META[human.classKey]?.color ?? 'var(--paladin)',
    seat: 'human', isHuman: true, userId: human.userId, hp: 20, slot: 0,
  }]
  const botClasses = CORE_CLASSES.filter((c) => c !== human.classKey)
  const usedNames: string[] = []
  for (let i = 0; i < 3; i++) {
    const ck = botClasses[i % botClasses.length]
    if (fillMode === 'ai') {
      const variant = `${ck}_${'abcd'[Math.floor(Math.random() * 4)]}`
      let name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]
      while (usedNames.includes(name)) name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]
      usedNames.push(name)
      players.push({
        id: `bot${i}`, name, classKey: ck, sprite: `/sprites/characters/${variant}.png`,
        color: CLASS_META[ck]?.color ?? 'var(--rogue)', seat: 'ai', isHuman: false, userId: null, hp: 20, slot: i + 1,
      })
    } else {
      // Open seat awaiting a human — shown as an empty chair until claimed.
      players.push({
        id: `seat${i}`, name: 'Open Seat', classKey: ck, sprite: `/sprites/characters/${ck}_a.png`,
        color: 'var(--text-dim)', seat: 'open', isHuman: true, userId: null, hp: 20, slot: i + 1,
      })
    }
  }
  return players
}

// Fill every remaining open seat with an AI companion (host chose to start now,
// or enough humans never showed). Flips the room to 'live'.
function fillOpenSeatsWithAi(state: GameState) {
  const usedNames = state.players.filter((p) => isRealHuman(p) || isAiSeat(p)).map((p) => p.name)
  for (const p of state.players) {
    if (!isOpenSeat(p)) continue
    let name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]
    while (usedNames.includes(name)) name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]
    usedNames.push(name)
    p.seat = 'ai'
    p.isHuman = false
    p.name = name
    p.sprite = `/sprites/characters/${p.classKey}_${'abcd'[Math.floor(Math.random() * 4)]}.png`
    p.color = CLASS_META[p.classKey]?.color ?? 'var(--rogue)'
  }
}

const hasOpenSeat = (state: GameState) => state.players.some(isOpenSeat)

// Flip a full room to 'live' and generate the opening scene for seat 0. The DM
// "thinks" (phase 'dm', streamed) before the first player's actions unlock.
async function beginAdventure(state: GameState) {
  if (state.roomPhase === 'live') return
  state.roomPhase = 'live'
  state.turnIndex = 0
  state.phase = 'dm'
  const first = state.players[0]
  const opener = OPENERS[state.scenario] ?? OPENERS['Cave Crypt']
  await transcribe(state, [{ kind: 'dm', who: `AI DM: ${state.dmName}`, text: opener }])
  const { prompt, options } = await nextScene(state.gameId, state.dmName, state.scenario, opener, first.name, first.classKey)
  state.options = options
  await transcribe(state, [{ kind: 'dm', who: `AI DM: ${state.dmName}`, text: prompt }])
  state.phase = 'player'
}

// Keep the lobby row's status/joinability in sync with the live seat state.
async function syncLobbyStatus(state: GameState) {
  const g = await games.get({ listKey: 'all', gameId: state.gameId })
  if (g) await games.put({ ...g, status: hasOpenSeat(state) ? 'Awaiting Players' : 'In Session' })
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

// Write one or more events to BOTH the board log (drives the board + DM context)
// and the persistent chat transcript (the scrollable history), broadcasting each
// to the chat channel. ts is made monotonic within the batch so ordering holds.
async function transcribe(
  state: GameState,
  entries: Array<{ kind: 'dm' | 'action' | 'roll' | 'say' | 'system'; who: string; color?: string; text: string }>,
) {
  const withColor = entries.map((e) => ({ ...e, color: e.color ?? 'var(--dm)' }))
  state.log = [...state.log, ...withColor.map((e) => ({ kind: (e.kind === 'say' ? 'dm' : e.kind) as 'dm' | 'action' | 'roll' | 'system', who: e.who, color: e.color, text: e.text }))]
  const base = Date.now()
  for (let i = 0; i < withColor.length; i++) {
    const e = withColor[i]
    const msg = { gameId: state.gameId, ts: base + i, who: e.who, color: e.color, text: e.text, kind: e.kind }
    await chatMessages.put(msg)
    await rt.publish('chat', state.gameId, msg)
  }
}

// Resolve a single actor's action: roll a d20, resolve vs the DC, narrate the
// outcome, and record the action + roll + narration to the log and chat.
async function resolveAction(state: GameState, action: string) {
  const actor = state.players[state.turnIndex]
  const value = rollD20()
  const success = value >= state.dc
  const text = await narrate(state.scenario, action, actor.name, value, state.dc)
  state.lastRoll = {
    value, sprite: spriteForRoll(value), color: diceColorFor(actor.classKey),
    dc: state.dc, success, actor: actor.name, action,
  }
  await transcribe(state, [
    { kind: 'action', who: actor.name, color: actor.color, text: `${actor.name} chooses “${action}”.` },
    { kind: 'roll', who: actor.name, color: actor.color, text: `🎲 rolled ${value} vs DC ${state.dc} — ${success ? 'SUCCESS' : 'FAIL'}` },
    { kind: 'dm', who: `AI DM: ${state.dmName}`, text },
  ])
}

// A compact transcript of the last few log lines, fed to the DM so its scene
// setting and action options build on what actually just happened.
function recentLog(state: GameState, n = 6): string {
  return state.log.slice(-n).map((l) => l.text).join('\n')
}

// Advance to the next turn; wrap to a new round after the last player. Asks the
// DM to set the scene for whoever is up and generate their contextual action
// options (stored on state.options).
async function advanceTurn(state: GameState) {
  const next = state.turnIndex + 1
  state.lastRoll = null
  if (next >= state.players.length) {
    state.turnIndex = 0
    state.round += 1
    state.dc = 10 + Math.floor(Math.random() * 8)
  } else {
    state.turnIndex = next
  }
  // DM sets the scene (thinking streams to the client); actions stay locked
  // until this resolves and we flip back to the 'player' phase.
  state.phase = 'dm'
  const actor = state.players[state.turnIndex]
  const { prompt, options } = await nextScene(state.gameId, state.dmName, state.scenario, recentLog(state), actor.name, actor.classKey)
  state.options = options
  const roundTag = next >= state.players.length ? `Round ${state.round}. ` : ''
  await transcribe(state, [{ kind: 'dm', who: `AI DM: ${state.dmName}`, text: `${roundTag}${prompt}` }])
  state.phase = 'player'
}

// Post an in-character companion line to the game's chat (persist + broadcast).
async function postBotChat(gameId: string, name: string, color: string, text: string) {
  const msg = { gameId, ts: Date.now(), who: name, color, text, kind: 'say' as const }
  await chatMessages.put(msg)
  await rt.publish('chat', gameId, msg)
}

// The most recent DM line — the "situation" a companion is reacting to.
function currentSituation(state: GameState): string {
  const lastDm = [...state.log].reverse().find((l) => l.kind === 'dm')
  return lastDm?.text ?? state.scenario
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
    // Seeded games are OPEN lobbies: all four seats await players. The first
    // person to join claims seat 0 and becomes the host, then decides whether to
    // fill the rest with AI or wait for more humans.
    const players: Player[] = CORE_CLASSES.map((ck, slot) => ({
      id: `seat${slot}`, name: 'Open Seat', classKey: ck, sprite: `/sprites/characters/${ck}_a.png`,
      color: 'var(--text-dim)', seat: 'open' as const, isHuman: true, userId: null, hp: 20, slot,
    }))
    await gameStates.put({
      gameId, scenario: g.theme, dmName: g.dmType, players, roomPhase: 'lobby',
      turnIndex: 0, round: 1, phase: 'player', dc: 12, lastRoll: null,
      log: [
        { kind: 'dm', who: `AI DM: ${g.dmType}`, text: OPENERS[g.theme] ?? OPENERS['Cave Crypt'] },
        { kind: 'dm', who: `AI DM: ${g.dmType}`, text: 'Waiting for adventurers to take their seats…' },
      ],
      inventory: ['scroll', 'potion', 'key', 'gem', 'map'],
      options: [],
      version: 0,
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
    // Only public games in the lobby; newest first. Occupancy is computed from
    // the live state: seats held by real humans vs AI-filled/open seats.
    const publicGames = all.filter((g) => g.isPublic).reverse()
    const result = []
    for (const g of publicGames) {
      const st = await gameStates.get({ gameId: g.gameId })
      const filled = st ? st.players.filter((p) => !isOpenSeat(p)).length : 0
      const open = st ? hasOpenSeat(st) : false
      result.push({
        id: g.gameId,
        name: g.name,
        theme: g.theme,
        note: g.note,
        maxParty: g.maxParty,
        dmLevel: g.dmLevel,
        dm: g.dmType,
        // Open seats remaining → still gathering the party (joinable, not in
        // progress). No open seats → full, in progress, watch-only.
        full: !open,
        status: open ? 'Awaiting Players' : 'In Session',
        party: filled,
        partyClasses: st ? st.players.map((p) => p.classKey) : [],
        members: st ? st.players.map((p) => ({ name: p.name, classKey: p.classKey, seat: p.seat })) : [],
      })
    }
    return result
  },

  async createGame(input: { scenario: string; dmType: string; isPublic: boolean; accessCode?: string; fillMode?: 'ai' | 'humans' }) {
    const user = await auth.requireAuth(context)
    const character = await characters.get({ userId: user.username })
    if (!character) throw new Error('Choose a character first')

    const gameId = uid()
    const scenario = (SCENARIOS as readonly string[]).includes(input.scenario) ? input.scenario : 'Cave Crypt'
    const dmName = (DM_TYPES as readonly string[]).includes(input.dmType) ? input.dmType : 'Grimjaw'
    const fillMode = input.fillMode === 'humans' ? 'humans' : 'ai'
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
      // AI-filled starts live; waiting-for-humans starts in the lobby.
      status: fillMode === 'ai' ? 'In Session' : 'Awaiting Players',
      isPublic: input.isPublic,
      accessCode: input.accessCode ?? null,
      hostUserId: user.username,
      createdAt: Date.now(),
    })

    const players = buildParty({ name: character.name, classKey: character.classKey, sprite: character.sprite, userId: user.username }, fillMode)
    // Build the base state in the lobby, then (for AI-filled games) begin the
    // adventure — which runs the DM's opening thinking + scene, consistently.
    const state: GameState = {
      gameId,
      scenario,
      dmName,
      players,
      roomPhase: 'lobby',
      turnIndex: 0,
      round: 1,
      phase: 'player',
      dc: 12,
      lastRoll: null,
      log: [{ kind: 'dm', who: `AI DM: ${dmName}`, text: 'Waiting for adventurers to take their seats…' }],
      inventory: ['scroll', 'potion', 'key', 'gem', 'map'],
      options: [],
      version: 0,
    }
    if (fillMode === 'ai') await beginAdventure(state)
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
    const user = await auth.requireAuth(context)
    const state = await loadState(gameId)
    // Tell the client which seat (if any) belongs to the viewer. No owned seat
    // means they are a spectator (watch-only) — the client uses this to decide
    // whether to enable actions, instead of guessing.
    const mySeatId = state.players.find((p) => p.userId === user.username)?.id ?? null
    return { ...state, viewer: { userId: user.username, mySeatId, spectator: mySeatId === null } }
  },

  // Claim an open seat so the caller can play. If they already hold one, no-op.
  // If no seat is open (all filled by humans/AI), they remain a spectator
  // (watch-only) — returns { seated:false }. When the last open seat is filled,
  // the room goes live and the opening scene is generated.
  async joinGame(gameId: string) {
    const user = await auth.requireAuth(context)
    const character = await characters.get({ userId: user.username })
    if (!character) throw new Error('Choose a character first')
    const state = await loadState(gameId)

    if (state.players.some((p) => p.userId === user.username)) {
      return { gameId, seated: true } // already seated
    }
    const openSeat = state.players.find(isOpenSeat)
    if (!openSeat) {
      return { gameId, seated: false } // full → spectator
    }
    openSeat.seat = 'human'
    openSeat.isHuman = true
    openSeat.userId = user.username
    openSeat.name = character.name
    openSeat.classKey = character.classKey
    openSeat.sprite = character.sprite
    openSeat.color = CLASS_META[character.classKey]?.color ?? openSeat.color

    if (!hasOpenSeat(state)) await beginAdventure(state) // party complete → go live
    await syncLobbyStatus(state)
    await saveAndBroadcast(state)
    return { gameId, seated: true }
  },

  // Host fills the remaining open seats with AI companions and starts now.
  async startWithAi(gameId: string) {
    const user = await auth.requireAuth(context)
    const state = await loadState(gameId)
    const host = state.players.find((p) => p.slot === 0)
    if (host?.userId !== user.username) throw new Error('Only the host can start the game')
    if (state.roomPhase === 'live') return { gameId }
    fillOpenSeatsWithAi(state)
    await beginAdventure(state)
    await syncLobbyStatus(state)
    await saveAndBroadcast(state)
    return { gameId }
  },

  // --- Turn engine ---
  // A human takes their action. This resolves ONLY their turn and advances to the
  // next actor, so the client can then step bot turns one at a time (visible to
  // everyone). It does NOT auto-run the bots.
  async takeAction(gameId: string, action: string) {
    const user = await auth.requireAuth(context)
    const state = await loadState(gameId)
    if (state.roomPhase !== 'live') throw new Error('The game has not started yet')
    const actor = state.players[state.turnIndex]
    if (state.phase !== 'player') throw new Error('Not ready for an action')
    // Only the human who owns the CURRENT seat may act.
    if (actor.seat !== 'human' || actor.userId !== user.username) throw new Error('Not your turn')

    await resolveAction(state, action)
    await advanceTurn(state)
    return await saveAndBroadcast(state)
  },

  // Resolve exactly ONE AI-companion turn (the current actor, if it's an AI
  // seat). Returns the updated state plus whether it's still an AI turn, so the
  // client can loop with pacing and show each companion acting in sequence.
  // No-op when it's a human's turn or the room isn't live.
  async advanceBotTurn(gameId: string) {
    await auth.requireAuth(context)
    const state = await loadState(gameId)
    const actor = state.players[state.turnIndex]
    if (state.roomPhase !== 'live' || state.phase !== 'player' || !isAiSeat(actor)) {
      return { state, botActed: false, botTurnPending: false }
    }
    const { action, line } = await companionDecide(
      state.gameId, actor.classKey, actor.name, actor.color, state.scenario, currentSituation(state), state.options,
    )
    if (line) await postBotChat(state.gameId, actor.name, actor.color, line)
    await resolveAction(state, action)
    await advanceTurn(state)
    const next = state.players[state.turnIndex]
    const botTurnPending = state.phase === 'player' && isAiSeat(next)
    const saved = await saveAndBroadcast(state)
    return { state: saved, botActed: true, botTurnPending }
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

  async getThinkingChannel(gameId: string) {
    await auth.requireAuth(context)
    return rt.getChannel('thinking', gameId)
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
      kind: 'say' as const,
    }
    await chatMessages.put(msg)
    await rt.publish('chat', gameId, msg)
    return { ok: true }
  },
}))
