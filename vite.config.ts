import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname, 'examples/react-app'),
  plugins: [react(), tsconfigPaths()],
  resolve: {
    alias: {
      'fountainjs': path.resolve(__dirname, 'src'),
    },
  },
});