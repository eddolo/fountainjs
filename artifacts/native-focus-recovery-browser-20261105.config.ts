import { defineConfig } from '@playwright/test';
import base from './native-focus-browser-20261105.config';
import { readFileSync } from 'node:fs';

const previous = JSON.parse(readFileSync(new URL('./native-focus-ci-failures-20261105.json', import.meta.url), 'utf8')) as { failures: { title: string }[] };
const titles = [...new Set(previous.failures.map(item => item.title))];
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export default defineConfig({ ...base, grep: new RegExp(`(?:${titles.map(escape).join('|')})$`),
  outputDir: './native-focus-recovery-browser-20261105' });
