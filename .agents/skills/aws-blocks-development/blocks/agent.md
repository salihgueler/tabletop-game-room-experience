# Agent

**When to use:** Conversational AI features — chatbots, copilots, customer support, any feature where users interact with an LLM via natural language with optional tool use.

**When NOT to use:** Simple text generation without conversation (use Bedrock SDK directly), RAG-only retrieval without conversation (use KnowledgeBase), or server-to-server LLM calls without streaming.

AI agent with streaming, tool calling, and conversation persistence. Powered by [Strands Agents SDK](https://strandsagents.com/).

```typescript
import { Scope, ApiNamespace, Agent } from '@aws-blocks/blocks';

const scope = new Scope('my-app');

const agent = new Agent(scope, 'chat', {
  // model is optional — defaults to BedrockModels.BALANCED (Claude Sonnet 4.6)
  systemPrompt: 'You are a helpful assistant.',
  tools: (tool) => ({
    getOrderStatus: tool({
      description: 'Get the status of a customer order by ID',
      parameters: z.object({ orderId: z.string() }),
      handler: async ({ input }) => {
        const order = await db.getOrder(input.orderId); // input.orderId is typed as string
        return { orderId: input.orderId, status: order.status };
      },
    }),
  }),
});

export const api = new ApiNamespace(scope, "api", (context) => ({
  async chat(message: string, conversationId: string, userId: string) {
    return await agent.stream(message, { conversationId, userId });
  },
  async newConversation(userId: string) {
    return { conversationId: await agent.createConversationId(userId) };
  },
}));
```

**AgentConfig:**
- `model` — **optional** (defaults to `BedrockModels.BALANCED`). Full form: `{ deployed, local? }` — see Running Locally below

**⚠️ Zod version:** Agent requires **Zod 4.x** specifically for tool parameter schemas. Other blocks (KVStore, Realtime, DistributedTable) accept any `@standard-schema/spec` compatible validator (Zod, Valibot, ArkType).
- `systemPrompt` — system instructions for the agent
- `tools` — **callback pattern**: `(tool) => ({ toolName: tool({ description, parameters, handler, needsApproval?, interrupt? }) })`
- `toolContextSchema` — optional Zod schema for per-call context passed to tool handlers
- `inferenceOnly` — skip persistence infra (default: `false`)
- `conversation` — `{ strategy: 'sliding-window', windowSize }` or `{ strategy: 'summarizing', preserveRecentMessages }`
- `streamingMode` — `'token'` or `'block'` (default: `'block'`)

**⚠️ Tool declaration syntax:** `tools` MUST be a callback — a plain array/object is rejected at compile time. The callback form lets TypeScript infer each tool's `input` type from its Zod `parameters` schema. Handler receives `{ input, context }` (destructured), not a flat input object.

**⚠️ Tool return types must be JSON-safe:** Tool handlers must return values where every field is an explicit JSON type (`string`, `number`, `boolean`, `null`, arrays, or plain objects). TypeScript's `undefined` is not valid JSON — if a field may be absent, use `null` explicitly instead of optional fields. Otherwise, the Agent will reject the return type with an index signature error.

**Key methods:**
- `stream(message, options?)` — submit a message, returns `{ channelId, subscribe, complete }`
- `resume(channelId, responses, options?)` — resume after an interrupt
- `createConversationId(userId)` — generate a new conversation ID
- `getConversation(id, options?)` — get messages in a conversation
- `listConversations(userId)` — list all conversations for a user
- `deleteConversation(id, userId)` — delete a conversation
- `getPendingInterrupts(conversationId)` — get unanswered interrupts (for reload support)
- `getChannel(channelId)` — get a Realtime channel for subscribing to chunks

**⚠️ Subscribe before send:** The agent emits chunks immediately after `stream()`. The frontend must subscribe to the channel BEFORE calling `stream()`, otherwise early chunks are lost:

```typescript
// Backend: expose a subscribeChat method
async subscribeChat(conversationId: string) {
  const user = await auth.requireAuth(context);
  // Validate ownership
  const conversations = await agent.listConversations(user.username);
  if (!conversations.some(c => c.conversationId === conversationId)) {
    throw new Error('Conversation not found');
  }
  return agent.getChannel(conversationId);
},
```

**Important: Subscribe before sending.** The agent emits chunks immediately after `stream()`. Subscribe first, await `established`, then send:

```typescript
const channel = await agent.getChannel(conversationId);
const sub = channel.subscribe((chunk) => { /* handle */ });
await sub.established;
await agent.stream(message, { conversationId, userId });
```

**ModelConfig:**
- `provider` — `'bedrock'` | `'openai-api'` | `'canned'`
- `modelId` — model ID (required for bedrock and openai-api)
- `endpoint` — API endpoint for openai-api (defaults to api.openai.com)
- `apiKey` — string or `() => Promise<string>` for openai-api. Falls back to `OPENAI_API_KEY` env var
- `inferenceConfig` — `{ temperature?: number, topP?: number, maxTokens?: number, stopSequences?: string[] }`
- `guardrails` — `{ contentFilters?: Record<string, string>, pii?: Record<string, string>, blockedTopics?: string[] }`

**Model Presets (recommended):**

```typescript
import { Agent, BedrockModels, OllamaModels } from '@aws-blocks/blocks';

const agent = new Agent(scope, 'agent', {
  model: { deployed: BedrockModels.DEFAULT, local: OllamaModels.MEDIUM },
  systemPrompt: '...',
});
```

**Model presets:**
```typescript
import { Agent } from '@aws-blocks/blocks';

const agent = new Agent(scope, 'chat', {
  model: {
    deployed: BedrockModels.BALANCED, // Claude Sonnet 4.6 (recommended default)
    // Other presets:
    // BedrockModels.SMART  — Claude Opus 4.8 (highest capability)
    // BedrockModels.FAST   — Claude Haiku 4.5 (lowest latency)
  },
  systemPrompt: '...',
});
```

All presets use `global.` inference profiles for region-agnostic deployment.

**Deprecated presets:** `DEFAULT` → `BALANCED`, `BUDGET`/`MICRO` → `FAST` (still resolve, but model changes)

**Tool approval pattern (`needsApproval` + `trustable`):**
```typescript
tools: (tool) => ({
  deleteAccount: tool({
    description: 'Permanently delete a user account',
    parameters: z.object({ userId: z.string() }),
    needsApproval: true,   // Agent pauses for user confirmation
    trustable: true,        // User can auto-approve for rest of conversation
    handler: async ({ input }) => { /* ... */ },
  }),
}),
```

**Health Checks:** Before selecting a model, the agent verifies availability:
- Bedrock: checks model availability via `@aws-sdk/client-bedrock` (free, no inference cost)
- OpenAI-compatible: pings `GET /v1/models` at the configured endpoint (respects global API prefix). Uses `OPENAI_API_KEY` env var if no `apiKey` provided
- Canned: always available

**Error Handling:**

| Error | When |
|-------|------|
| `AgentErrors.PersistenceRequired` | Conversation CRUD on inferenceOnly agent |
| `AgentErrors.InvalidModelConfig` | Missing modelId/apiKey, unknown provider, `needsApproval` + `interrupt` both set |
| `AgentErrors.ModelUnavailable` | All model candidates failed health checks |
| `AgentErrors.StreamFailed` | Agent error during execution |
| `AgentErrors.InterruptRequired` | Agent paused for tool approval |
| `AgentErrors.BrowserNotSupported` | Agent instantiated in browser (server-side only) |

### Tool Context — Scoping Tools to the Caller

Pass request-scoped data (e.g., `userId`) to tools without the model seeing it:

```typescript
const agent = new Agent(scope, 'support', {
  model: { deployed: { provider: 'bedrock', modelId: '...' } },
  systemPrompt: '...',
  toolContextSchema: z.object({ userId: z.string(), tenantId: z.string() }),
  tools: (tool) => ({
    listMyOrders: tool({
      description: "List the current user's orders",
      parameters: z.object({}),
      handler: async ({ context }) => {
        // context.userId and context.tenantId are typed as string
        return db.listOrders({ userId: context.userId, tenantId: context.tenantId });
      },
    }),
  }),
});

// At API layer — pass authenticated user as context
await agent.stream(message, { conversationId, userId, context: { userId, tenantId } });
```

### Custom Interrupts (Human-in-the-Loop)

Beyond `needsApproval: true` (blanket approval), use `interrupt` for conditional pausing:

```typescript
tools: (tool) => ({
  transferMoney: tool({
    description: 'Transfer money between accounts',
    parameters: z.object({ from: z.string(), to: z.string(), amount: z.number() }),
    interrupt: ({ input, interrupt }) => {
      if (input.amount > 100) {
        interrupt({ name: 'confirm-transfer', reason: { message: `Transfer $${input.amount}?` } });
      }
    },
    handler: async ({ input }) => ({ status: 'completed', amount: input.amount }),
  }),
  bulkDelete: tool({
    description: 'Delete records matching a filter',
    parameters: z.object({ filter: z.string() }),
    handler: async ({ input, interrupt }) => {
      const matches = await db.query(input.filter);
      if (matches.length > 50) {
        const response = interrupt({ name: 'confirm-bulk-delete', reason: { message: `Delete ${matches.length} records?` } });
        if (response !== 'yes') return { cancelled: true };
      }
      return { deleted: matches.length };
    },
  }),
}),
```

Resume after interrupt: `agent.resume(channelId, [{ interruptId: 'x', response: 'yes' }])`.

### KnowledgeBase as Agent Tool

Wire `bb-knowledge-base` as an agent tool for RAG:

```typescript
import { KnowledgeBase } from '@aws-blocks/blocks';

const kb = new KnowledgeBase(scope, 'docs', { source: './knowledge' });

const agent = new Agent(scope, 'assistant', {
  model: { deployed: { provider: 'bedrock', modelId: '...' } },
  systemPrompt: 'Search the knowledge base when asked about our product.',
  tools: (tool) => ({
    searchDocs: tool({
      description: 'Search product documentation',
      parameters: z.object({ query: z.string(), maxResults: z.number().optional() }),
      handler: async ({ input }) => kb.retrieve(input.query, { maxResults: input.maxResults ?? 5 }),
    }),
  }),
});
```

### Client Hook — `useChat`

Import from `@aws-blocks/bb-agent/client`. Manages conversation state, streaming subscriptions, and interrupt handling:

```typescript
import { useChat } from '@aws-blocks/bb-agent/client';

const chat = useChat({
  api: {
    sendMessage: (convId, msg, chId) => api.sendMessage(convId, msg, chId),
    createConversation: () => api.createConversation(userId),
    getConversation: (id) => api.getConversation(id),
    resume: (chId, responses, convId) => api.resume(chId, responses, convId),
  },
  subscribe: async (channelId, handler) => {
    const { channel } = await api.getChannel(channelId);
    return channel.subscribe(handler);
  },
  onMessagesChange: (msgs) => renderMessages(msgs),
  onLoadingChange: (loading) => updateSpinner(loading),
  onInterrupt: (interrupts) => showApprovalUI(interrupts),
});

await chat.sendMessage('Hello!');
await chat.respondToInterrupt([{ interruptId: 'x', approved: true }]);
```

### Routing Architecture

The Agent BB uses an **async routing pattern** to avoid API Gateway timeouts (29s limit):

```
Frontend → API (stream()) → AsyncJob.submit() → returns { channelId } immediately
                                    ↓ (async, in background)
                            AsyncJob handler → runAgent()
                                    ↓
                            Strands Agent processes message + tool calls
                                    ↓
                            Publishes chunks to Realtime (channelId)
                                    ↓
Frontend subscribes to Realtime channel ← receives text-delta, tool-call, tool-result, done chunks
```

- **Locally:** AsyncJob runs synchronously in-process. Realtime uses a local WebSocket server on the dev server port (3000). No external services needed.
- **On AWS:** AsyncJob → SQS + Lambda. Realtime → API Gateway WebSocket. DynamoDB for conversation persistence.
- **Chunk types:** `text-delta` (streaming text), `tool-call` (agent calling a tool), `tool-result` (tool returned), `interrupt` (needs user approval), `error`, `done` (final text + token usage).

### Running Agents Locally

Agents work **out of the box locally** — no API keys, no network, no external services, no costs.

**Default behavior (Canned Provider):**
- If no `model.local` is specified, the `canned` provider is used implicitly
- Canned provider gives keyword-based responses with tool call support
- Tool inputs are auto-generated from Zod schemas (e.g., `z.string()` → `"sample"`, `z.number()` → `1`)
- Mock data persists to `.bb-data/` across dev server restarts. Wipe with `rm -rf .bb-data`

**Using Ollama for real LLM responses locally:**

```typescript
const agent = new Agent(scope, 'support', {
  model: {
    deployed: { provider: 'bedrock', modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0' },
    local: { provider: 'openai-api', modelId: 'llama3.1:8b', endpoint: 'http://localhost:11434/v1', apiKey: 'ollama' },
  },
  systemPrompt: '...',
});
```

Requires Ollama running locally: `ollama serve` and `ollama pull llama3.1:8b`.

**Model fallback chain (tries in order, first available wins):**

```typescript
model: {
  deployed: [
    { provider: 'bedrock', modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0' },
    { provider: 'bedrock', modelId: 'us.anthropic.claude-haiku-4-20250514-v1:0' },
  ],
  local: [
    { provider: 'openai-api', modelId: 'llama3.1:70b', endpoint: 'http://vllm.internal.company.com/v1' },
    { provider: 'openai-api', modelId: 'llama3.1:8b', endpoint: 'http://localhost:11434/v1', apiKey: 'ollama' },
    // canned is appended implicitly as last fallback
  ],
}
```

On company network: uses the shared vLLM server. At home/offline: falls through to local Ollama. Neither running: canned provider kicks in automatically.

**Running the dev server with agents:**

⚠️ Never run `npm run dev` directly in a blocking command — it doesn't exit. Use tmux + polling:

```bash
# Start in background tmux session
tmux new-session -d -s dev 'cd my-app && npm run dev'

# Poll until ready
for i in $(seq 1 30); do
  sleep 3
  OUTPUT=$(tmux capture-pane -t dev -p)
  echo "$OUTPUT" | grep -q "Blocks local server running" && echo "READY" && break
done

# Test the agent endpoint (JSON-RPC 2.0)
curl -X POST http://localhost:3000/aws-blocks/api \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"api.chat","params":["Hello","conv-1","user-1"],"id":1}'

# Kill when done
tmux kill-session -t dev
```

**Inference-only mode (no persistence, stateless):**

```typescript
const classifier = new Agent(scope, 'classifier', {
  inferenceOnly: true,
  model: { deployed: { provider: 'bedrock', modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0' } },
  systemPrompt: 'Classify the sentiment as positive, negative, or neutral.',
});
// No conversationId needed — stateless
const result = await classifier.stream('I love this product!');
const done = await result.complete();
```

Local mock: Canned provider (no API keys needed). AWS: Bedrock + DynamoDB + SQS + API Gateway WebSocket.

## Complete Options Reference

```typescript
interface AgentOptions {
  model?: ModelConfig | { deployed: ModelConfig | ModelConfig[]; local?: ModelConfig | ModelConfig[] };
  systemPrompt: string;
  tools?: (tool: ToolFactory) => Record<string, Tool>;
  toolContextSchema?: ZodSchema;              // Zod 4.x schema for request-scoped data
  inferenceOnly?: boolean;                    // default: false — skip persistence infra
  conversation?: ConversationStrategy;
  streamingMode?: 'token' | 'block';          // default: 'block'
}

interface ModelConfig {
  provider: 'bedrock' | 'openai-api' | 'canned';
  modelId?: string;                           // required for bedrock/openai-api
  endpoint?: string;                          // openai-api: defaults to api.openai.com
  apiKey?: string | (() => Promise<string>);  // openai-api: falls back to OPENAI_API_KEY env var
}

type ConversationStrategy =
  | { strategy: 'sliding-window'; windowSize: number }   // keep last N messages
  | { strategy: 'summarizing'; preserveRecentMessages?: number };  // auto-summarize older messages
```

## Streaming Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| `'block'` (default) | Chunks are complete paragraphs/tool results | Most UIs — smoother rendering |
| `'token'` | Individual tokens streamed as they're generated | Typewriter effect, low-latency display |

**Chunk types received on the Realtime channel:**

| Type | Payload | When |
|------|---------|------|
| `text-delta` | `{ text: string }` | Each text chunk (token or block) |
| `tool-call` | `{ toolName, input }` | Agent is calling a tool |
| `tool-result` | `{ toolName, output }` | Tool returned a result |
| `interrupt` | `{ interruptId, name, reason }` | Needs user approval |
| `error` | `{ message }` | Agent execution error |
| `done` | `{ text, usage: { inputTokens, outputTokens } }` | Final complete response + token counts |

## Conversation Management

| Method | Returns | Description |
|--------|---------|-------------|
| `createConversationId(userId)` | `Promise<string>` | Generate a new conversation ID |
| `getConversation(id, options?)` | `Promise<Message[]>` | Get messages. Options: `{ limit?, before? }` |
| `listConversations(userId)` | `Promise<ConversationSummary[]>` | List all conversations for user |
| `deleteConversation(id, userId)` | `Promise<void>` | Delete a conversation and its messages |
| `getPendingInterrupts(conversationId)` | `Promise<Interrupt[]>` | Get unanswered interrupts (for reload) |

```typescript
// List user's conversations
const convos = await agent.listConversations(userId);
// Returns: [{ conversationId, createdAt, lastMessageAt, preview }]

// Load messages with pagination
const messages = await agent.getConversation(conversationId, { limit: 50 });
// Returns: [{ role: 'user' | 'assistant', content, timestamp, toolCalls? }]
```

⚠️ These methods throw `AgentErrors.PersistenceRequired` if called on an `inferenceOnly` agent.

## Headless Usage (No UI)

### Without Tool Approval

```typescript
// Server-side — call agent and collect full response
const result = await agent.stream('Summarize this document', {
  conversationId, userId,
  context: { docId: 'doc-123' },
});

// Wait for completion (blocks until done)
const response = await result.complete();
// response: { text: '...', usage: { inputTokens, outputTokens } }
```

### With Tool Approval

```typescript
const result = await agent.stream('Delete all draft orders', { conversationId, userId });
const response = await result.complete();

if (response.interrupted) {
  // Agent paused — handle interrupt programmatically
  const interrupts = response.interrupts;
  // Auto-approve or reject based on business logic
  const responses = interrupts.map(i => ({ interruptId: i.id, response: 'yes' }));
  await agent.resume(result.channelId, responses, { conversationId });
}
```

## Best Practices

- **One agent per concern** — separate "support agent" from "data agent" rather than one mega-agent
- **Keep tool count ≤ 10** — LLMs struggle with tool selection above this. Use tool descriptions to disambiguate
- **Use toolContextSchema for auth data** — never put userId/tenantId in the system prompt (model can hallucinate it)
- **Set conversation strategy** — without it, context grows unbounded. Use `sliding-window` for simple chats, `summarizing` for long-running assistants
- **Test with canned provider first** — verify tool wiring and conversation flow without API costs
- **Use `inferenceOnly` for stateless tasks** — classification, extraction, single-turn generation. Avoids DynamoDB costs
- **Subscribe before stream** — always `await sub.established` before calling `stream()` or use `useChat` which handles ordering

## Scaling & Cost (AWS)

| Component | Cost | Notes |
|-----------|------|-------|
| Bedrock inference | ~$3/$15 per M input/output tokens (Sonnet) | Main cost driver |
| Lambda execution | Standard Lambda pricing | Agent handler runs until done |
| DynamoDB (conversations) | Pay-per-request | ~$0 for low-moderate usage |
| API Gateway WebSocket (streaming) | ~$1 per M messages | Chunk delivery |
| SQS (AsyncJob) | ~$0 | Negligible at normal scale |

**Lambda timeout:** Agent Lambda has 15-minute max (configured automatically). Long conversations with many tool calls may approach this. Monitor via `done` chunk's `usage` field.

**Concurrency:** Each `stream()` call occupies one Lambda invocation until complete. Set reserved concurrency if you need to limit parallel agent executions.

## Common Mistakes

❌ ``tools: [{ name: "search", ... }]``
✅ ``tools: (tool) => ({ search: tool({ description: "...", schema: z.object({...}), handler: async ({ input }) => {...} }) })``
_Tools must use the callback pattern, not a plain array_

❌ `Importing Agent in frontend code`
✅ `Only import Agent in `aws-blocks/index.ts` (backend). Frontend uses `useChat` hook or API calls.`
_Agent is server-side only — "BrowserNotSupported" error_

❌ `Expecting real LLM responses in local dev`
✅ `Configure `model.local` with Ollama endpoint, or accept `canned` provider mock responses`
_Default local provider is `canned` (keyword-based mock)_

❌ `Calling `stream()` before subscribing to the channel`
✅ ``await sub.established` THEN call `stream()` — or use `useChat` hook which handles ordering`
_Early chunks are lost if subscription isn't ready_


## What It Provisions

- Lambda function (async agent execution)
- DynamoDB table (conversation persistence)
- API Gateway WebSocket channel (streaming chunks to frontend)
- SQS queue (AsyncJob for background execution)
- IAM roles with Bedrock InvokeModel permissions

## See Also

- [knowledge-base](./knowledge-base.md) — RAG retrieval as a tool for the agent
- [realtime](./realtime.md) — Underlying streaming transport
- [async-job](./async-job.md) — Underlying background execution
- [auth-basic](./auth-basic.md) — Protecting agent endpoints