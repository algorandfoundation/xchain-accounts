import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [
    tanstackStart({
      srcDirectory: 'app',
    }),
    // TanStack Start SSR routes don't hot-swap; force a full page reload instead
    {
      name: 'full-reload',
      handleHotUpdate({ server }) {
        server.ws.send({ type: 'full-reload' })
        return []
      },
    },
  ],
  resolve: {
    alias: {
      '~': path.resolve(import.meta.dirname, 'app'),
    },
  },
})
