# Module 08 — AI companions (`companionDecide` → `Agent` × party)

**Goal:** give every AI party member its own persona-driven `Agent`, so companions reason,
choose contextual actions, and speak in character — a true multi-agent session.

**Block introduced:** `Agent` (one per class — multi-agent orchestration)
**You edit:** `app/aws-blocks/index.ts`
**You'll know you're done when:** in an AI-filled game, each companion streams its own
reasoning and posts a distinct in-character chat line on its turn.

---

## Concept

Module 07 gave you one DM agent. Now each of the four classes gets its own agent, built in
a loop with a distinct persona system prompt:

```ts
const companions: Record<string, Agent> = {};
for (const cls of CORE_CLASSES) {
  companions[cls] = new Agent(scope, `c-${cls}`, {
    inferenceOnly: true,
    model: { deployed: BedrockModels.FAST, local: OllamaModels.SMALL },
    systemPrompt: `You role-play ${COMPANION_PERSONAS[cls]} ... respond with ONLY JSON {reasoning, action, line}`,
  });
}
```

A live game therefore runs **one DM agent + up to three companion agents**, each stateless
(`inferenceOnly`) and isolated per game — so many games run concurrently without crosstalk.
Companions use a **faster model** (`BedrockModels.FAST`) than the DM: they make quick
tactical picks, not rich prose.

### Structured output + validation

The companion must pick a _real_ option, so the prompt demands strict JSON
(`{reasoning, action, line}`), and `companionDecide` **validates** the chosen action
against the offered `options` (fuzzy-matched) before accepting it. Anything malformed →
fall back to a random valid action with an empty line. That guard is why an AI turn can
never stall the game, even when a small local model returns junk.

### It's the same streaming pattern as the DM

