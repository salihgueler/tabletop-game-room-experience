# Task 01: Todo App with Auth

## Prompt

Create a new AWS Blocks app with React, user authentication, and a todo list stored in a database. Users should be able to sign up, sign in, and manage their own todos (create, list, update, delete). Each user should only see their own todos.

## Starting State

Bare Blocks project (template: `bare`). The `aws-blocks/index.ts` file is empty.

## Expected Output

- `aws-blocks/index.ts` — backend with auth + data + API methods
- `src/` — React frontend with auth UI and todo CRUD

## Verification

- An auth block is instantiated
- A data storage block is instantiated for todos
- API methods exist for CRUD operations
- Auth is wired into the API (routes are protected)
