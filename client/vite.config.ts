import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies API + uploads + websocket to the Fastify backend on :4000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
      '/ws': { target: 'ws://localhost:4000', ws: true },
    },
  },
  build: { outDir: 'dist' },
});
