import {defineConfig} from '@playwright/test';
import base from './retained-text-seed-browser-20261106.config';
export default defineConfig({...base,grep:/thousand-paragraph/,outputDir:'./retained-text-seed-keyboard-20261106',reporter:[['list'],['json',{outputFile:'retained-text-seed-keyboard-20261106.json'}]]});
