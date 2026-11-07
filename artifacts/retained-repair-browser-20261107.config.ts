import {defineConfig} from '@playwright/test';
import base from './retained-adapter-browser-20261106.config';
const viewport={width:1440,height:1200};
export default defineConfig({...base,use:{...base.use,viewport},projects:base.projects!.map(project=>({...project,use:{...project.use,viewport}})),testMatch:'**/retained-repair-real.spec.ts',outputDir:'./retained-repair-browser-20261107',reporter:[['list'],['json',{outputFile:'retained-repair-browser-20261107.json'}]],webServer:{...base.webServer,command:'node artifacts/build-retained-repair-20261107.mjs && pnpm exec vite --config artifacts/retained-repair-vite-20261107.config.ts',url:'http://127.0.0.1:4195/artifacts/retained-repair-fixture-20261107.html'}});
