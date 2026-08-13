# Task 07: Debug Auth 401 Errors

## Prompt

Users report getting 401 "Not authenticated" errors on ALL API calls, even right after signing in successfully. The login works fine (they see the auth UI, enter credentials, get redirected) but every subsequent API call fails with 401.

Find and fix the bug.

## Starting State

The following code is in `aws-blocks/index.ts`:

```typescript
import { Scope, ApiNamespace, AuthBasic } from '@aws-blocks/blocks';

const scope = new Scope('myapp');

const auth = new AuthBasic(scope, 'auth', {
  allowSignUp: true,
});

// BUG: auth is not wired into the ApiNamespace
export const api = new ApiNamespace(scope, 'api', (context) => ({
  async getProfile() {
    const user = await auth.requireAuth(context);
    return { id: user.userId, username: user.username };
  },

  async listItems() {
    const user = await auth.requireAuth(context);
    return { items: [`item-for-${user.userId}`] };
  },

  async createItem(name: string) {
    const user = await auth.requireAuth(context);
    return { created: true, name, owner: user.userId };
  },
}));

export const authApi = auth.createApi();
```

The frontend auth widget works correctly — users can sign up and sign in. But after sign-in, calling any API method (getProfile, listItems, createItem) returns a 401 error.

## Expected Output

- Fixed `aws-blocks/index.ts` where auth is properly wired so that authenticated requests succeed

## Verification

- The auth block is passed to ApiNamespace (e.g., `{ auth }` in options or `withAuth`)
- The fix does NOT remove `requireAuth` calls (those are correct)
- The fix does NOT replace AuthBasic with a different auth block
