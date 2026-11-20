import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 开发态：前端跑在 5173，/api 走代理到 3001 上的 Express。
 * 生产态：`npm start` 由 Express 同时托管 dist 与 /api，单端口。
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 900,
  },
});
