import {defineConfig} from '@playwright/test';
import base from './retained-adapter-browser-20261106.config';
const viewport={width:1440,height:1200};
export default defineConfig({...base,testMatch:'**/yjs-admission-real.spec.ts',use:{...base.use,viewport},projects:base.projects!.map(project=>({...project,use:{...project.use,viewport}})),outputDir:'./yjs-admission-browser-20261107',reporter:[['list'],['json',{outputFile:'yjs-admission-browser-20261107.json'}]],webServer:{...base.webServer,command:'node artifacts/build-yjs-admission-20261107.mjs && node artifacts/yjs-admission-server-20261107.mjs',url:'http://127.0.0.1:4195/artifacts/yjs-admission-fixture-20261107.html'}});
