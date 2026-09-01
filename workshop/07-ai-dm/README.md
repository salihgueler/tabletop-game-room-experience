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

The `systemPrompt` is the agent's standing instruction — set once at construction and
applied to every call — as opposed to the per-call `message` you pass to `dm.stream(...)`,
which carries the specifics of this one turn (the action, the roll, the scene).

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
inference-profile id instead of the preset. (An inference profile is Bedrock's stable,
region-aware handle for a specific model version; pinning its id means you name the exact
model rather than a preset alias that Bedrock can silently re-point.)

## Steps

### 1. Import Agent and the model presets

**Import** `Agent`, `BedrockModels`, `OllamaModels` and

   These three names are all you add to the existing import. `Agent` is the LLM
   block itself; `BedrockModels` and `OllamaModels` are enums of ready-made model
   presets you'll hand to the agent's `model` field in step 2 — `BALANCED` for the
   deployed Bedrock path, `SMALL` for the local Ollama path. Everything else in the
   list is already there from earlier modules; just append these to the block.

```ts
import {
  ApiNamespace,
  Scope,
  AuthBasic,
  DistributedTable,
  Realtime,
  Agent,
  BedrockModels,
  OllamaModels,
} from "@aws-blocks/blocks";
```

### 2. Construct the dm agent

construct the `dm` agent (inference-only, with the system prompt) at the top of the AI section.

```ts
const dm = new Agent(scope, "dm", {
  inferenceOnly: true,
  model: {
    deployed: BedrockModels.BALANCED,
    local: OllamaModels.SMALL,
  },
  systemPrompt: [
    "You are a witty, atmospheric Dungeon Master for a 16-bit fantasy tabletop game.",
    "Given a player action, their d20 roll, and whether it beat the difficulty class,",
    "narrate the outcome in 1-2 vivid sentences. On a natural 20 add a triumphant flourish;",
    "on a natural 1 add a comedic or costly fumble. Never break character, never mention",
    "dice mechanics or numbers directly, and keep it under 45 words.",
  ].join(" "),
});
```

### 3. Keep the canned helper functions

**Keep the canned helper functions** (`categorize`, `RESULTS`, `cannedNarration`, `PROMPTS`, `promptFor`) — they're now the _fallback_, not the primary path.

### 4. Rewrite narrate to call the agent

**Rewrite `narrate`** to build a prompt from the action + roll outcome, call `dm.stream(...).complete()`, return the text, and fall back to `cannedNarration` in a `catch`.

   ```ts
   async function narrate(
     scenario: string,
     action: string,
     actor: string,
     roll: number,
     dc: number,
   ): Promise<string> {
     const outcome = roll >= dc ? "succeeds" : "fails";
     const crit =
       roll === 20 ? " (a natural 20!)" : roll === 1 ? " (a natural 1!)" : "";
     const message = `Scenario: ${scenario}. ${actor} attempts "${action}" and ${outcome}${crit}. Narrate the outcome.`;
     try {
       const result = await dm.stream(message);
       const done = await result.complete();
       const text = (done.text || "").trim();
       if (text) return text;
     } catch {
       // model unavailable — fall through to canned
     }
     return cannedNarration(action, actor, roll, dc);
   }
   ```

### 5. Rewrite nextScene to stream and parse JSON

