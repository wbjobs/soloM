import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  plugins: [react(), cesium()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesium')
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          cesium: ['cesium'],
          deckgl: ['@deck.gl/core', '@deck.gl/layers', '@deck.gl/geo-layers', 'deck.gl']
        }
      }
    }
  }
});
