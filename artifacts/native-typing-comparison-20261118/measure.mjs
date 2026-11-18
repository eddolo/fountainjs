import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { arch, cpus, platform, release } from 'node:os';
import { chromium } from '@playwright/test';
import { build, preview } from 'vite';

const out = resolve(process.argv[2] || 'results');
await mkdir(out, { recursive: false });
const variant = process.argv[3] || 'release';
assert.ok(['release', 'repair'].includes(variant));
const alias = variant === 'repair' ? { 'fountainjs-editor': 'fountain-path-fix' } : {};
await build({ configFile: false, resolve: { alias }, logLevel: 'warn' });
const server = await preview({ configFile: false, preview: { host: '127.0.0.1', port: 43189, strictPort: true } });
let browser;
const results = [];
const chars = 'abcdefghijk';
const errors = [];
try {
  browser = await chromium.launch({ headless: true });
  for (const size of [100, 1000, 5000]) {
    for (const [index, engine] of ['fountain','tiptap','tiptap','fountain'].entries()) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      try {
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(String(error)));
        await page.goto('http://127.0.0.1:43189/?engine=' + engine + '&size=' + size);
        const editable = page.locator('[contenteditable=true]');
        const last = editable.locator(':scope > p').last();
        const before = Array.from({ length: size }, (_, n) => 'Paragraph ' + n);
        assert.deepEqual(await page.evaluate(() => window.probe.texts()), before);
        await last.click();
        await page.keyboard.press('End');
        for (const [n, key] of Array.from(chars).entries()) {
          await page.keyboard.press(key);
          await page.waitForFunction(i => Number.isFinite(window.probe.timings[i]?.frameTask), n);
          assert.equal(await last.textContent(), before.at(-1) + chars.slice(0, n + 1));
        }
        const expected = before.slice();
        expected[size - 1] += chars;
        assert.deepEqual(await page.evaluate(() => window.probe.texts()), expected);
        await page.screenshot({ path: resolve(out, engine + '-' + size + '-' + index + '.png'), caret: 'initial' });
        // Event Timing entries can be delivered asynchronously after presentation.
        await page.waitForTimeout(1100);
        const { timings, events } = await page.evaluate(() => ({
          timings: window.probe.timings, events: window.probe.events
        }));
        assert.equal(timings.map(item => item.key).join(''), chars);
        const samples = timings.map(t => {
          const matches = events.filter(e => Math.abs(e.start - t.start) < 0.51);
          assert.ok(matches.length <= 1);
          return { ...t, nextFrameTaskMs: t.frameTask - t.start, eventTiming: matches[0] ?? null };
        });
        results.push({ size, index, engine, samples });
        console.log(engine, size, index, 'browser-reported keydowns', samples.filter(s => s.eventTiming).length, '/', samples.length);
      } finally { await context.close(); }
    }
  }
  assert.deepEqual(errors, []);
} finally {
  const evidence = { variant, date: new Date().toISOString(), chromium: browser?.version(), host: [platform(), release(), arch(), cpus()[0]?.model],
    mode: 'Single foreground headless page, local starter kits, independent native keypresses without Yjs',
    eventTimingThresholdMs: 16, results, errors };
  await writeFile(resolve(out, 'report.json'), JSON.stringify(evidence, null, 2));
  await browser?.close();
  await server.close();
}
