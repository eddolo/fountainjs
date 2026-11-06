import {defineConfig} from '@playwright/test';
import base from './cursor-navigation-browser-20261106.config';
export default defineConfig({...base,outputDir:'./retained-portable-bounds-browser-20261106',reporter:[['list'],['json',{outputFile:'retained-portable-bounds-browser-20261106.json'}]]});