**Rewrite `nextScene`** to prompt for a one-line scene + a JSON array of 3–4 options, stream `text-delta` chunks to the `thinking` channel via `rt.publish("thinking", ...)`, parse the JSON (with a coercion helper + one retry), and fall back to the generic prompt + class actions if parsing fails.

   **The shape, before the code.** The block below is long, but the flow is small.
   In pseudocode:

   ```text
   emit "start" to the thinking channel
   for up to two attempts:
     stream the model
     forward each text-delta chunk to the thinking channel   ← moves the bar
     complete the call
     pull the first {...} JSON object out of the reply text
     if it parses and has >= 2 options: emit "end", return { prompt, options }
   otherwise: emit "end", fall back to the fixed class menu
   ```

   The real block below is the hardened version of exactly that — the extra lines
   are guards against the messy JSON small local models emit. A `text-delta` is one
   streamed fragment of the model's reply (token streaming: the model sends its
   answer in pieces as it generates, rather than all at once).

   A couple of reading hints:

   - `coerceOptions` is **defensive-only** — it normalizes the ways a small model
     mangles the `options` field (a comma-separated string, objects wrapped as
     `{action}`/`{label}`, bullet/quote prefixes). Safe to skip on a first read;
     it never runs its interesting branches when the model behaves.
   - Two lines are load-bearing. The `void emit("delta", chunk.text)` is what makes
     the "thinking" bar visibly move — drop it and inference still works but the bar
     stays empty. And `raw.trim().match(/\{[\s\S]*\}/)` is the regex that extracts
     the JSON object out of any surrounding prose, so a model that says "Sure! {...}"
     still parses.

   ```ts
   // Ask the DM to set the scene for the NEXT actor and emit 3–4 concrete, situation-
   // specific choices (not a fixed class menu). Streams the DM's reasoning to the
   // `thinking` channel so players watch the scene being set before options unlock.
   // Falls back to a generic prompt + fixed class actions on error / bad output.
   async function nextScene(
     gameId: string,
     dmName: string,
     scenario: string,
     recent: string,
     actorName: string,
     actorClass: string,
   ): Promise<{ prompt: string; options: string[] }> {
     const className = CLASS_META[actorClass]?.name ?? "Adventurer";
     const fallback = {
       prompt: promptFor(actorName),
       options: CLASS_META[actorClass]?.actions ?? ["Investigate"],
     };
     const emit = (phase: "start" | "delta" | "end", text: string) =>
       rt.publish("thinking", gameId, {
         gameId,
         who: `DM ${dmName}`,
         color: "var(--dm)",
         phase,
         text,
       });
     const message = [
       `Scenario: ${scenario}.`,
       `Recent events:\n${recent}`,
       `It is now ${actorName} the ${className}'s turn.`,
       `Address ${actorName} directly with a one-sentence prompt describing the immediate situation,`,
       `then offer 3 to 4 SHORT, concrete action choices that fit THIS moment and a ${className}'s abilities`,
       `(2-4 words each). Vary them by scene.`,
       "Respond with ONLY compact JSON, no prose, no code fences:",
       '{"prompt":"<one sentence to the player>","options":["...","...","..."]}',
     ].join(" ");
     const coerceOptions = (v: unknown): string[] => {
       let arr: unknown[] = [];
       if (Array.isArray(v)) arr = v;
       else if (typeof v === "string") arr = v.split(/[\n,]/);
       return arr
         .map((o) =>
           typeof o === "string"
             ? o
             : ((o as any)?.action ?? (o as any)?.label ?? ""),
         )
         .map((s) =>
           String(s)
             .replace(/^[\s"'\-*\d.)]+/, "")
             .trim(),
         )
         .filter(Boolean)
         .slice(0, 4);
     };
     await emit("start", "");
     // Up to two attempts — small local models occasionally emit malformed JSON.
     for (let attempt = 0; attempt < 2; attempt++) {
       try {
         const result = await dm.stream(message);
         let raw = "";
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
           /_ no channel (some mocks) — complete() still works _/;
         }
         const done = await result.complete();
         if (!raw) raw = done.text || "";
         const match = raw.trim().match(/\{[\s\S]\*\}/);
         if (match) {
           const parsed = JSON.parse(match[0]) as {
             prompt?: string;
             options?: unknown;
           };
           const opts = coerceOptions(parsed.options);
           if (opts.length >= 2) {
             const prompt = (parsed.prompt || fallback.prompt)
               .toString()
               .slice(0, 200);
             await emit("end", prompt);
             return { prompt, options: opts };
           }
         }
       } catch {
         // malformed output — retry once, then fall through to fallback
       }
     }
     await emit("end", fallback.prompt);
     return fallback;
   }
   ```

> `companionDecide` stays canned for now — that's module 08.

The complete implementations are in [`solution/index.ts`](solution/index.ts).

### 6. Verify (canned — no setup)

```bash
npm run typecheck
npm run dev
```

Play a turn. Even without a model, the fallback keeps it playable.

### 7. Verify (real AI — optional)

**Verify (real AI — fully optional):** only if you _want_ live, improvised narration (see "No Ollama? No problem" above — the module is complete without this). Install and run [Ollama](https://ollama.com), then:

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

   On Windows / PowerShell, translate the quoting as shown in
   [the curl reference](../README.md#reference-curl-windows-quoting-and-resetting-state)
   — the JSON body is identical. Swap `REPLACE_WITH_GAME_ID` for a real `gameId` and use
   your own credentials.

Catch up from `workshop/app/`: `cp ../07-ai-dm/solution/index.ts aws-blocks/index.ts`

### The React side

The backend streams the DM's reasoning as `text-delta` chunks, and each chunk is only the
**new fragment** — the server does not resend the growing string. So the accumulation is the
**client's** job: the React app has to concatenate every fragment as it arrives. The workshop
only had you build the emitting half; here's the receiving half so the whole streaming loop
makes sense.

Look at `app/src/screens/GameRoom.jsx`. A `thinking` state holds the live banner:

```jsx
// ~L23
const [thinking, setThinking] = useState(null) // { who, color, text } live agent reasoning
```

A subscription to `getThinkingChannel` reduces the three phases into that state (~L99–113):

```jsx
const channel = await api.getThinkingChannel(gameId)
sub = channel.subscribe((ev) => {
  if (ev.phase === 'start') setThinking({ who: ev.who, color: ev.color, text: '' })
  else if (ev.phase === 'delta') setThinking((t) => t && t.who === ev.who
    ? { ...t, text: t.text + ev.text }        // ← accumulate: OLD text + new fragment
    : { who: ev.who, color: ev.color, text: ev.text })
  else if (ev.phase === 'end') setThinking((t) => t && ev.text ? { ...t, text: ev.text } : t)
})
```

The one line that matters is `text: t.text + ev.text`. That `+` is the accumulation: each
`delta` appends the incoming fragment to what's already there. The banner then renders
`thinking.text` with a blinking cursor (~L331–344):

```jsx
<span style={{ color: 'var(--text)' }}>{thinking.text || '…'}</span>
<span style={{ color: thinking.color }}>▋</span>
```

The trap: if you wrote `text: ev.text` instead of `text: t.text + ev.text`, each token would
**replace** the previous one, so the banner would flicker one word at a time and never build
a sentence — which looks exactly like a broken backend, even though the server is doing the
right thing. Note there is nothing framework-magical here: it's a plain `useState` reducer
where the updater reads the previous value `t` and returns the next one.

**Exercise:** temporarily change the `delta` branch from `text: t.text + ev.text` to
`text: ev.text`, run `npm run dev` with Ollama, and watch a turn. The thinking bar will jump
between single fragments instead of growing a sentence. Put the `+` back and it accumulates
again. That one character is the entire difference between "streaming reasoning" and "the
backend looks broken."

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
