import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, firefox, webkit } from '@playwright/test';

// Automated evidence, not WCAG/screen-reader certification. Use an explicitly
// supplied, version-pinned local axe-core bundle; never ship it in Fountain.
// The caller owns the local server. This script does not rebuild or restart it.
const origin = new URL(process.argv[2]);
assert.equal(origin.protocol, 'http:');
assert.ok(['127.0.0.1', 'localhost'].includes(origin.hostname));
const output = path.resolve(process.argv[3]);
const axeSource = await readFile(path.resolve(process.argv[4]), 'utf8');
const requestedEngines = (process.argv[5] ?? 'chromium,firefox,webkit').split(',');
const engines = { chromium, firefox, webkit };
for (const engine of requestedEngines) assert.ok(Object.hasOwn(engines, engine), `Unknown browser ${engine}`);
const routes = ['/demos/go-docs-service.html', '/demos/plain-dom-notes.html', '/demos/node-markdown.html',
  '/conversion-lab.html', '/issue-editor.html', '/task-workflow.html'];
const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
await mkdir(output, { recursive: true });
const summary = [];
for (const engine of requestedEngines) {
  const browser = await engines[engine].launch();
  try {
    for (const route of routes) for (const width of [1280, 390]) {
      const name = `${engine}-${path.basename(route, '.html')}-${width}`;
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 720 } });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => {
        const request = response.request();
        if (response.status() >= 400 && new URL(response.url()).origin === origin.origin
          && ['document', 'script', 'stylesheet'].includes(request.resourceType())) {
          errors.push(`${response.status()} ${request.resourceType()} ${response.url()}`);
        }
      });
      let result;
      let failure;
      try {
        await page.goto(new URL(route, origin).href, { waitUntil: 'domcontentloaded' });
        await page.getByRole('heading', { level: 1 }).first().waitFor();
        if (route === '/conversion-lab.html') {
          await page.getByLabel('Choose documents', { exact: true }).setInputFiles({
            name: 'accessibility-audit.md', mimeType: 'text/markdown',
            buffer: Buffer.from('# Accessibility audit\n\nA **structured** document.\n\n- First item\n- Second item\n'),
          });
        }
        // Assert real editor readiness, not only a static page shell.
        await page.locator('[contenteditable="true"]').first().waitFor();
        // WebKit can expose a just-mounted stylesheet halfway through a CSS
        // colour transition. Await observed finite animations, not a fixed
        // sleep or disabled motion. Infinite decorative animations stay live.
        const settledAnimations = await page.evaluate(async () => {
          const deadline = performance.now() + 10000;
          let completed = 0;
          for (;;) {
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const finite = document.getAnimations().filter(animation =>
              animation.playState === 'running' && Number.isFinite(animation.effect?.getComputedTiming().endTime)
              // Firefox retains pending transitions inside closed details.
              // They can have rects but are not painted and cannot finish.
              && animation.effect?.target?.checkVisibility());
            if (!finite.length) return completed;
            if (performance.now() > deadline) throw new Error('Finite page animations did not settle');
            await Promise.race([
              Promise.all(finite.map(animation => animation.finished.catch(() => {}))),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Finite page animations timed out')), deadline - performance.now())),
            ]);
            completed += finite.length;
          }
        });
        await page.addScriptTag({ content: axeSource });
        result = await page.evaluate(tags => globalThis.axe.run(document, {
          runOnly: { type: 'tag', values: tags }, iframes: false,
        }), tags);
        await writeFile(path.join(output, `${name}.json`), JSON.stringify({
          ...result, readiness: { settledFiniteAnimations: settledAnimations }, coverage: { scope: route === '/conversion-lab.html' ? 'main document after Markdown import' : 'initial main document', nestedReaderFrames: 'not scanned',
            authorDialogsMenusAndReaderStates: 'not exercised by this initial scan',
            manualKeyboardAndScreenReaderCertification: false }, errors,
        }, null, 2));
        await writeFile(path.join(output, `${name}.aria.txt`), await page.locator('body').ariaSnapshot());
        await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
      } catch (error) {
        failure = String(error.stack ?? error);
        await page.screenshot({ path: path.join(output, `${name}-failure.png`) }).catch(() => {});
      } finally {
        await context.close();
        const item = { engine, route, width, version: result?.testEngine.version, tags,
          violations: result?.violations.map(rule => ({ id: rule.id, impact: rule.impact, nodes: rule.nodes.length })),
          incomplete: result?.incomplete.map(rule => ({ id: rule.id, nodes: rule.nodes.length })),
          errors, failure, passed: !failure && !errors.length && result?.violations.length === 0 };
        summary.push(item);
        console.log(JSON.stringify(item));
        await writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2));
      }
    }
  } finally { await browser.close(); }
}
if (summary.some(item => !item.passed)) process.exitCode = 1;
