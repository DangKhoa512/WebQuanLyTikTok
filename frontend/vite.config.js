import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,        // bind 0.0.0.0 → truy cập được trên LAN
    port: 5173,
    proxy: {
      '/api': {
        target:       'http://localhost:3000',
        changeOrigin: true,
        timeout:      600_000,
        proxyTimeout: 600_000,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
