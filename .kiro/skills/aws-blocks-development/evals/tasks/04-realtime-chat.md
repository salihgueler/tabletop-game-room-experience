# Task 04: Real-time Chat Room

## Prompt

Build a chat room feature where:

- Users join a named room (e.g., "general", "random")
- Messages appear instantly for all users in the room (real-time, no polling)
- All messages are persisted in a database so users see history when they join
- There's a typing indicator showing when someone is typing
- Users must be authenticated to join a room

## Starting State

Bare Blocks project with an empty `aws-blocks/index.ts`.

## Expected Output

- `aws-blocks/index.ts` — backend with real-time messaging, message persistence, and auth
- Frontend showing real-time message updates

## Verification

- Realtime block instantiated with at least one namespace
- A data storage block for message history
- API method that returns a channel handle (auth-gated)
- Publish pattern for sending messages
- Subscribe pattern on the frontend
