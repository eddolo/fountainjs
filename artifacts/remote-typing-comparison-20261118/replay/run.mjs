import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { build, preview } from 'vite';

const out = resolve(process.argv[2]);
await mkdir(out);
const sizes = process.argv.slice(3).map(Number);
assert.ok(sizes.length && sizes.every(n => Number.isSafeInteger(n) && n >= 2));
const variant = process.env.FOUNTAIN_REPLAY_PACKAGE ?? 'fountain-remote-candidate';
const config = { configFile: false, logLevel: 'error', resolve: { alias: {
  'fountainjs-editor': variant,
} } };
await build({ ...config, build: { target: 'esnext' } });
let seed;
const capture = { name: 'capture-seed', configurePreviewServer(server) {
  server.middlewares.use('/capture/seed', async (req, res) => {
    if (req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      seed = Buffer.concat(chunks);
      res.writeHead(204).end();
    } else if (req.method === 'GET' && seed) {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' }).end(seed);
    } else res.writeHead(404).end();
  });
} };
const server = await preview({ ...config, plugins: [capture], preview: { host: '127.0.0.1', port: 43195, strictPort: true } });
const browser = await chromium.launch({ headless: true });
const errors = [], cases = [];
const word = 'abcdefghijklmnopqrstuvwx';
const hash = value => createHash('sha256').update(value).digest('hex');
async function open(engine, size, index, mode) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('http://127.0.0.1:43195/?' + new URLSearchParams({ engine, size, index, mode }));
  await page.waitForFunction(() => !!window.study);
  return { context, page };
}
try {
  for (const size of sizes) for (const index of [0, size - 1]) for (const engine of ['fountain', 'tiptap']) {
    seed = undefined;
    const key = engine + '-' + size + '-' + index;
    let captured;
    if (process.env.FOUNTAIN_REPLAY_INPUT) {
      const source = resolve(process.env.FOUNTAIN_REPLAY_INPUT);
      seed = await readFile(resolve(source, key+'.bin'));
      captured = JSON.parse(await readFile(resolve(source, key+'.json'), 'utf8'));
    } else {
      const writer = await open(engine, size, index, 'write');
      const target = writer.page.locator('[contenteditable=true] > p').nth(index);
      await target.click();
      await writer.page.keyboard.press('End');
      await writer.page.evaluate(() => window.study.start());
      for (const letter of word) await writer.page.keyboard.press(letter);
      captured = await writer.page.evaluate(() => window.study.finish());
      assert.equal(captured.updates.length, word.length);
      assert.equal(captured.json.content.length, size);
      for (const [i, paragraph] of captured.json.content.entries()) {
        assert.equal(paragraph.content.map(n => n.text).join(''), 'Paragraph ' + i + (i === index ? word : ''));
      }
      await writer.context.close();
      await mkdir(resolve(out,'captures'), { recursive:true });
      await writeFile(resolve(out,'captures',key+'.bin'),seed);
      await writeFile(resolve(out,'captures',key+'.json'),JSON.stringify(captured));
    }
    const group = { engine, size, index, seedHash: hash(seed), wireHash: hash(JSON.stringify(captured.updates)),
      jsonHash: hash(JSON.stringify(captured.json)), wireBytes: captured.updates.map(a=>a.length), trials: [] };
    cases.push(group);
    const modes = engine === 'fountain' ? ['raw', 'model', 'mounted'] : ['raw', 'mounted'];
    for (const mode of [...modes, ...modes.slice().reverse()]) {
      const { page, context } = await open(engine, size, index, mode);
      try {
        const result = await page.evaluate(([updates, word]) => window.study.apply(updates, word), [captured.updates, word]);
        assert.deepEqual(result.json, captured.json);
        assert.deepEqual(result.vector, captured.vector);
        assert.equal(result.visibility, 'visible');
        if (engine === 'fountain' && mode === 'mounted') {
          assert.ok(result.samples.every(s => s.notifications > 0 && s.viewSubscriberMs <= s.applyMs + 0.01));
        }
        group.trials.push({ mode, seedApplyMs:result.seedApplyMs, openMs:result.openMs, samples: result.samples });
        if (mode === 'mounted' && group.trials.filter(t=>t.mode==='mounted').length === 1) {
          await page.locator('[contenteditable=true] > p').nth(index).scrollIntoViewIfNeeded();
          await page.screenshot({ path: resolve(out, key+'.png'), caret:'initial' });
        }
      } finally { await context.close(); }
    }
    console.log(key, 'verified', group.trials.length, 'fresh consumers');
  }
  assert.deepEqual(errors, []);
} finally {
  await writeFile(resolve(out, 'report.json'), JSON.stringify({ variant, date:new Date().toISOString(),
    browser:browser.version(), warmupPerTrial:3, word, cases, errors }, null, 2));
  await browser.close();
  await server.close();
}
