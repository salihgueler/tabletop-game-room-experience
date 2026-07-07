/**
 * Backend — aws-blocks/index.ts  (MODULE 05 — Game state & chat: Maps → DistributedTable)
 *
 * Change from module 04: the last two persistence mocks are gone. Authoritative
 * per-game state lives in `gameStates` (one item per game, keyed by gameId), and
 * the chat transcript lives in `chatMessages` (keyed by gameId + ts, so a single
 * query returns a game's whole history in order). Persistence is now COMPLETE —
 * every byte of game state survives a restart, exactly like production.
 *
 * This module is also where the authoritative turn engine gets its spotlight:
 * the d20 roll, DC check, narration, and turn advance all run server-side and
 * only *now* land in durable storage. See the engine walk-through in the README.
 *
 * Still mocked (later modules replace these):
 *   - realtime ............... stubbed channels (Module 06 → Realtime)
 *   - AI .................... canned narration  (Modules 07–08 → Agent)
 *
 * Only edit THIS file for backend logic. index.cdk.ts / index.handler.ts /
 * client.js are generated glue — never edit them by hand.
 */
import {
  ApiNamespace,
  Scope,
  AuthBasic,
  DistributedTable,
} from "@aws-blocks/blocks";
import { z } from "zod";

// Short scope id — some services cap namespace names at 50 chars. "tt" = tabletop.
const scope = new Scope("tt");

// ─── Auth (AuthBasic) ────────────────────────────────────────────────────────
// Real username/password auth. `crossDomain` is only needed when the frontend
// and API live on different registrable domains (the sandbox deploy in module 09
// sets BLOCKS_SANDBOX=true); locally the Vite proxy keeps everything same-origin.
const auth = new AuthBasic(scope, "auth", {
  passwordPolicy: { minLength: 8 },
  crossDomain: process.env.BLOCKS_SANDBOX === "true",
});

// ─── Domain constants ──────────────────────────────────────────────────────────
// NOT exported — every top-level `export` becomes an API namespace, and these are
// data, not methods. They reach the frontend via getConstants().
const SCENARIOS = [
  "Cave Crypt",
  "Dungeon Crawl",
  "Magic Tower",
  "Frozen Keep",
  "Sunken Vault",
] as const;
const DM_TYPES = ["Grimjaw", "Xandros", "Mistweaver", "Hollowvoice"] as const;
const CORE_CLASSES = ["paladin", "sorcerer", "rogue", "ranger"] as const;
const MAX_PARTY = 4;
const SESSION_MS = Math.round(
  (Number(process.env.SESSION_MINUTES) || 15) * 60 * 1000,
);

const CLASS_META: Record<
  string,
  { name: string; color: string; actions: string[] }
> = {
  paladin: {
    name: "Paladin",
    color: "var(--paladin)",
    actions: ["Attack", "Defend Ally", "Cast Bless", "Investigate"],
  },
  sorcerer: {
    name: "Sorcerer",
    color: "var(--sorcerer)",
    actions: ["Cast Firebolt", "Detect Magic", "Cast Shield", "Investigate"],
  },
  rogue: {
    name: "Rogue",
    color: "var(--rogue)",
    actions: ["Sneak Attack", "Disarm Trap", "Pick Lock", "Investigate"],
  },
  ranger: {
    name: "Ranger",
    color: "var(--ranger)",
    actions: ["Fire Arrow", "Track", "Cast Hunter’s Mark", "Investigate"],
  },
};

const OPENERS: Record<string, string> = {
  "Cave Crypt":
    "A stone door stands before you, carved with runes. Cold air seeps from the cracks.",
  "Dungeon Crawl":
    "Torchlight flickers down a corridor of damp brick. Something skitters in the dark ahead.",
  "Magic Tower":
    "Arcane sigils spiral up the tower wall, humming with barely-contained power.",
  "Frozen Keep":
    "Frost coats the iron gate. Your breath clouds as a distant howl echoes across the ice.",
  "Sunken Vault":
    "Water laps at your ankles. Ahead, a rusted vault door glints beneath the surface.",
};

// ─── Data: characters (DistributedTable) ─────────────────────────────────────
// A user's chosen character, keyed by userId (one hero per account). The Zod
// schema validates every write; `get({ userId })` reads by the partition key.
const characterSchema = z.object({
  userId: z.string(),
  name: z.string(),
  classKey: z.string(),
  spriteId: z.string(),
  sprite: z.string(),
});

