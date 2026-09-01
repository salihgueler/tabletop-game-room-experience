# Module 07 — AI Dungeon Master (`cannedNarration` → `Agent`)

**Goal:** replace the deterministic canned narrator with a real streaming LLM `Agent` that
narrates outcomes and generates contextual, scene-specific action choices — while keeping
the canned logic as an offline fallback.

**Block introduced:** `Agent`

**You edit:** `app/backend/aws-blocks/index.ts`

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
    local: OllamaModels.SMALL,       // Ollama locally if running
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

The chain is: **Bedrock (deployed) → Ollama (local) → canned provider (implicit final
fallback)**. The canned provider — the built-in offline provider that returns the
deterministic, hand-written text instead of calling a model — is always appended
automatically; you never declare it.

## Steps

> **Working directory:** every fence in this module starts from `workshop-flutter/app/`.
> The `cd` lines are written so you can paste them in order from there.

Below is the actual code you're copying in this module's checkpoint, so you can
read through what each piece does before moving on.

### 1. Update the imports

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

### 2. Add the `dm` Agent construction

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

### 3. Update the `narrate` implementation

Builds a prompt from the action + roll outcome, calls `dm.stream(...).complete()`,
returns the text, and falls back to `cannedNarration` on any error:

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

### 4. Update the `nextScene` implementation

Streams the DM's reasoning to the `thinking` channel via `rt.publish(...)`, asks for
a JSON scene + options, parses (with one retry), and falls back to the generic prompt +
class actions if parsing fails:

> `companionDecide` stays canned for now — that's module 08.

**The shape, before the code.** The real block below is long, but the flow is small.
Read this first so you can tell the lesson from the plumbing:

```text
emit "start" to the thinking channel
for up to two attempts:
    stream the model
    forward each text-delta chunk to the thinking channel (live reasoning)
    complete the stream and collect the full text
    extract the JSON object from that text
    if it has enough options -> emit "end" and return the scene
otherwise -> fall back to the fixed per-class actions
```

Everything below is that same flow, hardened: the extra lines exist to survive small
local models that stream oddly, wrap JSON in prose, or return malformed output.

