import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('../',import.meta.url)),cacheDir:'node_modules/.vite-retained-adapter-minimal',optimizeDeps:{entries:['artifacts/retained-adapter-fixture-20261106.html'],include:['yjs']},server:{watch:null,open:false,host:'127.0.0.1',port:4195,strictPort:true}});
