# Module 07 — AI Dungeon Master (`cannedNarration` → `Agent`)

**Goal:** turn the deterministic canned narrator into a real streaming LLM `Agent` that
narrates outcomes and generates contextual, scene-specific action choices — while keeping
the canned logic as an offline fallback.

**Block introduced:** `Agent`
**You edit:** `app/aws-blocks/index.ts`
**You'll know you're done when:** action choices reflect the _current scene_ (e.g. "Examine
the runes", "Push the door open") instead of the fixed class menu, and the DM's reasoning
streams into the "thinking" bar as it sets the scene.

---

## Concept

`Agent` is an LLM block with streaming and model fallback built in. This DM is
**`inferenceOnly`** — no conversation persistence, just stateless one-shot calls — so many
games can run it concurrently and isolated.

```ts
const dm = new Agent(scope, "dm", {
  inferenceOnly: true,
  model: {
    deployed: BedrockModels.BALANCED, // Bedrock when deployed
    local: OllamaModels.SMALL, // Ollama locally if running
    // canned provider is appended implicitly as the final fallback
  },
  systemPrompt: "You are a witty, atmospheric Dungeon Master ...",
});
```

Two call shapes you'll use:

- **Simple completion** (`narrate`): `await dm.stream(msg)` → `await result.complete()` →
  `done.text`.
- **Streamed reasoning** (`nextScene`): subscribe to `result.channel` for `text-delta`
  chunks and re-publish them to the `thinking` Realtime namespace, so players watch the DM
  think before their options unlock.

### The fallback chain is the whole design

`narrate` and `nextScene` **try the agent, then fall back to canned** on any error or
malformed output. That's why the game never breaks: no Ollama, no Bedrock, bad JSON — it
degrades to deterministic text instead of failing. The tell that inference is _working_ is
that options become scene-specific; the tell that it's _failing_ is options reverting to
the fixed class list.

## No Ollama? No problem — the canned provider

You do **not** need Ollama (or any AWS/Bedrock access) to complete this module. If no local
model is running, the `Agent`'s model list falls through to the **canned provider**, which
is appended implicitly as the final fallback. On top of that, `narrate` and `nextScene`
each wrap the agent call in `try/catch` and drop to the deterministic helpers you kept in
step 2. So with zero AI setup:

- **Narration** comes from `cannedNarration` — themed, roll-aware outcome text (attacks,
  spells, skills, crits/fumbles) that reads like a DM, just not improvised.
- **Action choices** come from the fixed per-class menu (`CLASS_META[class].actions`)
  instead of scene-specific options.
- **Everything else is identical** — the d20 roll, DC check, turn order, chat, and the
  `thinking` bar (it just shows the fallback prompt rather than streamed tokens).

This is the same fallback the shipped app relies on, so the game stays **fully playable
offline** — you can finish the whole workshop, including deploy, without ever installing a
model. Ollama (below) is a _nice-to-have_ that upgrades the narration from "canned but
solid" to "improvised and scene-aware"; it changes the experience, not whether things work.

**How to tell which one you're on:** scene-specific options ("Pry open the rune door") =
a real model is answering; the fixed class menu ("Attack / Defend Ally / Cast Bless /
Investigate") = the canned fallback. Both are correct.

### ⚠️ Model pinning gotcha (bit the real app in production)

`BedrockModels.BALANCED` is the documented default, but Bedrock periodically retires the
underlying model id. A retired id fails the agent's health check and **silently falls back
to canned** — so deployed narration goes generic while local (Ollama) looks fine. If that
happens, check the deployed Lambda logs for agent errors and pin an explicit, current
inference-profile id instead of the preset.

## Steps

1. **Import** `Agent`, `BedrockModels`, `OllamaModels` and construct the `dm` agent
   (inference-only, with the system prompt) at the top of the AI section.

2. **Keep the canned helpers** (`categorize`, `RESULTS`, `cannedNarration`, `PROMPTS`,
   `promptFor`) — they're now the _fallback_, not the primary path.

3. **Rewrite `narrate`** to build a prompt from the action + roll outcome, call
   `dm.stream(...).complete()`, return the text, and fall back to `cannedNarration` in a
   `catch`.

4. **Rewrite `nextScene`** to prompt for a one-line scene + a JSON array of 3–4 options,
   stream `text-delta` chunks to the `thinking` channel via `rt.publish("thinking", ...)`,
   parse the JSON (with a coercion helper + one retry), and fall back to the generic
   prompt + class actions if parsing fails.

   > `companionDecide` stays canned for now — that's module 08.

   The complete implementations are in [`index.ts`](index.ts).

5. **Verify (canned — no setup):**

   ```bash
   npm run typecheck
   npm run dev
   ```

   Play a turn. Even without a model, the fallback keeps it playable.

6. **Verify (real AI — fully optional):** only if you _want_ live, improvised narration
   (see "No Ollama? No problem" above — the module is complete without this). Install and
   run [Ollama](https://ollama.com), then:

   ```bash
   ollama serve
   ollama pull llama3.1:8b
   ```

   Restart `npm run dev` and play a turn. Now the DM narrates in-character, the action
   choices fit the moment, and the "🤔 thinking" bar streams the DM's reasoning live.

   You can see the DM's contextual options in the raw state too. Sign in (saving the
   cookie), then fetch a game's state — the `options` reflect the current scene when a model
   is answering, or the fixed class menu on the canned fallback:

   ```bash
   # 1) sign in, saving the session cookie
   curl -s -c cookies.txt -X POST http://localhost:3001/aws-blocks/api \
     -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","method":"authApi.setAuthState","params":[{"action":"signIn","username":"aldric","password":"password123"}],"id":1}'

   # 2) fetch a game's state (gameId from api.listGames) and inspect its options
   curl -s -b cookies.txt -X POST http://localhost:3001/aws-blocks/api \
     -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","method":"api.getState","params":["REPLACE_WITH_GAME_ID"],"id":1}'
   ```

   On Windows (cmd.exe), one line each with escaped quotes:

   ```cmd
   curl -s -c cookies.txt -X POST http://localhost:3001/aws-blocks/api -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"method\":\"authApi.setAuthState\",\"params\":[{\"action\":\"signIn\",\"username\":\"aldric\",\"password\":\"password123\"}],\"id\":1}"

   curl -s -b cookies.txt -X POST http://localhost:3001/aws-blocks/api -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"method\":\"api.getState\",\"params\":[\"REPLACE_WITH_GAME_ID\"],\"id\":1}"
   ```

   > Swap `REPLACE_WITH_GAME_ID` for a real `gameId` and use your own credentials. In
   > PowerShell use `curl.exe`.

Catch up: `cp ../07-ai-dm/solution/index.ts app/aws-blocks/index.ts`

---

## Checklist

- [ ] `npm run typecheck` passes.
- [ ] With no model, the game still runs (canned fallback).
- [ ] With Ollama running, action options are scene-specific and DM reasoning streams to
      the thinking bar.

## What you learned

- `Agent` gives you streaming LLM calls with a **built-in model fallback chain**
  (Bedrock → Ollama → canned) and no infra to manage.
- `inferenceOnly` agents are stateless one-shots — ideal for per-turn narration at scale.
- Streaming `text-delta` chunks to a Realtime namespace is how you show an AI "thinking"
  live.
- Always design an LLM feature to **degrade, not fail** — and know that silent fallback
  can mask a deployed model problem (the pinning gotcha).

## Troubleshooting

- **Options stay generic even with Ollama running** — the model returned unparseable JSON
  (small models do this occasionally) or Ollama isn't reachable at `localhost:11434`.
  Confirm `ollama list` shows `llama3.1:8b`.
- **`AgentErrors.ModelUnavailable`** — no provider passed a health check; ensure Ollama is
  serving, or accept the canned fallback.
- **Deployed narration generic but local fine** — the pinning gotcha above. Check Lambda
  logs; pin a current model id.

---

**Next:** Module 08 — AI companions — give each AI seat its own `Agent` persona so the
party members reason and speak in character: true multi-agent play.
