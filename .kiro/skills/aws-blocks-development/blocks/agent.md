# Agent

Conversational AI: chatbots, copilots, support assistants — any feature where a
user talks to an LLM with optional tool calling and persisted history. Powered
by the Strands Agents SDK, streamed to the browser over Realtime, run
asynchronously so it never hits the API Gateway 29s timeout.

**When NOT to use:** one-shot text generation with no conversation (call the
Bedrock SDK directly); RAG retrieval with no conversation (use the KnowledgeBase
block); server-to-server calls that don't stream.

Import `Agent`, `BedrockModels`, `OllamaModels`, and `AgentErrors` from
`@aws-blocks/blocks`. `Agent` is **server-side only** — instantiate it in
`aws-blocks/index.ts` (backend), never in frontend code (it throws
`BrowserNotSupportedException` in a browser). The frontend uses the `useChat`
hook or plain API calls.

**Zod 4.x required** for tool `parameters` schemas specifically. (Other blocks
accept any `@standard-schema/spec` validator; Agent tools need Zod 4.)

## Contents

- Minimal example
- `AgentConfig`
- Models — presets, IDs, fallback, health checks
- Tools — declaration, context, approval, custom interrupts
- Streaming and chunk shapes
- Conversation methods and record shapes
- Persistence model
- Running locally
- KnowledgeBase as a tool
- Client hook — `useChat`
- Error handling
- Best practices
- What it provisions

## Minimal example

```typescript
import { Scope, ApiNamespace } from '@aws-blocks/core';
import { Agent } from '@aws-blocks/blocks';
import { z } from 'zod';

const scope = new Scope('my-app');

const agent = new Agent(scope, 'chat', {
  // model is optional — defaults to BedrockModels.BALANCED (Claude Sonnet 4.6)
  systemPrompt: 'You are a helpful assistant.',
  tools: (tool) => ({
    getOrderStatus: tool({
      description: 'Get the status of a customer order by ID',
      parameters: z.object({ orderId: z.string() }),
      handler: async ({ input }) => {
        const order = await db.getOrder(input.orderId); // input.orderId: string
        return { orderId: input.orderId, status: order.status };
      },
    }),
  }),
});

export const api = new ApiNamespace(scope, 'api', (context) => ({
  async chat(message: string, conversationId: string, userId: string) {
    return await agent.stream(message, { conversationId, userId });
  },
  async newConversation(userId: string) {
    return { conversationId: await agent.createConversationId(userId) };
  },
}));
```

## `AgentConfig`

```typescript
interface AgentConfig<TContext = Record<string, any>> {
  systemPrompt: string;                       // required
  model?: {
    deployed?: ModelConfig | ModelConfig[];   // AWS; default BedrockModels.BALANCED
    local?: ModelConfig | ModelConfig[];       // local dev; canned is implicit last fallback
  };
  tools?: (tool: ToolFactory) => Record<string, AgentTool>;
  toolContextSchema?: z.ZodType<TContext>;    // Zod schema for per-call context
  inferenceOnly?: boolean;                    // default false — skip persistence infra
  conversation?: ConversationManagerConfig;
  streamingMode?: 'token' | 'block';          // default 'block'
  name?: string;                              // forwarded to Strands (routing/tracing)
  description?: string;                        // forwarded to Strands (routing/tracing)
  removalPolicy?: 'destroy' | 'retain';       // teardown of the sessions FileBucket
  maxLlmCalls?: number | false;               // per-turn cap on model calls (false = disable)
  maxToolIterations?: number | false;         // per-turn cap on tool loops (false = disable)
  logger?: ChildLogger;
}
```

`ModelConfig` is `{ provider: 'bedrock' | 'openai-api' | 'canned'; modelId?;
endpoint?; apiKey?: string | (() => Promise<string>); inferenceConfig?;
guardrails? }`. `endpoint` defaults to `https://api.openai.com/v1`; `apiKey`
falls back to the `OPENAI_API_KEY` env var; `modelId` is required for
bedrock/openai-api. `inferenceConfig` is `{ temperature?, topP?, maxTokens?,
stopSequences? }`.


- `name` / `description` are passed through to the underlying Strands agent (for
  multi-agent routing and tracing) — spread in only when set.
