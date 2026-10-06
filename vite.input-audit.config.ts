import { mergeConfig } from 'vite';
import base from './vite.config';

// Do not share optimized package exports with a user's already-open demo server.
export default mergeConfig(base, { cacheDir: 'node_modules/.vite-input-audit' });
