import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, firefox, webkit } from '@playwright/test';
import { build, preview } from 'vite';

const out = resolve(process.argv[2]);
await mkdir(out);
await build({ configFile: false, resolve: { alias: { 'fountainjs-editor': 'fountain-path-fix' } }, logLevel: 'warn' });
const server = await preview({ configFile: false, preview: { host: '127.0.0.1', port: 43189, strictPort: true } });
const report = [];
try {
  for (const [name, launcher] of Object.entries({ chromium, firefox, webkit })) {
    const browser = await launcher.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      await page.goto('http://127.0.0.1:43189/?engine=fountain&size=100');
      const editor = page.locator('[contenteditable=true]');
      const blocks = editor.locator(':scope > p');
      await blocks.last().click();
      await page.keyboard.press('End');
      await page.keyboard.type(' saved');
      assert.equal(await blocks.last().textContent(), 'Paragraph 99 saved');
      await page.evaluate(() => { window.retainedMiddle = document.querySelector('[contenteditable=true] > p:nth-child(51)'); });
      await blocks.first().click();
      await page.keyboard.press('Home');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.probe.texts().length === 101);
      const middlePath = () => page.evaluate(() => [
        window.retainedMiddle.isConnected,
        window.retainedMiddle.getAttribute('data-fountain-path'),
        window.retainedMiddle.querySelector('[data-fountain-text-path]')?.getAttribute('data-fountain-text-path')
      ]);
      assert.deepEqual(await middlePath(), [true,'51','51.0']);
      await blocks.nth(51).click();
      await page.keyboard.press('End');
      await page.keyboard.press('Shift+Home');
      assert.equal(await page.evaluate(() => document.getSelection().toString()), 'Paragraph 50');
      await page.keyboard.type('Middle');
      assert.equal(await blocks.nth(51).textContent(),'Middle');
      await blocks.nth(1).click();
      await page.keyboard.press('Home');
      await page.keyboard.press('Backspace');
      await page.waitForFunction(() => window.probe.texts().length === 100);
      const original = Array.from({length: 100}, (_,n) => 'Paragraph ' + n);
      original[50] = 'Middle'; original[99] += ' saved';
      assert.deepEqual(await page.evaluate(() => window.probe.texts()), original);
      await blocks.nth(50).click();
      await page.screenshot({ path: resolve(out, name + '.png'), caret: 'initial' });
      assert.deepEqual(errors, []);
      report.push({ engine: name, version: browser.version(), count: original.length, errors });
      console.log(name, browser.version(), 'passed');
    } finally { await browser.close(); }
  }
} finally {
  await writeFile(resolve(out, 'report.json'),JSON.stringify(report,null,2));
  await server.close();
}
