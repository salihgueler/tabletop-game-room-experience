# Task 06: Next.js Hosting with Security

## Prompt

Deploy this Next.js SSR application with the following production requirements:

- Custom domain: `app.example.com`
- WAF (Web Application Firewall) enabled for DDoS protection
- Content-Security-Policy headers that allow the app's own API and WebSocket connections
- The app should be served under basePath `/dashboard` (not root)
- HTTPS required

## Starting State

A Blocks project with a Next.js frontend already in `src/`. The `aws-blocks/index.ts` has a basic API. Hosting is not yet configured.

## Expected Output

- CDK stack configuration or `aws-blocks/index.ts` additions for hosting
- Hosting block with domain, WAF, CSP, and basePath configuration

## Verification

- Hosting block instantiated
- Custom domain configuration present
- WAF enabled
- CSP headers configured (connect-src includes amazonaws.com)
- basePath set to '/dashboard'
