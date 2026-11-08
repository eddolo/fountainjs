import {defineConfig} from '@playwright/test';
import base from './cross-format-browser-20261107.config';
export default defineConfig({...base,testMatch:['**/yjs-namespace-real.spec.ts','**/yjs-structured-room-real.spec.ts'],outputDir:'./yjs-namespace-browser-20261107',reporter:[['list'],['json',{outputFile:'yjs-namespace-browser-20261107.json'}]],webServer:{...base.webServer,command:'node artifacts/build-yjs-namespace-20261107.mjs && node artifacts/yjs-namespace-server-20261107.mjs',url:'http://127.0.0.1:4195/artifacts/yjs-namespace-fixture-20261107.html'}});
