import {defineConfig} from '@playwright/test';
import base from './cursor-navigation-browser-20261106.config';
export default defineConfig({...base,outputDir:'./cursor-label-final-20261106',reporter:[['list'],['json',{outputFile:'cursor-label-final-20261106.json'}]]});
