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
  },
  build: {
    outDir: 'dist',
  },
})