```ts
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
        /* no channel (some mocks) — complete() still works */
      }
      const done = await result.complete();
      if (!raw) raw = done.text || "";
      const match = raw.trim().match(/\{[\s\S]*\}/);
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

**Reading notes.** Two things are worth knowing before you move on:

- `coerceOptions` is **defensive-only** — safe to skip on a first read. It exists because
  small local models don't always return a clean array: they hand back options as a comma
  string, wrapped in `{action: ...}` / `{label: ...}` objects, or prefixed with bullets and
  numbering. `coerceOptions` normalises all of that into a plain `string[]`. It changes no
  logic — it only cleans input — so ignore it until you hit a model that misbehaves.
- Two lines are **load-bearing**, so find them in the block:
  - `void emit("delta", chunk.text)` — this is what makes "AI thinking" visible live. Each
    `text-delta` chunk is republished to the `thinking` channel, which is what the Flutter
    thinking bar renders token-by-token.
  - `raw.trim().match(/\{[\s\S]*\}/)` — the regex that extracts the JSON object out of
    whatever the model said. Models routinely wrap their JSON in prose or code fences, so
    you can't `JSON.parse` the raw text; you pull the `{...}` span out first.

---

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
model.

**How to tell which one you're on:** scene-specific options ("Pry open the rune door") =
a real model is answering; the fixed class menu ("Attack / Defend Ally / Cast Bless /
Investigate") = the canned fallback. Both are correct.

### ⚠️ Model pinning gotcha (bit the real app in production)

`BedrockModels.BALANCED` is the documented default, but Bedrock periodically retires the
underlying model id. A retired id fails the agent's health check and **silently falls back
to canned** — so deployed narration goes generic while local (Ollama) looks fine. If that
happens, check the deployed Lambda logs for agent errors and pin an explicit, current
inference-profile id instead of the preset — an inference profile is Bedrock's stable,
named handle for a specific model version, so pinning it means you name the exact model
rather than trusting a preset that can be retired underneath you.

### 5. **Regenerate the Dart client and rebuild:**

   ```bash
   cd backend   # make sure you are at the backend folder
   npm run typecheck
   npx blocks-generate-spec aws-blocks/index.ts ../lib/blocks.spec.json
   cd ..
   dart run build_runner build --delete-conflicting-outputs
   flutter analyze
   flutter test
   ```

### 6. **Run it (canned — no setup required):**

   ```bash
   flutter run -d chrome
   ```

   Play a turn. Even without a model, the fallback keeps it playable — canned narration
   and the fixed class menu. The thinking bar shows the fallback prompt text.

### 7. **Run it (real AI — fully optional):** only if you _want_ live, improvised narration.
   Install and run [Ollama](https://ollama.com), then:

   ```bash
   ollama serve
   ollama pull llama3.1:8b
   ```

   Restart `npm run dev` (from `app/backend`) and re-run `flutter run -d chrome` (any
   `flutter run` target works — `-d chrome` is the cross-platform default this workshop
   uses). Now the
   DM narrates in-character, the action choices fit the moment, and the "🤔 thinking" bar
   streams the DM's reasoning live. `text-delta` chunks are re-published to the `thinking`
   Realtime namespace by `nextScene`.

---

## Verify

- Without Ollama: game plays, actions are the fixed class menu, narration is canned but
  atmospheric.
- With Ollama: options become scene-specific ("Examine the glowing runes"), reasoning
  streams token-by-token to the thinking bar.

### The Flutter side

You just made the backend emit `delta` chunks. This is the other half of that: what turns a
stream of fragments into the thinking bar you watched fill up.

Open `app/lib/ui/features/game/game_view_model.dart` and find the `thinkingEvents`
subscription inside `_subscribe()` (around L196-214). It is a three-case state machine over
the phases your `nextScene` emits:

```dart
if (event.phase == 'start') {
  thinking = event;                       // open the bar
} else if (event.phase == 'delta') {
  thinking = ThinkingEvent(               // append — note: a NEW object
    who: event.who,
    phase: event.phase,
    text: '${thinking?.text ?? ''}${event.text}',
  );
} else {
  thinking = null;                        // close the bar
}
notifyListeners();
```

Two things here are worth more than the backend code you just wrote:

- **Accumulation lives on the client.** The server sends only the new fragment, never the
  full text so far. If you forgot the `'${thinking?.text ?? ''}'` prefix you would see each
  token *replace* the last instead of extending it — a one-character bug that looks like a
  backend streaming failure. When a stream renders wrong, check who is responsible for
  accumulating before you go digging in the agent.
- **It builds a new `ThinkingEvent` rather than mutating the old one**, then calls
  `notifyListeners()`. This is a `ChangeNotifier`, so the rebuild is what you asked for
  explicitly — nothing is reactive by magic.

Note the whole block is wrapped in `try { … } catch (_) {}`. The thinking bar is
deliberately non-essential: if the thinking channel fails, the game keeps playing and you
simply lose the live reasoning display. Compare that with the state channel, where a failure
falls back to polling because the board *must* stay current. Deciding which streams are
load-bearing and which are decoration is a design choice you are making here, not an
accident of the framework.

**Exercise (2 min):** delete the `'${thinking?.text ?? ''}'` prefix, `flutter run`, and take
a turn. The bar will flicker one token at a time instead of building a sentence. Put it back.

## Checklist

- [ ] `npm run typecheck` passes.
- [ ] `flutter analyze` reports no issues.
- [ ] With no model, the game still runs (canned fallback).
- [ ] With Ollama running, action options are scene-specific and DM reasoning streams to
      the thinking bar.

## What you learned

- `Agent` gives you streaming LLM calls with a **built-in model fallback chain**
  (Bedrock → Ollama → canned) and no infra to manage.
- `inferenceOnly` agents are stateless one-shots — ideal for per-turn narration at scale.
- Streaming `text-delta` chunks to a Realtime namespace is how you show an AI "thinking"
  live in the Flutter game view model.
- Always design an LLM feature to **degrade, not fail** — and know that silent fallback
  can mask a deployed model problem (the pinning gotcha).

## Troubleshooting

- **Options stay generic even with Ollama running** — the model returned unparseable JSON
  (small models do this occasionally) or Ollama isn't reachable at `localhost:11434`.
  Confirm `ollama list` shows `llama3.1:8b`.
- **`AgentErrors.ModelUnavailable`** — no provider passed a health check; ensure Ollama is
  serving, or accept the canned fallback.
- **Deployed narration generic but local fine** — the model-pinning gotcha above. Check
  Lambda logs; pin a current inference-profile id.

---

**Next:** [Module 08 — AI companions](../08-companions/README.md) — give each AI seat its
own `Agent` persona so the party members reason and speak in character: true multi-agent
play.
