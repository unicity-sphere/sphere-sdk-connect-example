import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Matches backend-auth/backend's default FRONTEND_ORIGIN (http://localhost:5173) —
    // Vite's own default port, pinned explicitly here so the CORS pairing stays obvious.
    port: 5173,
  },
});
