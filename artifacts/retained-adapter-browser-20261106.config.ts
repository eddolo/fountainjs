import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import base from '../playwright.config';
export default defineConfig({...base,testDir:'../tests/manual',testMatch:'**/retained-adapter-real.spec.ts',workers:1,retries:0,timeout:120000,outputDir:'./retained-adapter-browser-final-20261106',reporter:[['list'],['json',{outputFile:'retained-adapter-browser-final-20261106.json'}]],
use:{baseURL:'http://127.0.0.1:4195',headless:true,video:'on',trace:'on',screenshot:'only-on-failure',viewport:{width:1440,height:1000}},
projects:[{name:'chromium',use:{...devices['Desktop Chrome']}},{name:'firefox',use:{...devices['Desktop Firefox']}},{name:'webkit',use:{...devices['Desktop Safari']}}],
webServer:{cwd:fileURLToPath(new URL('../',import.meta.url)),command:'pnpm exec vite --config artifacts/retained-adapter-vite-20261106.config.ts',url:'http://127.0.0.1:4195/artifacts/retained-adapter-fixture-20261106.html',reuseExistingServer:false,timeout:120000}});
