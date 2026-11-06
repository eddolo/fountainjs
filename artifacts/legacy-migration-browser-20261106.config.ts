import {defineConfig} from '@playwright/test';
import base from './retained-adapter-browser-20261106.config';
const viewport={width:1440,height:1400};
export default defineConfig({...base,use:{...base.use,viewport},projects:base.projects!.map(project=>({...project,use:{...project.use,viewport}})),testMatch:'**/legacy-migration-real.spec.ts',outputDir:'./legacy-migration-browser-20261106',reporter:[['list'],['json',{outputFile:'legacy-migration-browser-20261106.json'}]],webServer:{...base.webServer,command:'node artifacts/build-legacy-migration-20261106.mjs && pnpm exec vite --config artifacts/legacy-migration-vite-20261106.config.ts',url:'http://127.0.0.1:4195/artifacts/legacy-migration-fixture-20261106.html'}});