- `removalPolicy` controls teardown of the **internal sessions FileBucket**.
  Omitted → CDK RETAIN (session blobs survive `cdk destroy`, and a `destroy`
  will fail on the non-empty bucket). Pass `'destroy'` for sandbox/ephemeral
  stacks; it pairs the bucket with `autoDeleteObjects`.
- `structuredOutput` has been **removed** from `AgentConfig` (#479, `2cb9d74`);
  it does not exist at the `0.6.0` pin. It was present but inert in `0.4.0` (no
  code path ever consumed it). Do not reference it — shape model output with tools
  or by parsing the streamed text instead.
- **Per-turn cost caps (`maxLlmCalls`, `maxToolIterations`)** are shipped
  (#455, `9111c0c`; `bb-agent/dist/types.d.ts`). Each is a positive integer or
  `false` (disable). A cap trip stops the turn and the client gets an `error`
  chunk instead of `done`.

### Conversation strategy

```typescript
type ConversationManagerConfig =
  | { strategy?: 'sliding-window'; windowSize?: number }
  | { strategy: 'summarizing'; summaryRatio?: number; preserveRecentMessages?: number };
```

Without a strategy, context grows unbounded. `'sliding-window'` (the default)
keeps the last `windowSize` messages. `'summarizing'` summarizes older messages
and keeps recent ones intact — `summaryRatio` is the fraction of messages to
summarize, `preserveRecentMessages` the count always kept verbatim. This trims
the context window **in memory before each model call only**; it never deletes
messages from stored history (`getConversation` still returns everything).

## Models — presets, IDs, fallback, health checks

Prefer the capability-named presets so the underlying model can be upgraded
without a code change. All Bedrock presets use `global.` inference profiles for
region-agnostic deployment.

```typescript
import { Agent, BedrockModels, OllamaModels } from '@aws-blocks/blocks';

const agent = new Agent(scope, 'chat', {
  model: { deployed: BedrockModels.BALANCED, local: OllamaModels.SMALL },
  systemPrompt: '...',
});
```

**`BedrockModels`** (concrete IDs, from source — do not invent others):

| Preset | Model ID |
|---|---|
| `BALANCED` | `global.anthropic.claude-sonnet-4-6` (recommended default) |
| `SMART` | `global.anthropic.claude-opus-4-8` |
| `FAST` | `global.anthropic.claude-haiku-4-5-20251001-v1:0` |

Deprecated aliases still resolve: `DEFAULT` → same as `BALANCED`;
`BUDGET` and `MICRO` → same as `FAST`.

**`OllamaModels`** (local dev, `openai-api` provider against
`http://localhost:11434/v1`; run `ollama serve` and `ollama pull <id>` first):

| Preset | Model ID |
|---|---|
| `XSMALL` | `llama3.2:3b` |
| `SMALL` | `llama3.1:8b` |
| `MEDIUM` | `deepseek-r1:14b` |
| `LARGE` | `llama3.3:70b` |
| `XLARGE` | `llama4:16x17b` |

The source flags `MEDIUM` (`deepseek-r1:14b`) as **strong at reasoning but weak
at tool calling** — don't reach for it as the tool-using model; prefer `SMALL`
or `LARGE` when tools matter.

**Fallback chain.** `deployed` / `local` each accept an array; candidates are
health-checked in order and the first available wins.

```typescript
model: {
  deployed: [BedrockModels.BALANCED, BedrockModels.FAST],
  local: [
    { provider: 'openai-api', modelId: 'llama3.1:70b', endpoint: 'http://vllm.internal/v1' },
    OllamaModels.SMALL,
  ],
}
```

**When canned applies — and when it does NOT.** The `canned` provider is the
implicit last fallback **only when `local` is omitted entirely**. If you supply a
non-empty `local` (or `deployed`) array and every candidate fails its health
check, the agent throws `AgentErrors.ModelUnavailable` — it does *not* silently
fall back to canned. So an explicit list of unreachable endpoints fails loudly
rather than serving mock responses.

**Health checks** run before selection (no inference cost):
- **bedrock** — `GetInferenceProfile`, then `GetFoundationModel`, via
  `@aws-sdk/client-bedrock`. Verifies the model exists; does not prove EULA
  acceptance or tool-calling support.
- **openai-api** — `GET {endpoint}/models` and checks `modelId` is in the list
  (uses `OPENAI_API_KEY` if no `apiKey`). A non-JSON body is treated as
  unhealthy so the next candidate is tried.
- **canned** — always available.

**Bedrock model access is a runtime prerequisite, not a synth-time one.** You
must enable access to the chosen model in the Bedrock console **for the deploy
region**. Missing access does not fail `cdk synth` or `cdk deploy` — it surfaces
at **runtime** as `AgentErrors.ModelUnavailable` when the health check can't
resolve the model. Enable model access before the first real turn.

## Tools

`tools` MUST be a **callback** — a plain array or object is rejected at compile
time. The callback receives the `tool()` factory; returning a Record keyed by
tool name lets TypeScript infer each tool's `input` from its Zod `parameters`.
Handlers receive `{ input, context }` (destructured), not a flat object.

**Return types must be JSON-safe.** Every field must be an explicit JSON type
(`string`, `number`, `boolean`, `null`, arrays, plain objects). `undefined` is
not valid JSON — for an optional field return `null` explicitly, or the return
type is rejected with an index-signature error.

### Tool context — scoping tools to the caller

Pass request-scoped data (e.g. `userId`) into tools without the model seeing it.
When `toolContextSchema` is set, `stream()`/`resume()` **require** a matching
`context` (validated at call time) and handlers get it typed:

```typescript
const agent = new Agent(scope, 'support', {
  systemPrompt: '...',
  toolContextSchema: z.object({ userId: z.string(), tenantId: z.string() }),
  tools: (tool) => ({
    listMyOrders: tool({
      description: "List the current user's orders",
      parameters: z.object({}),
      handler: async ({ context }) => db.listOrders({ userId: context.userId }),
    }),
  }),
});
await agent.stream(message, { conversationId, userId, context: { userId, tenantId } });
```

### Approval and custom interrupts (human-in-the-loop)

`needsApproval: true` pauses for blanket confirmation; add `trustable: true` to
let the user auto-approve that tool for the rest of the conversation. For
conditional pausing, use `interrupt` instead — a function that calls
`interrupt({ name, reason? })` only when it decides to. `needsApproval`/`trustable`
and `interrupt` are **mutually exclusive** — setting both throws
`InvalidModelConfig`.

```typescript
tools: (tool) => ({
  transferMoney: tool({
    description: 'Transfer money between accounts',
    parameters: z.object({ from: z.string(), to: z.string(), amount: z.number() }),
    interrupt: ({ input, interrupt }) => {          // conditional pause
      if (input.amount > 100) {
        interrupt({ name: 'confirm-transfer', reason: { message: `Transfer $${input.amount}?` } });
      }
    },
    handler: async ({ input }) => ({ status: 'completed', amount: input.amount }),
  }),
  deleteAccount: tool({                             // blanket approval
    description: 'Permanently delete a user account',
    parameters: z.object({ userId: z.string() }),
    needsApproval: true,
    trustable: true,
    handler: async ({ input }) => { /* ... */ },
  }),
}),
```

## Streaming and chunk shapes

`streamingMode: 'block'` (default) publishes complete content blocks — smoother
for most UIs. `'token'` publishes every text delta immediately — typewriter
effect.

Chunks arrive on the Realtime channel. These shapes are exact
(`AgentStreamChunk`):

| Type | Payload | When |
|---|---|---|
| `text-delta` | `{ text: string }` | Each text chunk (token or block) |
| `tool-call` | `{ toolName, input }` | Agent is calling a tool |
| `tool-result` | `{ toolName }` | Tool returned — **no `output` field**; results go to DynamoDB history, not the wire |
| `interrupt` | `{ interrupts: Array<{ id, name, reason? }> }` | Approval/HITL needed — an **array**, keyed `interrupts` |
| `error` | `{ error: string }` | Agent execution error |
| `done` | `{ text, usage: { inputTokens, outputTokens, totalTokens } }` | Final response + token counts |

**Subscribe before you stream.** The agent emits chunks immediately after
`stream()`, so a subscription that isn't ready yet loses the early chunks.
Subscribe, await `established`, then send — or use the `useChat` hook, which
handles the ordering:

```typescript
const channel = await agent.getChannel(conversationId);
const sub = channel.subscribe((chunk) => { /* handle */ });
await sub.established;
await agent.stream(message, { conversationId, userId });
```

### Routing architecture

`stream()` submits the turn and returns `{ channelId }` immediately; the Strands
agent loop runs and publishes chunks to Realtime as they arrive. Locally the loop
runs in-process (Realtime over a local WebSocket on the dev-server port). On AWS
the loop runs on a **Bedrock AgentCore Runtime** (sessions up to 8h, warm
execution) with API Gateway WebSocket for chunk delivery and DynamoDB for history
— the streaming execution moved to AgentCore Runtime in `0.6.0` (`bb-agent@0.4.1`),
replacing the earlier SQS + Lambda consumer.

## Conversation methods and record shapes

| Method | Returns | Notes |
|---|---|---|
| `stream(message, options?)` | `AgentStreamResult` | `{ channelId, channel, complete(), toJSON() }`. Safe to return over RPC — serializes to `{ channelId, channel: null }` |
| `resume(channelId, responses, options?)` | `Promise<void>` | Continue after an interrupt |
| `createConversationId(userId)` | `Promise<string>` | New conversation ID + record |
| `getConversation(id, options?)` | `Promise<Message[]>` | `options.limit` caps to the most recent N (`limit <= 0` → empty) |
| `listConversations(userId)` | `Promise<Conversation[]>` | Sorted newest-updated first |
| `deleteConversation(id, userId)` | `Promise<void>` | Ownership-checked via the conversation record |
| `getPendingInterrupts(conversationId)` | `Promise<Array<{ id, name, reason? }>>` | Unanswered interrupts (reload support) |
| `getChannel(channelId)` | Realtime channel | Subscribe before `stream()` |

Exact record shapes (do not add fields):

```typescript
interface Message {          // returned by getConversation
  messageId: string;
  role: 'user' | 'assistant' | 'tool-call' | 'tool-result' | 'approval' | 'interrupt';
  content: string;
  contentType: 'text' | 'image' | 'audio' | 'video' | 'document';
  createdAt: number;
  metadata: MessageMetadata; // JSON-parsed
}

interface Conversation {     // returned by listConversations
  conversationId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}
```

There is no `timestamp`, `toolCalls`, `lastMessageAt`, or `preview` field on
these — `Message` uses `createdAt` and the 6-value `role` union above;
`Conversation` is exactly the four fields shown.

`resume()` **requires `options.conversationId`** — without it, the interrupted
Strands session (keyed by conversationId) can't be restored, so it throws
`InterruptRequired`. It also requires at least one response. For an
`inferenceOnly` agent there is no session to restore, so resume is impossible by
design.

```typescript
const result = await agent.stream('Delete all draft orders', { conversationId, userId });
const response = await result.complete();
if (response.interrupted) {
  const responses = response.interrupts.map(i => ({ interruptId: i.id, response: 'yes' }));
  await agent.resume(result.channelId, responses, { conversationId });  // conversationId REQUIRED
}
```

Conversation CRUD methods throw `AgentErrors.PersistenceRequired` on an
`inferenceOnly` agent. Ownership: `getConversation` and `getPendingInterrupts`
read by `conversationId` alone and do **not** verify ownership — authorize the
caller yourself (e.g. confirm the conversation is in `listConversations(userId)`)
before returning data.

## Persistence model

A non-`inferenceOnly` agent provisions:

- **Two DistributedTables** — `convos` (keyed `{ userId, conversationId }`) for
  conversation metadata, and `messages` (keyed `{ conversationId, messageId }`)
  for the frontend-visible history.
- **A FileBucket** holding **Strands session snapshots**, keyed by
  `conversationId` — this is what `resume()` restores and what
  `deleteConversation` clears.

The two are distinct: the DistributedTable history is your app's message log;
the FileBucket snapshots are Strands' internal agent state. Setting
`inferenceOnly: true` skips both DistributedTables (no history, no
`conversationId`), keeping only the FileBucket, Realtime, and AsyncJob.

Note the conversation strategy trims context **in memory** per call and does not
delete stored history — the tables and snapshots retain the full conversation.

## Running locally

Agents run out of the box locally — no API keys, no network, no cost.

- **Canned provider (default).** With no `model.local`, `canned` is used
  implicitly: keyword-based responses with tool-call support. Tool inputs are
  auto-generated from Zod schemas (`z.string()` → `"sample"`, `z.number()` →
  `1`). Mock data persists to `.bb-data/` across restarts (`rm -rf .bb-data` to
  wipe).
- **Real local LLM via Ollama** — set `model.local` to an `OllamaModels` preset,
  or an explicit `openai-api` config pointing at `http://localhost:11434/v1`
  (`apiKey: 'ollama'`), as shown in the fallback-chain example above.

The dev server is a long-running process — see the top-level SKILL.md for the
tmux/poll pattern and the JSON-RPC endpoint (`/aws-blocks/api`).

### Inference-only mode (stateless)

```typescript
const classifier = new Agent(scope, 'classifier', {
  inferenceOnly: true,
  model: { deployed: BedrockModels.FAST },
  systemPrompt: 'Classify sentiment as positive, negative, or neutral.',
});
const result = await classifier.stream('I love this product!'); // no conversationId
const done = await result.complete();
```

## KnowledgeBase as a tool

Wire the KnowledgeBase block in for RAG — the tool handler just calls
`kb.retrieve()`:

```typescript
import { KnowledgeBase } from '@aws-blocks/blocks';
const kb = new KnowledgeBase(scope, 'docs', { source: './knowledge' });

// inside tools: (tool) => ({ ... })
searchDocs: tool({
  description: 'Search product documentation',
  parameters: z.object({ query: z.string(), maxResults: z.number().optional() }),
  handler: async ({ input }) => kb.retrieve(input.query, { maxResults: input.maxResults ?? 5 }),
}),
```

## Client hook — `useChat`

Import from `@aws-blocks/bb-agent/client`. `useChat` manages conversation state,
the streaming subscription, and interrupt handling — including the
subscribe-before-stream ordering, so the frontend doesn't have to. `useChat` is
exported **only** from the `@aws-blocks/bb-agent/client` subpath — it is **not**
re-exported from the `@aws-blocks/blocks` umbrella nor from the `@aws-blocks/bb-agent`
main entry (the package's `.` export maps to the runtime/CDK builds; only the
`./client` export maps to the hooks module). Import it from the subpath or it
won't resolve. You supply an
`api` object (`sendMessage`, `createConversation`, `getConversation`, `resume`), a
`subscribe` callback that resolves a channel from a `channelId`, and change
callbacks (`onMessagesChange`, `onInterrupt`). Then:

```typescript
import { useChat } from '@aws-blocks/bb-agent/client';
const chat = useChat({ api, subscribe, onMessagesChange, onInterrupt });
await chat.sendMessage('Hello!');
await chat.respondToInterrupt([{ interruptId: 'x', approved: true }]);
```

## Error handling

Catch with `isBlocksError(e, AgentErrors.X)`:

| Constant | Name | When |
|---|---|---|
| `PersistenceRequired` | `PersistenceRequiredException` | Conversation CRUD (or missing `userId`) on an `inferenceOnly` agent |
| `InvalidModelConfig` | `InvalidModelConfigException` | Missing `modelId`/`apiKey`, unknown provider, `needsApproval`+`interrupt` both set, or invalid tool context |
| `ModelUnavailable` | `ModelUnavailableException` | All candidates failed health checks (incl. Bedrock model access not enabled in-region) |
| `StreamFailed` | `StreamFailedException` | Agent error during execution |
| `InterruptRequired` | `InterruptRequiredException` | Agent paused for approval; also thrown by `resume()` with no `conversationId` / no responses |
| `BrowserNotSupported` | `BrowserNotSupportedException` | Instantiated in a browser (server-side only) |

## Best practices

- One agent per concern — separate a support agent from a data agent.
- Keep tool count ≤ ~10; disambiguate with clear descriptions.
- Put auth data in `toolContextSchema`, never the system prompt.
- Always set a `conversation` strategy for chat agents, or context grows
  unbounded.
- Test with the canned provider first to verify tool wiring at no cost.
- Use `inferenceOnly` for stateless tasks (classification, extraction) to skip
  DynamoDB.

## What it provisions

- Bedrock AgentCore Runtime (streaming agent loop; sessions up to 8h) — on AWS
- Two DynamoDB tables (conversation + message history) — omitted when
  `inferenceOnly`
- S3 bucket (Strands session snapshots)
- API Gateway WebSocket (Realtime chunk delivery)
- IAM role with `bedrock:InvokeModel` / `InvokeModelWithResponseStream` and model
  discovery permissions

RAG retrieval as a tool comes from the KnowledgeBase block; the underlying
transport and background execution are the Realtime and AsyncJob blocks; protect
agent endpoints with an auth block.
