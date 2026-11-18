import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { build, preview } from 'vite';

const out = resolve(process.argv[2]);
await mkdir(out);
const variant = process.argv[3] || 'release';
assert.ok(['release', 'repair'].includes(variant));
const alias = variant === 'repair' ? { 'fountainjs-editor': 'fountain-path-fix' } : {};
await build({ configFile: false, resolve: { alias }, build: { minify: false, sourcemap: true }, logLevel: 'warn' });
const server = await preview({ configFile: false, preview: { host: '127.0.0.1', port: 43189, strictPort: true } });
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const engine of ['fountain', 'tiptap']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      const page = await ctx.newPage();
      await page.goto('http://127.0.0.1:43189/?engine=' + engine + '&size=5000');
      const last = page.locator('[contenteditable=true] > p').last();
      await last.click();
      await page.keyboard.press('End');
      const session = await ctx.newCDPSession(page);
      await session.send('Profiler.enable');
      await session.send('Profiler.setSamplingInterval', { interval: 500 });
      await session.send('Profiler.start');
      const text = 'abcdefghijklmnopqrstuvwxyz'.repeat(3);
      await page.keyboard.type(text);
      await page.waitForFunction(n => Number.isFinite(window.probe.timings[n - 1]?.frameTask), text.length);
      const { profile } = await session.send('Profiler.stop');
      await writeFile(resolve(out, engine + '.cpuprofile'), JSON.stringify(profile));
      const expected = Array.from({ length: 5000 }, (_, n) => 'Paragraph ' + n);
      expected[4999] += text;
      assert.deepEqual(await page.evaluate(() => window.probe.texts()), expected);
      assert.equal(await last.textContent(), expected[4999]);
      const top = profile.nodes.filter(n => n.hitCount).sort((a,b) => b.hitCount-a.hitCount).slice(0,25);
      console.log(engine, top.map(n => [n.callFrame.functionName, n.callFrame.lineNumber + 1, n.hitCount]));
    } finally { await ctx.close(); }
  }
} finally {
  await browser?.close();
  await server.close();
}
