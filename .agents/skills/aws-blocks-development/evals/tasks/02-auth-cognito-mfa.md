# Task 02: Production Auth with MFA and Groups

## Prompt

Add production-grade authentication to this app. Requirements:

- Multi-factor authentication: TOTP (authenticator app) and email OTP
- Two user groups: "admins" and "readers"
- A custom user attribute: "department"
- An API endpoint that only admins can access
- An API endpoint that returns the current user's profile including their groups and department
- MFA should be optional (users can enable it but aren't forced)

## Starting State

Bare Blocks project with an empty `aws-blocks/index.ts`.

## Expected Output

- `aws-blocks/index.ts` — backend with Cognito auth, groups, MFA config, and role-based API methods
- Frontend auth UI that handles MFA challenges

## Verification

- AuthCognito block instantiated with mfa, mfaTypes, groups, and userAttributes options
- API method using `requireRole` for admin access
- API method returning user profile with groups
