import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
          },
        },
      },
      preload: {
        input: {
          index: 'electron/preload.ts',
        },
        vite: {
          build: {
            outDir: 'dist-electron',
          },
        },
      },
    }),
  ],
  server: {
    port: 5173,
  },
})