const characters = new DistributedTable(scope, "characters", {
  schema: characterSchema,
  key: { partitionKey: "userId" },
});

// ─── Data: games / lobby rows (DistributedTable + GSI) ────────────────────────
// One row per game in the public lobby. `listKey` is a CONSTANT partition key
// (always "all") so a single query over the `byCreated` index returns every game
// — a full-table scan() would be the wrong tool for a listing you run constantly,
// so we index instead. `gameId` is the sort key (unique per game); `byCreated`
// sorts by `createdAt`.
const gameSchema = z.object({
  listKey: z.string(), // constant "all" — the whole-collection partition
  gameId: z.string(), // sort key — unique per game
  name: z.string(),
  theme: z.string(),
  note: z.string(),
  dmType: z.string(),
  dmLevel: z.string(),
  maxParty: z.number(),
  status: z.string(),
  isPublic: z.boolean(),
  accessCode: z.string().nullable(),
  hostUserId: z.string(),
  createdAt: z.number(),
});

const games = new DistributedTable(scope, "games", {
  schema: gameSchema,
  key: { partitionKey: "listKey", sortKey: "gameId" },
  indexes: {
    // Query this index with where:{ listKey:{ equals:"all" } } to get all games.
    byCreated: { partitionKey: "listKey", sortKey: "createdAt" },
  },
});

// ─── Data: game state + chat (DistributedTable) ──────────────────────────────
// Schemas for the embedded shapes (players, rolls, log lines) so the whole game
// state validates on every write. Types are inferred from these below.
const playerSchema = z.object({
  id: z.string(),
  name: z.string(),
  classKey: z.string(),
  sprite: z.string(),
  color: z.string(),
  seat: z.enum(["human", "ai", "open"]),
  isHuman: z.boolean(),
  userId: z.string().nullable(),
  hp: z.number(),
  slot: z.number(),
});
const rollSchema = z
  .object({
    value: z.number(),
    sprite: z.number(),
    color: z.string(),
    dc: z.number(),
    success: z.boolean(),
    actor: z.string(),
    action: z.string(),
  })
  .nullable();
const logEntrySchema = z.object({
  kind: z.enum(["dm", "action", "roll", "system"]),
  who: z.string(),
  color: z.string().optional(),
  text: z.string(),
});

// Authoritative per-game state — ONE item per game, keyed by gameId.
const gameStateSchema = z.object({
  gameId: z.string(),
  scenario: z.string(),
  dmName: z.string(),
  players: z.array(playerSchema),
  roomPhase: z.enum(["lobby", "live", "ended"]),
  endsAt: z.number().nullable(),
  turnIndex: z.number(),
  round: z.number(),
  phase: z.enum(["player", "resolving", "dm"]),
  dc: z.number(),
  lastRoll: rollSchema,
  log: z.array(logEntrySchema),
  inventory: z.array(z.string()),
  options: z.array(z.string()),
  version: z.number(),
});
const gameStates = new DistributedTable(scope, "gameStates", {
  schema: gameStateSchema,
  key: { partitionKey: "gameId" },
});

// Chat transcript — keyed by (gameId, ts). Querying by gameId returns a game's
// whole history, sorted by the ts sort key.
const chatSchema = z.object({
  gameId: z.string(),
  ts: z.number(),
  who: z.string(),
  color: z.string(),
  text: z.string(),
  kind: z.enum(["say", "dm", "action", "roll", "system"]).default("say"),
});
const chatMessages = new DistributedTable(scope, "chat", {
  schema: chatSchema,
  key: { partitionKey: "gameId", sortKey: "ts" },
});

// ═══════════════════════════════════════════════════════════════════════════════
// MOCKS — auth, characters, games, state, and chat are now ALL REAL. Only realtime
// and AI remain faked (modules 06–08).
// ═══════════════════════════════════════════════════════════════════════════════

// ─── MOCK: realtime (Module 06 → Realtime) ──────────────────────────────────────
// Real Realtime pushes live updates over WebSocket. The frontend wraps every
// subscription in try/catch and falls back to polling getState, so a channel
// that never delivers is safe: the game still works, just via refetch. We return
// a channel-shaped stub so `channel.subscribe(...)` doesn't blow up.
function fakeChannel() {
  return {
    subscribe(_handler: (msg: unknown) => void) {
      return {
        established: Promise.resolve(),
        unsubscribe() {},
      };
    },
  };
}
// No-op publish — nothing is listening in the mock. Module 05 replaces this with
// rt.publish(...) so other players (and the bot stepper) get live updates.
function publish(_ns: string, _key: string, _payload: unknown) {}

