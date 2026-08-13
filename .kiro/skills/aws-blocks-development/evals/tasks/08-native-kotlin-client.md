# Task 08: Native Kotlin Client SDK

## Prompt

I have an AWS Blocks API with these methods:

```typescript
export const api = new ApiNamespace(scope, 'api', { auth }, (context) => ({
  async listTodos() { /* ... */ },
  async createTodo(title: string, description?: string) { /* ... */ },
  async updateTodo(id: string, updates: { title?: string; done?: boolean }) { /* ... */ },
  async deleteTodo(id: string) { /* ... */ },
}));
```

Generate a Kotlin client SDK for Android that can call this API. The client should:

1. Handle authentication (pass auth tokens in requests)
2. Support all 4 methods with proper Kotlin types
3. Use coroutines for async calls
4. Include proper error handling

## Starting State

A working Blocks project with the API above.

## Expected Output

- Documentation or code showing how to generate the native client spec
- A Kotlin client file (or generation instructions) with typed methods for all 4 API operations

## Verification

- References to spec generation (`bb client-spec` or OpenAPI generation)
- OR a Kotlin file with suspend functions matching the API methods
- Auth token handling in the client
- Proper Kotlin types (not `Any` everywhere)
