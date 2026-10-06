import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, firefox, webkit, expect } from '@playwright/test';

// Real public controls and saved readers, not a substitute for assistive
// technology testing. Use a pinned local oracle; never add it to runtime.
const origin = new URL(process.argv[2]);
assert.equal(origin.protocol, 'http:');
assert.ok(['127.0.0.1', 'localhost'].includes(origin.hostname));
const output = path.resolve(process.argv[3]);
const axeSource = await readFile(path.resolve(process.argv[4]), 'utf8');
const engines = { chromium, firefox, webkit };
const requested = (process.argv[5] ?? 'chromium,firefox,webkit').split(',');
for (const engine of requested) assert.ok(Object.hasOwn(engines, engine));
const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const panels = [
  ['link', 'link', 'Link URL'], ['search', 'search', 'Find text'],
  ['highlight', 'highlight', 'Highlight colour'], ['text-style', 'text-style', 'Font family'],
  ['image', 'image', 'Image placement'], ['insert-table', 'insert-table', 'Table rows'],
  ['media', 'media', 'Media type'], ['code-block', 'code', 'Code language'], ['table-menu', 'table-tools', null],
];
const scenarios = panels.map(([action, panel, firstLabel]) => ({
  name: `panel-${panel}`, route: '/demos/react-article.html',
  async open(page, failures) {
    const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
    await editor.locator('[data-fountain-node="paragraph"]').first().click();
    await page.keyboard.press('Home'); await page.keyboard.press('Shift+End');
    if (action === 'code-block') {
      await page.locator('button[data-fountain-toolbar-action="code-block"]').click();
      await page.locator('form.is-code').getByRole('button', { name: 'Cancel', exact: true }).click();
      await editor.locator('pre').first().click();
    } else if (action === 'table-menu') {
      await page.locator('button[data-fountain-toolbar-action="insert-table"]').click();
      const insert = page.locator('form.is-table');
      await insert.getByLabel('Table rows', { exact: true }).fill('2');
      await insert.getByLabel('Table columns', { exact: true }).fill('2');
      await insert.getByRole('button', { name: 'Insert', exact: true }).click();
      await editor.locator('td,th').first().click();
    }
    const before = await editor.textContent();
    const json = page.locator('.demo-output pre');
    await expect(json).toContainText('"type": "doc"');
    if (action === 'code-block') await expect(json).toContainText('"type": "code_block"');
    if (action === 'table-menu') await expect(json).toContainText('"type": "table"');
    const documentBefore = JSON.parse(await json.textContent());
    const trigger = page.locator(`button[data-fountain-toolbar-action="${action}"]`);
    await trigger.focus(); await trigger.press('Enter');
    const form = page.locator(`form.is-${panel === 'insert-table' ? 'table' : panel}`);
    await form.waitFor();
    if (await trigger.getAttribute('aria-expanded') !== 'true') failures.push('Trigger does not announce expanded state');
    const id = await form.getAttribute('id');
    if (!id || await trigger.getAttribute('aria-controls') !== id) failures.push('Trigger has no matching panel ownership');
    if (!await form.getAttribute('aria-label') && !await form.getAttribute('aria-labelledby')) failures.push('Open form has no accessible name');
    const firstControl = firstLabel ? form.getByLabel(firstLabel, { exact: true }) : form.getByRole('button', { name: 'Select row', exact: true });
    if (!await firstControl.evaluate(element => element === document.activeElement)) failures.push('Keyboard opening does not focus the first control');
    assert.equal(await editor.textContent(), before, 'Opening a configuration panel must not edit the document');
    assert.deepEqual(JSON.parse(await json.textContent()), documentBefore, 'Opening must preserve the complete document');
    return { surface: page, capture: form, async close() {
      if (!await firstControl.evaluate(element => element === document.activeElement)) failures.push('The active panel control lost focus during rendering or capture');
      await page.keyboard.press('Escape');
      if (await form.count()) failures.push('Escape does not close the configuration panel');
      if (!await trigger.evaluate(element => element === document.activeElement)) failures.push('Escape does not return focus to the trigger');
      assert.equal(await editor.textContent(), before, 'Cancelling a panel must not edit document text');
      assert.deepEqual(JSON.parse(await json.textContent()), documentBefore, 'Cancellation must preserve the complete document');
    } };
  },
}));
for (const [name, route, readerName] of [
  ['issue-reader', '/issue-editor.html', 'Issue preview'],
  ['task-reader', '/task-workflow.html', 'Task description preview'],
]) scenarios.push({ name, route, async open(page) {
  await page.getByRole('button', { name: 'Reader preview', exact: true }).click();
  const reader = page.getByRole('textbox', { name: readerName, exact: true });
  await reader.waitFor();
  assert.equal(await reader.getAttribute('contenteditable'), 'false');
  return { surface: page, capture: reader };
} });
scenarios.push({ name: 'comment-saved-reader', route: '/demos/node-markdown.html', async open(page) {
  const workshop = page.getByRole('region', { name: 'HTML comment authoring workshop' });
  await workshop.getByRole('button', { name: 'Save comment Markdown and preview', exact: true }).click();
  const iframe = workshop.locator('iframe[title="HTML comment reader snapshot"]');
  await iframe.scrollIntoViewIfNeeded();
  const frame = iframe.contentFrame();
  // Locator.contentFrame returns a FrameLocator; evaluation requires the owned
  // actual Frame after its saved document is ready.
  await expect(frame.locator('body')).toContainText('Review the rollout.');
  const owner = await iframe.elementHandle();
  const surface = await owner.contentFrame();
  assert.ok(surface);
  assert.equal(await iframe.getAttribute('sandbox'), '');
  await expect(surface.locator('script')).toHaveCount(0);
  return { surface, capture: surface.locator('body'), sandbox: 'unchanged empty sandbox; DOM/ARIA inspection only, no document script execution' };
} });

