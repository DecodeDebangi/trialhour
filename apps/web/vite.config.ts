import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The API runs on :3001; proxying /api keeps the browser on one origin (no CORS).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:3001' },
  },
});
