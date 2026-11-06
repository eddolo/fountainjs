import {defineConfig} from '@playwright/test';
import base from './retained-adapter-browser-20261106.config';
const viewport={width:1440,height:1400};
export default defineConfig({...base,use:{...base.use,viewport},projects:base.projects!.map(project=>({...project,use:{...project.use,viewport}})),testMatch:'**/retained-handoff-real.spec.ts',outputDir:'./retained-handoff-browser-20261106',reporter:[['list'],['json',{outputFile:'retained-handoff-browser-20261106.json'}]],webServer:{...base.webServer,command:'node artifacts/build-retained-handoff-20261106.mjs && node artifacts/retained-handoff-server-20261106.mjs',url:'http://127.0.0.1:4195/artifacts/retained-handoff-fixture-20261106.html'}});