await mkdir(output, { recursive: true });
const selectedNames = process.argv[6]?.split(',');
if (selectedNames) for (const name of selectedNames) assert.ok(scenarios.some(scenario => scenario.name === name), `Unknown scenario ${name}`);
const selectedScenarios = selectedNames ? scenarios.filter(scenario => selectedNames.includes(scenario.name)) : scenarios;
const summary = [];
for (const engine of requested) {
  const browser = await engines[engine].launch();
  try {
    for (const scenario of selectedScenarios) for (const width of [1280, 390]) {
      const name = `${engine}-${scenario.name}-${width}`;
      const directory = path.join(output, name); await mkdir(directory, { recursive: true });
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 720 }, recordVideo: { dir: directory } });
      await context.tracing.start({ screenshots: true, snapshots: true });
      const page = await context.newPage(); page.setDefaultTimeout(10000);
      const errors = []; const behaviorFailures = []; let result; let failure;
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => {
        if (response.status() >= 400 && new URL(response.url()).origin === origin.origin
          && ['document', 'script', 'stylesheet'].includes(response.request().resourceType())) errors.push(`${response.status()} ${response.url()}`);
      });
      try {
        await page.goto(new URL(scenario.route, origin).href, { waitUntil: 'domcontentloaded' });
        await page.locator('[contenteditable="true"]').first().waitFor();
        const { surface, capture, close, sandbox } = await scenario.open(page, behaviorFailures);
        if (!sandbox) await surface.evaluate(async () => {
          const deadline = performance.now() + 10000;
          for (;;) {
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const finite = document.getAnimations().filter(animation => animation.playState === 'running'
              && Number.isFinite(animation.effect?.getComputedTiming().endTime) && animation.effect?.target?.checkVisibility());
            if (!finite.length) return;
            if (performance.now() > deadline) throw new Error('Painted transitions did not settle');
            await Promise.race([Promise.all(finite.map(animation => animation.finished.catch(() => {}))),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Painted transitions timed out')), deadline - performance.now()))]);
          }
        });
        if (sandbox) {
          // Empty sandbox prohibits script callbacks. Do not weaken it to run
          // axe or mistake a driver Promise failure for a product failure.
          const metadata = await surface.evaluate(() => ({ lang: document.documentElement.lang,
            title: document.title, main: document.querySelectorAll('main,[role="main"]').length }));
          if (!metadata.lang) behaviorFailures.push('Saved reader has no document language');
          if (!metadata.title.trim()) behaviorFailures.push('Saved reader has no document title');
          if (metadata.main !== 1) behaviorFailures.push('Saved reader has no unique main landmark');
          result = { testEngine: { version: 'DOM metadata inspection only' }, violations: [],
            incomplete: [{ id: 'sandboxed-axe-coverage-unavailable', nodes: [metadata] }] };
        } else {
          await surface.evaluate(axeSource);
          result = await surface.evaluate(tags => globalThis.axe.run(document, {
            runOnly: { type: 'tag', values: tags }, iframes: false,
          }), tags);
        }
        await writeFile(path.join(directory, 'rules.json'), JSON.stringify({ ...result,
          coverage: { scenario: scenario.name, route: scenario.route, nestedFrames: 'only explicitly selected saved reader', sandbox,
            screenReaderCertification: false }, errors }, null, 2));
        await writeFile(path.join(directory, 'surface.aria.txt'), await surface.locator('body').ariaSnapshot());
        if (scenario.name.startsWith('panel-')) {
          const overflow = await capture.evaluate(form => {
            const bounds = form.getBoundingClientRect();
            return [...form.querySelectorAll('input, select, textarea, button')]
              .filter(element => element.checkVisibility())
              .filter(element => {
                const box = element.getBoundingClientRect();
                return box.left < Math.max(0, bounds.left) - 1
                  || box.right > Math.min(innerWidth, bounds.right) + 1;
              }).map(element => element.getAttribute('aria-label') ?? element.textContent);
          });
          if (overflow.length) behaviorFailures.push(`Controls extend outside the configuration form: ${JSON.stringify(overflow)}`);
        }
        await capture.screenshot({ path: path.join(directory, 'active-surface.png') });
        await close?.();
      } catch (error) {
        failure = String(error.stack ?? error);
        await page.screenshot({ path: path.join(directory, 'failure.png') }).catch(() => {});
      } finally {
        await context.tracing.stop({ path: path.join(directory, 'trace.zip') }); await context.close();
        const item = { engine, scenario: scenario.name, width, version: result?.testEngine.version,
          violations: result?.violations.map(rule => ({ id: rule.id, nodes: rule.nodes.length })),
          incomplete: result?.incomplete.map(rule => ({ id: rule.id, nodes: rule.nodes.length })),
          errors, behaviorFailures, failure, passed: !failure && !errors.length && !behaviorFailures.length && result?.violations.length === 0 };
        summary.push(item); console.log(JSON.stringify(item));
        await writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2));
      }
    }
  } finally { await browser.close(); }
}
if (summary.some(item => !item.passed)) process.exitCode = 1;
