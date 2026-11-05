import { mergeConfig } from 'vite';
import base from '../vite.input-audit.config.ts';
export default mergeConfig(base, { cacheDir: 'node_modules/.vite-native-focus-intent-audit', server: { open: false } });