// ═══════════════════════════════════════════════════════════════════════════════
// GAME TYPES  — all inferred from the Zod table/embedded schemas above, so the
// runtime validation and the compile-time types can never drift apart.
// ═══════════════════════════════════════════════════════════════════════════════
type Player = z.infer<typeof playerSchema>;
type Roll = z.infer<typeof rollSchema>;
type LogEntry = z.infer<typeof logEntrySchema>;
type Character = z.infer<typeof characterSchema>;
type Game = z.infer<typeof gameSchema>;
type ChatMsg = z.infer<typeof chatSchema>;
type GameState = z.infer<typeof gameStateSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK: AI (Modules 07–08 → Agent). Deterministic "canned" narration — no model,
// no network. The real DM/companion agents replace these with streamed LLM calls,
// but this keeps the game fully playable offline from module 01.
// ═══════════════════════════════════════════════════════════════════════════════
function categorize(
  action: string,
): "attack" | "magic" | "skill" | "investigate" | "support" {
  const s = action.toLowerCase();
  if (/(attack|strike|arrow|fire)/.test(s)) return "attack";
  if (/(cast|magic|firebolt|shield|phase|haunt)/.test(s)) {
    if (/(bless|shield|mark)/.test(s)) return "support";
    if (/(detect|magic)/.test(s)) return "investigate";
    return "magic";
  }
  if (/(disarm|lock|pick|track|sneak|defend)/.test(s)) return "skill";
  return "investigate";
}

const RESULTS: Record<
  string,
  { hit: (a: string) => string; miss: (a: string) => string }
> = {
  attack: {
    hit: (a) => `${a} strikes true! Steel bites deep and the shadowed figure reels.`,
    miss: (a) => `${a} lunges, but the target twists away. The blade meets only air.`,
  },
  magic: {
    hit: (a) => `${a} weaves the incantation flawlessly — arcane force erupts, lighting the chamber.`,
    miss: (a) => `${a}'s spell sputters and fizzles into wasted motes of mana.`,
  },
  skill: {
    hit: (a) => `${a} works with practiced precision. A soft click — success.`,
    miss: (a) => `${a}'s hands slip. The mechanism jams with an ominous grind.`,
  },
  investigate: {
    hit: (a) => `${a} studies the scene and uncovers a hidden detail the others missed.`,
    miss: (a) => `${a} searches, but the shadows keep their secrets for now.`,
  },
  support: {
    hit: (a) => `${a} bolsters the party — a warm glow steadies every hand in the room.`,
    miss: (a) => `${a}'s effort falters; the blessing fades before it takes hold.`,
  },
};

function cannedNarration(
  action: string,
  actor: string,
  roll: number,
  dc: number,
): string {
  const bank = RESULTS[categorize(action)] || RESULTS.investigate;
  const line = roll >= dc ? bank.hit(actor) : bank.miss(actor);
  const crit = roll === 20 ? " A CRITICAL success — the whole party feels the momentum shift!" : "";
  const fumble = roll === 1 ? " A critical fumble! The misstep costs the party dearly." : "";
  return `${line}${crit}${fumble}`;
}

const PROMPTS = [
  (n: string) => `The path forks and the air grows colder. What do you do, ${n}?`,
  (n: string) => `A sound echoes from deeper within. ${n}, how do you proceed?`,
  (n: string) => `The party looks to you. ${n}, make your move.`,
  (n: string) => `Danger prickles at the back of your neck. Your call, ${n}.`,
];
const promptFor = (name: string) =>
  PROMPTS[Math.floor(Math.random() * PROMPTS.length)](name);

// MOCK DM narration — always the canned outcome (module 07 tries the Agent first).
async function narrate(
  scenario: string,
  action: string,
  actor: string,
  roll: number,
  dc: number,
): Promise<string> {
  return cannedNarration(action, actor, roll, dc);
}

// MOCK scene generator — a generic prompt + the actor's fixed class actions
// (module 07's Agent replaces this with contextual, scene-specific options).
async function nextScene(
  gameId: string,
  dmName: string,
  scenario: string,
  recent: string,
  actorName: string,
  actorClass: string,
): Promise<{ prompt: string; options: string[] }> {
  return {
    prompt: promptFor(actorName),
    options: CLASS_META[actorClass]?.actions ?? ["Investigate"],
  };
}

