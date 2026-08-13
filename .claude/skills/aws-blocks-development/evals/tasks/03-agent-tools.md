# Task 03: AI Chat Assistant with Tools

## Prompt

Build an AI chat assistant with the following capabilities:

1. A **weather lookup** tool — takes a city name, returns mock weather data (temperature, conditions)
2. A **calculator** tool — evaluates a mathematical expression and returns the result
3. A **product search** tool — queries a products database by name and returns matching products

The assistant should:
- Stream responses to the user in real-time
- Maintain conversation history (users can continue previous conversations)
- Require authentication before chatting

## Starting State

Bare Blocks project with an empty `aws-blocks/index.ts`.

## Expected Output

- `aws-blocks/index.ts` — backend with Agent block, 3 tools, auth, and a products data store
- Frontend with chat UI (or `useChat` hook usage)

## Verification

- Agent block instantiated
- Tools defined using the callback pattern `tools: (tool) => ({...})`
- At least 3 tools declared
- Auth required before agent access
- Conversation persistence (not inference-only)
