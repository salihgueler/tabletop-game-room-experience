# Module 08 — AI Companions (`companionDecide` → `Agent` × party)

**Goal:** give every AI party member its own persona-driven `Agent`, so companions reason,
choose contextual actions, and speak in character — a true multi-agent session.

**Block introduced:** `Agent` (one per class — multi-agent orchestration)

**You edit:** `app/backend/aws-blocks/index.ts`

**You'll know you're done when:** in an AI-filled game, each companion streams its own
reasoning and posts a distinct in-character chat line on its turn.

---

## Concept

Module 07 gave you one DM agent. Now each of the four classes gets its own agent, built in
a loop with a distinct persona system prompt. 

A live game therefore runs **one DM agent + up to three companion agents**, each stateless
(`inferenceOnly`) and isolated per game — so many games run concurrently without crosstalk.
Companions use a **faster model** (`BedrockModels.FAST`) than the DM: they make quick
tactical picks, not rich prose.

### Structured output + validation

Each companion must pick a _real_ option, so the prompt demands strict JSON
(`{reasoning, action, line}`), and `companionDecide` **validates** the chosen action
against the server-provided `options` (fuzzy-matched) before accepting it. Anything
malformed → fall back to a random valid action with an empty line. That guard is why an AI
turn can never stall the game, even when a small local model returns junk.

### Streaming reasoning to the Flutter game view model