Each companion streams `text-delta` chunks to the `thinking` channel (keyed by the
companion's name/color), so players watch each party member think in turn — then its
spoken line is posted to chat via `postBotChat`.

## Steps

**Read this as a diff from module 07.** Most of what follows is not new. The `Agent`
construction and the entire streaming-parse-fallback skeleton inside `companionDecide` are
duplicated from module 07's `nextScene` almost verbatim — same `emit` helper, same
`text-delta` subscription (each streamed fragment of the model's reply; token streaming),
same `raw.match(/\{[\s\S]*\}/)` JSON extraction, same "on error, fall back" structure. The
README even says "Nothing else changes" below, and means it. So skim that skeleton — you've
read it once already.

Only **two ideas** are genuinely new in this module:

- **(a) One agent per class, each with its own persona `systemPrompt`** — built in the
  `for (const cls of CORE_CLASSES)` loop, so the four companions reason and speak in
  distinct voices. (`systemPrompt` is the standing per-agent instruction, set once at
  construction; the per-call `message` still carries the turn's specifics.)
- **(b) Fuzzy action-validation** — `companionDecide` forces the model's chosen `action`
  onto a real entry from the server's `options` list before accepting it. That's the block
  around L597–603 of `solution/index.ts`: exact case-insensitive match, or either string
  containing the other, else the random valid fallback. Read those two things closely; skim
  the rest.

### 1. Replace the mock COMPANION_LINES

Delete the `COMPANION_LINES` const — the canned bank of per-class quips the mock picked from
at random. Nothing replaces it one-for-one: the companions now speak because a model writes
their line, so the persona strings you add in step 2 take over the job of *sounding* like a
paladin, and the `line` field returned by the rewritten `companionDecide` in step 3 supplies
the words. Delete the mock `companionDecide` alongside it; steps 2 and 3 drop their
replacements into the same place.

### 2. Add the personas and the companions agent map

Add`COMPANION_PERSONAS` (one persona string per class), and the `companions` agent map built in a `for (const cls of CORE_CLASSES)` loop.

   This step drops in two things: the `COMPANION_PERSONAS` map (a one-line personality
   string per class) and the `companions` object — one `Agent` per class, each stamped with
   that class's persona in its `systemPrompt`. The loop over `CORE_CLASSES` is why a game can
   spin up several personas from one block of code; the agent construction itself is the same
   `Agent` you built for the DM in module 07, just repeated per class with a faster model.

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
      deployed: BedrockModels.FAST, // companions can use a faster/cheaper model
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

### 3. Rewrite companionDecide

Update the `companionDecide` function

   The streaming/parse/fallback body of this function is the same skeleton as module 07's
   `nextScene` — the `emit` helper, the `text-delta` subscription, the `raw.match(/\{[\s\S]*\}/)`
   JSON pull, and the try/catch-to-fallback shape are all carried over, so you can read them
   fast. The one part to slow down on is the **fuzzy action-validation** in the middle:
   `options.find(...)` accepts the model's `action` only if it exactly matches (case-
   insensitive) an offered option, or one string contains the other; anything else falls
   through to a random valid action. That guard is what makes an AI turn incapable of
   stalling the game.

```ts
// Ask a companion agent to decide its move. Streams the agent's reasoning tokens
// to the `thinking` channel as they arrive, then returns the validated action +
// spoken line. Falls back to a random valid action if the model errors or returns
// junk — so an AI turn never stalls the game.
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

Full implementation in [`solution/index.ts`](solution/index.ts).

### 4. Nothing else changes

**Nothing else changes.** `advanceBotTurn` already calls `companionDecide` and `postBotChat` — it doesn't care that the decision now comes from an LLM.

### 5. Verify

**Verify:** Typecheck proves the four agents compile. Whether a real model is answering is a separate question, and the Verify section below is where you settle it.

   ```bash
   npm run typecheck
   npm run dev        # with Ollama running for real reasoning (see module 07)
   ```

   Create an AI-filled game and watch a full round. Each companion's turn shows its own
   "🤔 thinking" stream, then a distinct spoken line in chat (e.g. the Rogue is sly, the
   Paladin steadfast). Without Ollama, companions still act via the random fallback — the
   game stays playable.

   You can read those in-character companion lines straight from the chat transcript. Sign
   in (saving the cookie), then call `getChatHistory` for the game:

   ```bash
   # 1) sign in, saving the session cookie
   curl -s -c cookies.txt -X POST http://localhost:3001/aws-blocks/api \
     -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","method":"authApi.setAuthState","params":[{"action":"signIn","username":"aldric","password":"password123"}],"id":1}'

   # 2) read the chat transcript for a gameId (from api.listGames)
   curl -s -b cookies.txt -X POST http://localhost:3001/aws-blocks/api \
     -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","method":"api.getChatHistory","params":["REPLACE_WITH_GAME_ID"],"id":1}'
   ```

   On Windows / PowerShell, translate the quoting as shown in
   [the curl reference](../README.md#reference-curl-windows-quoting-and-resetting-state)
   — the JSON body is identical. Swap `REPLACE_WITH_GAME_ID` for a real `gameId` and use
   your own credentials.

**You've now rebuilt the entire backend.** Module 08's `index.ts` uses the same set of
Blocks and exports as the reference app in [`../../tabletop-app/`](../../tabletop-app/):
`AuthBasic`, four `DistributedTable`s, `Realtime`, a DM `Agent`, per-class companion
`Agent`s, and the `authApi` / `api` namespaces.

Catch up from `workshop/app/`: `cp ../08-companions/solution/index.ts aws-blocks/index.ts`

---

## Verify

Start an AI-filled game and take a turn, then let the companions act. Each should stream its
own reasoning into the thinking bar and post a short line in chat.

**How to tell a real model from the canned fallback.** This matters more here than anywhere
else in the workshop, because the fallback is designed to be invisible: if the model is
unreachable, the `Agent` block quietly answers from the canned provider and **nothing
throws**. There is no error in your terminal, no failed request, no clue in the response.

The reliable tell is the same one module 07 gave you — **look at the action options**, not at
the chat:

- **Scene-specific options** ("Pry open the rune door") mean a model answered.
- **Options that exactly match the acting character's class menu** — the `actions` array in
  `getConstants().classMeta[classKey]` — mean you are on canned output.

```bash
# whose turn is it, and what are their options?
curl -s -b cookies.txt -X POST http://localhost:3001/aws-blocks/api \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"api.getState","params":["GAME_ID"],"id":1}'
```

**Do not use the companion's chat line as your test.** On fallback `companionDecide` returns
`line: ""`, so no line is posted — but a working model is also allowed to return an empty
line, and the Troubleshooting section below covers exactly that case. Absence proves nothing
in either direction.

## Checklist

- [ ] `npm run typecheck` passes.
- [ ] Each AI companion streams reasoning and posts a distinct in-character line.
- [ ] Companions always pick a valid action (never stall), even on bad model output.

## What you learned

- **Multi-agent orchestration** is just multiple `Agent` instances with different system
  prompts — no special framework.
- Constrain LLM output to **strict JSON and validate it** server-side; treat the model as
  untrusted and always have a deterministic fallback.
- Distinct personas + per-agent `thinking` streams turn "NPCs" into characters the player
  can watch reason.

## Troubleshooting

- **Companions all sound the same / generic** — the model isn't running (random fallback)
  or is ignoring the persona; confirm Ollama is up, or accept canned behavior.
- **A companion "skips" its line** — it returned valid JSON with an empty `line`, or fell
  back on malformed output. That's expected occasionally with small models; the action
  still resolves.

---

**Next:** Module 09 — Deploy — ship the whole thing to AWS with CDK `Hosting` (CloudFront +
S3 + Lambda), and turn the local mocks' real counterparts on for the first time.
