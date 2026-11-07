import {defineConfig} from '@playwright/test';
import base from './retained-adapter-browser-20261106.config';
const viewport={width:1440,height:1400};
export default defineConfig({...base,use:{...base.use,viewport},projects:base.projects!.map(project=>({...project,use:{...project.use,viewport}})),testMatch:'**/cross-format-real.spec.ts',outputDir:'./cross-format-browser-20261107',reporter:[['list'],['json',{outputFile:'cross-format-browser-20261107.json'}]],webServer:{...base.webServer,command:'node artifacts/build-cross-format-20261107.mjs && node artifacts/cross-format-server-20261107.mjs',url:'http://127.0.0.1:4195/artifacts/cross-format-fixture-20261107.html'}});
