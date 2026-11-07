import {defineConfig} from '@playwright/test';
import base from './retained-repair-browser-20261107.config';
export default defineConfig({...base,testMatch:'**/yjs-history-policy-real.spec.ts',outputDir:'./yjs-history-policy-browser-20261107',reporter:[['list'],['json',{outputFile:'yjs-history-policy-browser-20261107.json'}]],webServer:{...base.webServer,command:'node artifacts/build-yjs-history-policy-20261107.mjs && pnpm exec vite --config artifacts/yjs-history-policy-vite-20261107.config.ts',url:'http://127.0.0.1:4195/artifacts/yjs-history-policy-fixture-20261107.html'}});
