import {defineConfig} from 'vite';
import base from './retained-adapter-vite-20261106.config';
export default defineConfig({...base,cacheDir:'node_modules/.vite-cursor-overlay-compiled',optimizeDeps:{entries:['artifacts/retained-adapter-fixture-compiled-20261106.html','artifacts/cursor-native-reference-compiled-20261106.html'],include:['yjs']}});
