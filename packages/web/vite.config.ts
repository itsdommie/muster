import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the same build works under Electron (file://) and Capacitor.
  base: './',
  server: { host: '127.0.0.1', port: Number(process.env.WEB_PORT ?? 5173) },
  preview: { host: '127.0.0.1', port: Number(process.env.WEB_PORT ?? 4173), strictPort: true },
});
