import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Resolve the `aws-blocks` workspace package to its browser client (client.js).
  resolve: {
    conditions: ['browser'],
  },
  server: {
    port: 3000,
    // Proxy the Blocks API + realtime through the dev origin so the browser
    // talks to a SINGLE origin (localhost:3000). This keeps the auth session
    // cookie (SameSite=Lax) reliably attached — a cross-port request (:3000 →
    // :3001) is treated as third-party by real browsers and the cookie is
    // dropped, which broke sign-in (sign-up appeared to work only because it
    // returns the session inline).
    proxy: {
      // Proxy ONLY the API + auth endpoints (not the whole /aws-blocks/ path —
      // that would swallow the workspace source like /aws-blocks/client.js that
      // Vite must serve itself).
      '/aws-blocks/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/aws-blocks/auth': { target: 'http://localhost:3001', changeOrigin: true },
      '/realtime': { target: 'ws://localhost:3001', ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
  },
})