Each companion streams `text-delta` chunks to the `thinking` Realtime channel (keyed by
the companion's name/color), so players watch each party member think in turn. The Flutter
game view model subscribes to this channel and renders it in the thinking bar — the same
mechanism as the DM's reasoning from module 07, just per-companion.


### Host-only `advanceBotTurn`

Only the host client may call `advanceBotTurn`. Why? Without this guard, every connected
client races to advance bot turns when the turn order reaches an AI seat — resulting in
duplicate calls to `companionDecide` and double-posted actions.

The guard exists in **two places, and only one of them counts**:

```ts
const host = state.players.find((p) => p.slot === 0);
if (host?.userId !== user.username)
  throw new Error("Only the host can advance a companion turn");
```

That server check is what makes it correct — it's the same shape as the one already on
`startWithAi`. The Flutter side also hides the button for non-hosts
(`GameViewModel._driveBotIfNeeded` returns early when `!value.isHost`), but that is a UX
courtesy, not a control: anyone can call the RPC directly. This is worth internalising as a
general rule — a client-side guard shapes the interface, a server-side guard enforces the
invariant, and you usually want both for different reasons.

## Steps

> **Working directory:** every fence in this module starts from `workshop-flutter/app/`.
> Each one is written from that directory independently, so return to `app/` between
> fences — several of them begin with `cd backend`, and running two of those in a row
> without going back up looks for a `backend/backend/`.

### 1. Update the `companionDecide` function

The mock `COMPANION_LINES` map and the random
`companionDecide` are replaced entirely:

```ts
const COMPANION_PERSONAS: Record<string, string> = {
  paladin:
    "a stalwart, honorable Paladin who shields allies and speaks with steady resolve",
  sorcerer: "a brash, curious Sorcerer who loves flashy magic and dry wit",
  rogue:
    "a sly, cautious Rogue who trusts shadows and sarcasm over brute force",
  ranger: "a calm, watchful Ranger attuned to danger, terse and practical",
};

const companions: Record<string, Agent> = {};
for (const cls of CORE_CLASSES) {
  companions[cls] = new Agent(scope, `c-${cls}`, {
    inferenceOnly: true,
    model: {
      deployed: BedrockModels.FAST, // companions use a faster/cheaper model
      local: OllamaModels.SMALL,
    },
    systemPrompt: [
      `You role-play ${COMPANION_PERSONAS[cls]} in a 16-bit fantasy tabletop game.`,
      "On your turn you MUST choose exactly one action from the list you are given.",
      "First think out loud in one short sentence (your in-character reasoning),",
      "then give a short spoken line (max 15 words).",
      "Respond with ONLY compact JSON, no prose, no code fences:",
      '{"reasoning":"<one sentence of why>","action":"<one exact action from the list>","line":"<your spoken line>"}',
    ].join(" "),
  });
}
```

### 2. Rewrite `companionDecide` function

The previous module's `companionDecide` picked a random action from `COMPANION_LINES`.
Now it streams the agent's reasoning tokens to the `thinking` channel, parses JSON,
validates the action against `options` (fuzzy-matched), and falls back to a random
valid action if the model errors or returns junk:

**Read this as a diff from module 07, not as new code.** The streaming / parse / fallback
skeleton below is *identical* to `nextScene`: emit "start", stream the model, forward each
`text-delta` chunk to the `thinking` channel, `complete()`, pull the `{...}` JSON out with
the same regex, and fall back on any error. You've already read all of that — skim it.

Only two ideas here are genuinely new, so spend your attention on them:

- **One `Agent` per class, each with its own persona prompt** (built in the loop in step 1).
  The `const agent = companions[classKey]` line picks the right persona-driven agent for
  the companion whose turn it is.
- **Fuzzy action-validation.** The `options.find((o) => ...)` block forces the model's
  chosen `action` onto a *real* option from the server's `options` list — exact match, or
  either string containing the other. If nothing matches, it falls back to a random valid
  option. This is what guarantees a companion can never pick an action that doesn't exist
  and stall the turn.

```ts
async function companionDecide(
  gameId: string,
  classKey: string,
  name: string,
  color: string,
  scenario: string,
  situation: string,
  options: string[],
): Promise<{ action: string; line: string; reasoning: string }> {
  if (!options || options.length === 0)
    options = CLASS_META[classKey]?.actions ?? ["Investigate"];
  const fallback = {
    action: options[Math.floor(Math.random() * options.length)],
    line: "",
    reasoning: "",
  };
  const agent = companions[classKey];
  const emit = (phase: "start" | "delta" | "end", text: string) =>
    rt.publish("thinking", gameId, { gameId, who: name, color, phase, text });

  if (!agent) {
    await emit("start", "");
    await emit("end", "");
    return fallback;
  }

  const message = [
    `Scenario: ${scenario}.`,
    `Situation: ${situation}`,
    `You are ${name}. Choose ONE action from: ${options.join(", ")}.`,
    "Reply with JSON only.",
  ].join(" ");

  await emit("start", "");
  let raw = "";
  try {
    const result = await agent.stream(message);
    try {
      const channel = await result.channel;
      const sub = channel.subscribe((chunk: any) => {
        if (chunk.type === "text-delta" && chunk.text) {
          raw += chunk.text;
          void emit("delta", chunk.text);
        }
      });
      await sub.established;
    } catch {
      // channel not available (some local mocks) — complete() still works
    }
    const done = await result.complete();
    if (!raw) raw = done.text || "";
    raw = raw.trim();

    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as {
        action?: string;
        line?: string;
        reasoning?: string;
      };
      const picked = options.find(
        (o) =>
          o.toLowerCase() === (parsed.action || "").toLowerCase() ||
          (parsed.action || "").toLowerCase().includes(o.toLowerCase()) ||
          o.toLowerCase().includes((parsed.action || "").toLowerCase()),
      );
      if (picked) {
        await emit("end", (parsed.reasoning || "").toString().slice(0, 200));
        return {
          action: picked,
          line: (parsed.line || "").toString().slice(0, 120),
          reasoning: (parsed.reasoning || "").toString().slice(0, 200),
        };
      }
    }
  } catch {
    // model unavailable / bad output — fall through
  }
  await emit("end", "");
  return fallback;
}
```

#### If something is not working make sure you copy the solution

   ```bash
   cd backend
   cp ../../08-companions/solution/index.ts aws-blocks/index.ts
   npm run typecheck
   ```

### 3. Add the host guard to `advanceBotTurn`

This is the change the Concept section above argues for, and it is the one thing in this
module that no local check can catch: `flutter test` drives a single client, so duplicate
companion turns only show up with two people in the same game.

In `advanceBotTurn`, capture the authenticated user and reject anyone who is not the host —
the same shape `startWithAi` already uses:

```ts
async advanceBotTurn(gameId: string) {
  const user = await auth.requireAuth(context);   // was: await auth.requireAuth(context);
  const state = await loadState(gameId);
  const host = state.players.find((p) => p.slot === 0);
  if (host?.userId !== user.username)
    throw new Error("Only the host can advance a companion turn");
  // ... rest of the method unchanged
```

Two details worth noticing: you have to *bind* the result of `requireAuth` (the mock line
threw it away), and the guard goes before any state mutation so a rejected call changes
nothing.

### 4. **Regenerate the Dart client and rebuild:**

   ```bash
   cd backend   # the blocks-generate-spec binary lives here
   npx blocks-generate-spec aws-blocks/index.ts ../lib/blocks.spec.json
   cd ..
   dart run build_runner build --delete-conflicting-outputs
   flutter analyze
   flutter test
   ```

### 5. **Launch and verify:**

   ```bash
   flutter run -d chrome
   ```

   Create an AI-filled game (fill all seats with AI companions) and watch a full round.
   Each companion's turn shows its own "🤔 thinking" stream in the thinking bar, then a
   distinct spoken line in chat (e.g. the Rogue is sly, the Paladin steadfast).

   Without Ollama, companions still act via the random fallback — the game stays playable.
   With Ollama running, each companion reasons in-character and picks contextual actions.

**You've now rebuilt the entire backend.** Module 08's `index.ts` uses the same set of
Blocks and exports as the reference app in
[`../../tabletop-flutter/`](../../tabletop-flutter/): `AuthBasic`, four
`DistributedTable`s, `Realtime`, a DM `Agent`, per-class companion `Agent`s, and the
`authApi` / `api` namespaces.

---

## Verify

- Each AI companion streams reasoning tokens to the thinking bar (one at a time, in turn
  order).
- Each companion posts a distinct in-character line to chat after acting.
- Companions always pick a valid action from the server-provided options — never stall.
- Without Ollama: companions act randomly (valid action, no spoken line) — game still
  playable.
- With Ollama: companions reason and speak in character per their persona.

## Checklist

- [ ] `npm run typecheck` passes.
- [ ] `flutter analyze` reports no issues.
- [ ] Each AI companion streams reasoning and posts a distinct in-character line.
- [ ] Companions always pick a valid action (never stall), even on bad model output.

## What you learned

- **Multi-agent orchestration** is just multiple `Agent` instances with different system
  prompts — no special framework.
- Constrain LLM output to **strict JSON and validate it** server-side; treat the model as
  untrusted and always have a deterministic fallback.
- Distinct personas + per-agent `thinking` streams turn "NPCs" into characters the player
  can watch reason.
- Gate side-effect calls (`advanceBotTurn`) to **host-only** to prevent duplicate actions
  in multiplayer rooms.

## Troubleshooting

- **Companions all sound the same / generic** — the model isn't running (random fallback)
  or is ignoring the persona; confirm Ollama is up, or accept canned behavior.
- **A companion "skips" its line** — it returned valid JSON with an empty `line`, or fell
  back on malformed output. That's expected occasionally with small models; the action
  still resolves.
- **Duplicate bot actions** — more than one client is calling `advanceBotTurn`. Confirm
  the Flutter UI gates the button to the host only, and the backend rejects non-host calls.

---

**Next:** [Module 09 — Deploy](../09-deploy/README.md) — ship the whole thing to AWS with
CDK `Hosting` (CloudFront + S3 + Lambda), and turn the local mocks' real counterparts on
for the first time.
