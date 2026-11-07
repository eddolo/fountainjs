import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('../',import.meta.url)),cacheDir:'node_modules/.vite-retained-repair-20261107',optimizeDeps:{entries:['artifacts/retained-repair-fixture-20261107.html'],include:['yjs']},server:{watch:null,open:false,host:'127.0.0.1',port:4195,strictPort:true}});
