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

1. **Replace the companion mock** (`COMPANION_LINES` + the random `companionDecide`) with:
   - `COMPANION_PERSONAS` (one persona string per class),
   - the `companions` agent map built in a `for (const cls of CORE_CLASSES)` loop,
   - the real `companionDecide` that streams reasoning, parses JSON, validates the action
     against `options`, and falls back on error.

   Full implementation in [`index.ts`](index.ts).

2. **Nothing else changes.** `advanceBotTurn` already calls `companionDecide` and
   `postBotChat` — it doesn't care that the decision now comes from an LLM.

3. **Verify:**

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

   On Windows (cmd.exe), one line each with escaped quotes:

   ```cmd
   curl -s -c cookies.txt -X POST http://localhost:3001/aws-blocks/api -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"method\":\"authApi.setAuthState\",\"params\":[{\"action\":\"signIn\",\"username\":\"aldric\",\"password\":\"password123\"}],\"id\":1}"

   curl -s -b cookies.txt -X POST http://localhost:3001/aws-blocks/api -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"method\":\"api.getChatHistory\",\"params\":[\"REPLACE_WITH_GAME_ID\"],\"id\":1}"
   ```

   > Swap `REPLACE_WITH_GAME_ID` for a real `gameId` and use your own credentials. In
   > PowerShell use `curl.exe`.

**You've now rebuilt the entire backend.** Module 08's `index.ts` uses the same set of
Blocks and exports as the reference app in [`../../tabletop-app/`](../../tabletop-app/):
`AuthBasic`, four `DistributedTable`s, `Realtime`, a DM `Agent`, per-class companion
`Agent`s, and the `authApi` / `api` namespaces.

Catch up: `cp ../08-companions/solution/index.ts app/aws-blocks/index.ts`

---

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
