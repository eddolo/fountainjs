import { mergeConfig } from 'vite';
import base from '../vite.config.ts';

// Audit servers must not open tabs in the user's regular browser.
export default mergeConfig(base, { server: { open: false } });
