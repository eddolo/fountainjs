import { mergeConfig } from 'vite';
import base from './vite.config';

export default mergeConfig(base, { base: '/fountainjs/', preview: { open: false } });
