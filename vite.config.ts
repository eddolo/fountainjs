import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('./examples/react-app', import.meta.url)),
  plugins: [react()],
  server: { port: 5173, open: true },
});
