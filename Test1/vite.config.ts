import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@fountainjs/editor': path.resolve(__dirname, '../src'),
      '@fountainjs/editor/react': path.resolve(__dirname, '../src/react'),
    },
  },
});