// MOCK companion decision — pick a random valid action + a canned in-character
// line (module 08's per-class Agent replaces this with real reasoning).
const COMPANION_LINES: Record<string, string[]> = {
  paladin: ["For the light — hold the line!", "Steady, friends. I've got you."],
  sorcerer: ["Watch this. It'll be spectacular.", "Magic solves most things."],
  rogue: ["Shadows first, questions later.", "I'll handle the tricky part."],
  ranger: ["I've got eyes on it.", "Quiet. Something moved."],
};
async function companionDecide(
  gameId: string,
  classKey: string,
  name: string,
  color: string,
  scenario: string,
  situation: string,
  options: string[],
): Promise<{ action: string; line: string; reasoning: string }> {
  const opts = options?.length ? options : (CLASS_META[classKey]?.actions ?? ["Investigate"]);
  const bank = COMPANION_LINES[classKey] ?? [""];
  return {
    action: opts[Math.floor(Math.random() * opts.length)],
    line: bank[Math.floor(Math.random() * bank.length)],
    reasoning: "",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TURN ENGINE  (Module 06 hardens this — it stays plain server logic, no new block)
// ═══════════════════════════════════════════════════════════════════════════════
const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const rollD20 = () => 1 + Math.floor(Math.random() * 20);
const spriteForRoll = (value: number) =>
  Math.min(24, Math.max(1, Math.round((value / 20) * 24)));
const diceColorFor = (classKey: string) =>
  ["paladin", "sorcerer"].includes(classKey) ? "blue" : "red";

const BOT_NAMES = ["Zara", "Thorn", "Lyra", "Fen", "Mira", "Bram"];

const isRealHuman = (p: Player) => p.seat === "human" && !!p.userId;
const isOpenSeat = (p: Player) => p.seat === "open";
const isAiSeat = (p: Player) => p.seat === "ai";

function buildParty(
  human: { name: string; classKey: string; sprite: string; userId: string },
  fillMode: "ai" | "humans",
): Player[] {
  const players: Player[] = [
    {
      id: "you",
      name: human.name,
      classKey: human.classKey,
      sprite: human.sprite,
      color: CLASS_META[human.classKey]?.color ?? "var(--paladin)",
      seat: "human",
      isHuman: true,
      userId: human.userId,
      hp: 20,
      slot: 0,
    },
  ];
  const botClasses = CORE_CLASSES.filter((c) => c !== human.classKey);
  const usedNames: string[] = [];
  for (let i = 0; i < 3; i++) {
    const ck = botClasses[i % botClasses.length];
    if (fillMode === "ai") {
      const variant = `${ck}_${"abcd"[Math.floor(Math.random() * 4)]}`;
      let name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
      while (usedNames.includes(name))
        name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
      usedNames.push(name);
      players.push({
        id: `bot${i}`,
        name,
        classKey: ck,
        sprite: `/sprites/characters/${variant}.png`,
        color: CLASS_META[ck]?.color ?? "var(--rogue)",
        seat: "ai",
        isHuman: false,
        userId: null,
        hp: 20,
        slot: i + 1,
      });
    } else {
      players.push({
        id: `seat${i}`,
        name: "Open Seat",
        classKey: ck,
        sprite: `/sprites/characters/${ck}_a.png`,
        color: "var(--text-dim)",
        seat: "open",
        isHuman: true,
        userId: null,
        hp: 20,
        slot: i + 1,
      });
    }
  }
  return players;
}

function fillOpenSeatsWithAi(state: GameState) {
  const usedNames = state.players
    .filter((p) => isRealHuman(p) || isAiSeat(p))
    .map((p) => p.name);
  for (const p of state.players) {
    if (!isOpenSeat(p)) continue;
    let name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    while (usedNames.includes(name))
      name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    usedNames.push(name);
    p.seat = "ai";
    p.isHuman = false;
    p.name = name;
    p.sprite = `/sprites/characters/${p.classKey}_${"abcd"[Math.floor(Math.random() * 4)]}.png`;
    p.color = CLASS_META[p.classKey]?.color ?? "var(--rogue)";
  }
}

const hasOpenSeat = (state: GameState) => state.players.some(isOpenSeat);

async function beginAdventure(state: GameState) {
  if (state.roomPhase === "live") return;
  state.roomPhase = "live";
  state.endsAt = Date.now() + SESSION_MS;
  state.turnIndex = 0;
  state.phase = "dm";
  const first = state.players[0];
  const opener = OPENERS[state.scenario] ?? OPENERS["Cave Crypt"];
  await transcribe(state, [
    { kind: "dm", who: `AI DM: ${state.dmName}`, text: opener },
  ]);
  const { prompt, options } = await nextScene(
    state.gameId,
    state.dmName,
    state.scenario,
    opener,
    first.name,
    first.classKey,
  );
  state.options = options;
  await transcribe(state, [
    { kind: "dm", who: `AI DM: ${state.dmName}`, text: prompt },
  ]);
  state.phase = "player";
}

async function finalizeIfExpired(state: GameState): Promise<boolean> {
  if (state.roomPhase !== "live") return false;
  if (state.endsAt == null || Date.now() < state.endsAt) return false;
  state.roomPhase = "ended";
  state.phase = "dm";
  state.options = [];
  state.lastRoll = null;
  await transcribe(state, [
    {
      kind: "system",
      who: "System",
      color: "var(--gold-bright)",
      text: "⏳ Time’s up — the adventure has ended. The tale is complete.",
    },
  ]);
  const g = await games.get({ listKey: "all", gameId: state.gameId });
  if (g) await games.put({ ...g, status: "Finished" });
  return true;
}

async function syncLobbyStatus(state: GameState) {
  const g = await games.get({ listKey: "all", gameId: state.gameId });
  if (g)
    await games.put({
      ...g,
      status: hasOpenSeat(state) ? "Awaiting Players" : "In Session",
    });
}

async function loadState(gameId: string): Promise<GameState> {
  const state = await gameStates.get({ gameId });
  if (!state) throw new Error("Game not found");
  return state;
}

// Persist the new state (bumping version) and — in the real app — broadcast a
// state change so every client refetches. `publish()` is still a mock no-op;
// module 06 makes it a real Realtime push. Returns the SAVED object so callers
// can hand it back to the frontend.
async function saveAndBroadcast(state: GameState) {
  const next = { ...state, version: state.version + 1 };
  await gameStates.put(next);
  publish("state", next.gameId, { gameId: next.gameId, version: next.version });
  return next;
}

// Write events to BOTH the board log and the persistent chat transcript, and
// (in the real app) broadcast each to the chat channel.
async function transcribe(
  state: GameState,
  entries: Array<{
    kind: "dm" | "action" | "roll" | "say" | "system";
    who: string;
    color?: string;
    text: string;
  }>,
) {
  const withColor = entries.map((e) => ({ ...e, color: e.color ?? "var(--dm)" }));
  state.log = [
    ...state.log,
    ...withColor.map((e) => ({
      kind: (e.kind === "say" ? "dm" : e.kind) as
        | "dm"
        | "action"
        | "roll"
        | "system",
      who: e.who,
      color: e.color,
      text: e.text,
    })),
  ];
  const base = Date.now();
  for (let i = 0; i < withColor.length; i++) {
    const e = withColor[i];
    const msg: ChatMsg = {
      gameId: state.gameId,
      ts: base + i, // monotonic within the batch so ordering holds
      who: e.who,
      color: e.color,
      text: e.text,
      kind: e.kind,
    };
    await chatMessages.put(msg);
    publish("chat", state.gameId, msg);
  }
}

async function resolveAction(state: GameState, action: string) {
  const actor = state.players[state.turnIndex];
  const value = rollD20();
  const success = value >= state.dc;
  const text = await narrate(state.scenario, action, actor.name, value, state.dc);
  state.lastRoll = {
    value,
    sprite: spriteForRoll(value),
    color: diceColorFor(actor.classKey),
    dc: state.dc,
    success,
    actor: actor.name,
    action,
  };
  await transcribe(state, [
    {
      kind: "action",
      who: actor.name,
      color: actor.color,
      text: `${actor.name} chooses “${action}”.`,
    },
    {
      kind: "roll",
      who: actor.name,
      color: actor.color,
      text: `🎲 rolled ${value} vs DC ${state.dc} — ${success ? "SUCCESS" : "FAIL"}`,
    },
    { kind: "dm", who: `AI DM: ${state.dmName}`, text },
  ]);
}

function recentLog(state: GameState, n = 6): string {
  return state.log
    .slice(-n)
    .map((l) => l.text)
    .join("\n");
}

async function advanceTurn(state: GameState) {
  const next = state.turnIndex + 1;
  state.lastRoll = null;
  if (next >= state.players.length) {
    state.turnIndex = 0;
    state.round += 1;
    state.dc = 10 + Math.floor(Math.random() * 8);
  } else {
    state.turnIndex = next;
  }
  state.phase = "dm";
  const actor = state.players[state.turnIndex];
  const { prompt, options } = await nextScene(
    state.gameId,
    state.dmName,
    state.scenario,
    recentLog(state),
    actor.name,
    actor.classKey,
  );
  state.options = options;
  const roundTag = next >= state.players.length ? `Round ${state.round}. ` : "";
  await transcribe(state, [
    { kind: "dm", who: `AI DM: ${state.dmName}`, text: `${roundTag}${prompt}` },
  ]);
  state.phase = "player";
}

async function postBotChat(
  gameId: string,
  name: string,
  color: string,
  text: string,
) {
  const msg: ChatMsg = { gameId, ts: Date.now(), who: name, color, text, kind: "say" };
  await chatMessages.put(msg);
  publish("chat", gameId, msg);
}

function currentSituation(state: GameState): string {
  const lastDm = [...state.log].reverse().find((l) => l.kind === "dm");
  return lastDm?.text ?? state.scenario;
}

// Showcase public games seeded on first lobby load so the hall isn't empty.
const SEED_GAMES = [
  { name: "The Gloomspire Sanctum", theme: "Cave Crypt", dmType: "Grimjaw", dmLevel: "Intermediate", host: "paladin" },
  { name: "Rune-Carved Door Mystery", theme: "Magic Tower", dmType: "Grimjaw", dmLevel: "Intermediate", host: "rogue" },
  { name: "Frostbite Hollow", theme: "Frozen Keep", dmType: "Mistweaver", dmLevel: "Master", host: "ranger" },
];

async function seedIfEmpty() {
  // "Is the collection empty?" is itself a query over the constant-PK index.
  const existing = await Array.fromAsync(
    games.query({ index: "byCreated", where: { listKey: { equals: "all" } } }),
  );
  if (existing.length > 0) return;
  let i = 0;
  for (const g of SEED_GAMES) {
    const gameId = `seed-${i}`;
    await games.put({
      listKey: "all",
      gameId,
      name: g.name,
      theme: g.theme,
      note: `A ${g.theme} adventure`,
      dmType: g.dmType,
      dmLevel: g.dmLevel,
      maxParty: MAX_PARTY,
      status: "Awaiting Players",
      isPublic: true,
      accessCode: null,
      hostUserId: "system",
      createdAt: i,
    });
    const players: Player[] = CORE_CLASSES.map((ck, slot) => ({
      id: `seat${slot}`,
      name: "Open Seat",
      classKey: ck,
      sprite: `/sprites/characters/${ck}_a.png`,
      color: "var(--text-dim)",
      seat: "open" as const,
      isHuman: true,
      userId: null,
      hp: 20,
      slot,
    }));
    await gameStates.put({
      gameId,
      scenario: g.theme,
      dmName: g.dmType,
      players,
      roomPhase: "lobby",
      endsAt: null,
      turnIndex: 0,
      round: 1,
      phase: "player",
      dc: 12,
      lastRoll: null,
      log: [
        { kind: "dm", who: `AI DM: ${g.dmType}`, text: OPENERS[g.theme] ?? OPENERS["Cave Crypt"] },
        { kind: "dm", who: `AI DM: ${g.dmType}`, text: "Waiting for adventurers to take their seats…" },
      ],
      inventory: ["scroll", "potion", "key", "gem", "map"],
      options: [],
      version: 0,
    });
    i += 1;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// API  (Scope + ApiNamespace + AuthBasic)
// ═══════════════════════════════════════════════════════════════════════════════

// The auth namespace the frontend imports as `authApi`. `auth.createApi()` builds
// the real getAuthState/setAuthState state machine (sign in/up/out) AND wires the
// Lambda's DynamoDB IAM permissions for you — don't hand-roll an ApiNamespace here.
export const authApi = auth.createApi();

export const api = new ApiNamespace(scope, "api", (context) => ({
  // --- Reference data (no auth) ---
  async getConstants() {
    return { scenarios: SCENARIOS, dmTypes: DM_TYPES, classMeta: CLASS_META };
  },

  // --- Character ---
  async saveCharacter(input: {
    name: string;
    classKey: string;
    spriteId: string;
    sprite: string;
  }) {
    const user = await auth.requireAuth(context);
    const character: Character = { userId: user.username, ...input };
    await characters.put(character);
    return character;
  },

  async getCharacter() {
    const user = await auth.requireAuth(context);
    return (await characters.get({ userId: user.username })) ?? null;
  },

  // --- Lobby ---
  async listGames() {
    await seedIfEmpty();
    // Public listing via the constant-PK GSI (a targeted index read, not a full
    // scan). Query returns an async iterator sorted by createdAt ascending;
    // reverse for newest-first.
    const all = await Array.fromAsync(
      games.query({ index: "byCreated", where: { listKey: { equals: "all" } } }),
    );
    const publicGames = all.filter((g) => g.isPublic).reverse();
    const result = [];
    for (const g of publicGames) {
      const st = await gameStates.get({ gameId: g.gameId });
      const filled = st ? st.players.filter((p) => !isOpenSeat(p)).length : 0;
      const open = st ? hasOpenSeat(st) : false;
      const finished =
        !!st &&
        (st.roomPhase === "ended" ||
          (st.roomPhase === "live" && st.endsAt != null && Date.now() >= st.endsAt));
      result.push({
        id: g.gameId,
        name: g.name,
        theme: g.theme,
        note: g.note,
        maxParty: g.maxParty,
        dmLevel: g.dmLevel,
        dm: g.dmType,
        finished,
        full: finished || !open,
        status: finished ? "Finished" : open ? "Awaiting Players" : "In Session",
        party: filled,
        partyClasses: st ? st.players.map((p) => p.classKey) : [],
        members: st
          ? st.players.map((p) => ({ name: p.name, classKey: p.classKey, seat: p.seat }))
          : [],
      });
    }
    return result.sort((a, b) => Number(a.finished) - Number(b.finished));
  },

  async createGame(input: {
    scenario: string;
    dmType: string;
    isPublic: boolean;
    accessCode?: string;
    fillMode?: "ai" | "humans";
  }) {
    const user = await auth.requireAuth(context);
    const character = await characters.get({ userId: user.username });
    if (!character) throw new Error("Choose a character first");

    const gameId = uid();
    const scenario = (SCENARIOS as readonly string[]).includes(input.scenario)
      ? input.scenario
      : "Cave Crypt";
    const dmName = (DM_TYPES as readonly string[]).includes(input.dmType)
      ? input.dmType
      : "Grimjaw";
    const fillMode = input.fillMode === "humans" ? "humans" : "ai";
    const name = `${character.name}'s ${scenario} Run`;

    await games.put({
      listKey: "all",
      gameId,
      name,
      theme: scenario,
      note: `A ${scenario} adventure`,
      dmType: dmName,
      dmLevel: "Intermediate",
      maxParty: MAX_PARTY,
      status: fillMode === "ai" ? "In Session" : "Awaiting Players",
      isPublic: input.isPublic,
      accessCode: input.accessCode ?? null,
      hostUserId: user.username,
      createdAt: Date.now(),
    });

    const players = buildParty(
      { name: character.name, classKey: character.classKey, sprite: character.sprite, userId: user.username },
      fillMode,
    );
    const state: GameState = {
      gameId,
      scenario,
      dmName,
      players,
      roomPhase: "lobby",
      endsAt: null,
      turnIndex: 0,
      round: 1,
      phase: "player",
      dc: 12,
      lastRoll: null,
      log: [{ kind: "dm", who: `AI DM: ${dmName}`, text: "Waiting for adventurers to take their seats…" }],
      inventory: ["scroll", "potion", "key", "gem", "map"],
      options: [],
      version: 0,
    };
    if (fillMode === "ai") await beginAdventure(state);
    await gameStates.put(state);
    return { gameId };
  },

  async joinPrivate(accessCode: string) {
    await auth.requireAuth(context);
    const all = await Array.fromAsync(
      games.query({ index: "byCreated", where: { listKey: { equals: "all" } } }),
    );
    const game = all.find((g) => g.accessCode && g.accessCode === accessCode);
    if (!game) throw new Error("No game found for that access code");
    return { gameId: game.gameId };
  },

  async getState(gameId: string) {
    const user = await auth.requireAuth(context);
    const state = await loadState(gameId);
    if (await finalizeIfExpired(state)) await saveAndBroadcast(state);
    const mySeatId = state.players.find((p) => p.userId === user.username)?.id ?? null;
    return {
      ...state,
      viewer: { userId: user.username, mySeatId, spectator: mySeatId === null },
    };
  },

  async joinGame(gameId: string) {
    const user = await auth.requireAuth(context);
    const character = await characters.get({ userId: user.username });
    if (!character) throw new Error("Choose a character first");
    const state = await loadState(gameId);

    if (state.players.some((p) => p.userId === user.username)) {
      return { gameId, seated: true };
    }
    const openSeat = state.players.find(isOpenSeat);
    if (!openSeat) return { gameId, seated: false };
    openSeat.seat = "human";
    openSeat.isHuman = true;
    openSeat.userId = user.username;
    openSeat.name = character.name;
    openSeat.classKey = character.classKey;
    openSeat.sprite = character.sprite;
    openSeat.color = CLASS_META[character.classKey]?.color ?? openSeat.color;

    if (!hasOpenSeat(state)) await beginAdventure(state);
    await syncLobbyStatus(state);
    await saveAndBroadcast(state);
    return { gameId, seated: true };
  },

  async startWithAi(gameId: string) {
    const user = await auth.requireAuth(context);
    const state = await loadState(gameId);
    const host = state.players.find((p) => p.slot === 0);
    if (host?.userId !== user.username)
      throw new Error("Only the host can start the game");
    if (state.roomPhase === "live") return { gameId };
    fillOpenSeatsWithAi(state);
    await beginAdventure(state);
    await syncLobbyStatus(state);
    await saveAndBroadcast(state);
    return { gameId };
  },

  // --- Turn engine ---
  async takeAction(gameId: string, action: string) {
    const user = await auth.requireAuth(context);
    const state = await loadState(gameId);
    if (await finalizeIfExpired(state)) return await saveAndBroadcast(state);
    if (state.roomPhase !== "live") throw new Error("The game has not started yet");
    const actor = state.players[state.turnIndex];
    if (state.phase !== "player") throw new Error("Not ready for an action");
    if (actor.seat !== "human" || actor.userId !== user.username)
      throw new Error("Not your turn");

    await resolveAction(state, action);
    await advanceTurn(state);
    return await saveAndBroadcast(state);
  },

  async advanceBotTurn(gameId: string) {
    await auth.requireAuth(context);
    const state = await loadState(gameId);
    if (await finalizeIfExpired(state)) {
      const saved = await saveAndBroadcast(state);
      return { state: saved, botActed: false, botTurnPending: false };
    }
    const actor = state.players[state.turnIndex];
    if (state.roomPhase !== "live" || state.phase !== "player" || !isAiSeat(actor)) {
      return { state, botActed: false, botTurnPending: false };
    }
    const { action, line } = await companionDecide(
      state.gameId,
      actor.classKey,
      actor.name,
      actor.color,
      state.scenario,
      currentSituation(state),
      state.options,
    );
    if (line) await postBotChat(state.gameId, actor.name, actor.color, line);
    await resolveAction(state, action);
    await advanceTurn(state);
    const next = state.players[state.turnIndex];
    const botTurnPending = state.phase === "player" && isAiSeat(next);
    const saved = await saveAndBroadcast(state);
    return { state: saved, botActed: true, botTurnPending };
  },

  // --- Realtime channels (mock: never push; client falls back to polling) ---
  async getStateChannel(gameId: string) {
    await auth.requireAuth(context);
    return fakeChannel();
  },
  async getChatChannel(gameId: string) {
    await auth.requireAuth(context);
    return fakeChannel();
  },
  async getThinkingChannel(gameId: string) {
    await auth.requireAuth(context);
    return fakeChannel();
  },

  // --- Chat ---
  async getChatHistory(gameId: string) {
    await auth.requireAuth(context);
    // Query by the partition key → the game's whole transcript, sorted by ts.
    return await Array.fromAsync(
      chatMessages.query({ where: { gameId: { equals: gameId } } }),
    );
  },

  async sendChat(gameId: string, text: string) {
    const user = await auth.requireAuth(context);
    if (!text.trim()) return { ok: false };
    const character = await characters.get({ userId: user.username });
    const msg: ChatMsg = {
      gameId,
      ts: Date.now(),
      who: character?.name ?? user.username,
      color: character ? (CLASS_META[character.classKey]?.color ?? "var(--text)") : "var(--text)",
      text: text.trim(),
      kind: "say",
    };
    await chatMessages.put(msg);
    publish("chat", gameId, msg);
    return { ok: true };
  },
}));
