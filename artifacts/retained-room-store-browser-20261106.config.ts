import {defineConfig} from '@playwright/test';
import base from './retained-adapter-browser-20261106.config';
export default defineConfig({...base,testMatch:'**/retained-room-store-real.spec.ts',outputDir:'./retained-room-store-browser-20261106',reporter:[['list'],['json',{outputFile:'retained-room-store-browser-20261106.json'}]],webServer:{...base.webServer,command:'node artifacts/build-retained-room-store-20261106.mjs && pnpm exec vite --config artifacts/retained-adapter-vite-20261106.config.ts',url:'http://127.0.0.1:4195/artifacts/retained-room-store-fixture-compiled-20261106.html'}});
