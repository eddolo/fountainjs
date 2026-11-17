import { mergeConfig } from 'vite';
import base from '../vite.config.ts';
export default mergeConfig(base, { cacheDir: 'node_modules/.vite-yjs-native-index-isolated-20261117', server: { open: false } });
