import {defineConfig} from '@playwright/test';
import base from './retained-projection-browser-20261106.config';
export default defineConfig({...base,grep:/continues native typing and Enter after an observer update/,outputDir:'./retained-projection-followup-20261106',reporter:[['list'],['json',{outputFile:'retained-projection-followup-20261106.json'}]]});
