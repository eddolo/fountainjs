import {defineConfig} from '@playwright/test';
import base from './retained-adapter-browser-20261106.config';
const viewport={width:1440,height:1400};
export default defineConfig({...base,use:{...base.use,viewport},projects:base.projects!.map(project=>({...project,use:{...project.use,viewport}})),testMatch:'**/retained-migration-real.spec.ts',outputDir:'./retained-migration-browser-20261106',reporter:[['list'],['json',{outputFile:'retained-migration-browser-20261106.json'}]],webServer:{...base.webServer,command:'node artifacts/build-retained-migration-20261106.mjs && pnpm exec vite --config artifacts/retained-adapter-vite-20261106.config.ts',url:'http://127.0.0.1:4195/artifacts/retained-migration-fixture-compiled-20261106.html'}});
