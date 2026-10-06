import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { firefox, expect } from '@playwright/test';

// Read-only audit subject: uses an already-running local demo without rebuilding
// or changing its source. No clipboard actions: do not contaminate another audit.
// This diagnostic does not replace the complete browser test's clipboard path.
const origin = new URL(process.argv[2]);
assert.equal(origin.protocol, 'http:');
assert.ok(['127.0.0.1', 'localhost'].includes(origin.hostname), 'Use an owned loopback demo server.');
const output = path.resolve(process.argv[3]);
await mkdir(output, { recursive: true });
const browser = await firefox.launch();
const report = [];
try {
  for (let iteration = 1; iteration <= 3; iteration++) {
    const directory = path.join(output, `firefox-${iteration}`);
    await mkdir(directory, { recursive: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: directory } });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const errors = [];
    const events = [];
    for (const event of ['frameattached', 'framenavigated', 'framedetached']) {
      page.on(event, frame => events.push({ event, name: frame.name(), url: frame.url() }));
    }
    page.on('pageerror', error => errors.push(error.message));
    let failure;
    try {
      await page.goto(new URL('/demos/node-markdown.html', origin).href);
      const workshop = page.getByRole('region', { name: 'HTML comment authoring workshop' });
      const editor = workshop.getByRole('textbox', { name: 'HTML comment authoring editor', exact: true });
      const save = workshop.getByRole('button', { name: 'Save comment Markdown and preview' });
      const undo = workshop.getByRole('button', { name: 'Undo comment edit', exact: true });
      const saved = workshop.getByLabel('Saved comment Markdown');
      const reader = workshop.frameLocator('iframe[title="HTML comment reader snapshot"]');
      await save.click();
      const original = await saved.inputValue();
      await expect(reader.locator('body')).toContainText('Review the rollout.');
      await workshop.locator('iframe').scrollIntoViewIfNeeded();
      await reader.locator('body').screenshot({ path: path.join(directory, 'reader-original.png') });
      await editor.locator('p').last().click();
      await page.keyboard.press('End');
      await page.keyboard.type(' Reviewed.');
      await workshop.getByLabel('HTML comment data', { exact: true }).fill(' provenance: reviewed by Ada ');
      await workshop.getByRole('button', { name: 'Apply comment data' }).click();
      await save.click();
      await expect(saved).toContainText('Reviewed.');
      await expect(reader.locator('body')).toContainText('Reviewed.');
      const comments = await reader.locator('body').evaluate(body => {
        const walker = body.ownerDocument.createTreeWalker(body, 128);
        const values = []; while (walker.nextNode()) values.push(walker.currentNode.textContent); return values;
      });
      assert.deepEqual(comments, [' provenance: reviewed by Ada ']);
      await expect(reader.locator('[data-fountain-html-comment],script')).toHaveCount(0);
      await workshop.locator('iframe').scrollIntoViewIfNeeded();
      await reader.locator('body').screenshot({ path: path.join(directory, 'reader-edited.png') });
      await workshop.getByLabel('HTML comment data', { exact: true }).fill('break --> <script>bad()</script>');
      await workshop.getByRole('button', { name: 'Apply comment data' }).click();
      await expect(workshop.getByRole('status')).toContainText('No change:');
      await undo.click();
      await undo.click();
      await save.click();
      await expect(saved).toHaveValue(original);
      await workshop.getByRole('button', { name: 'Remove HTML comment', exact: true }).click();
      await expect(editor.locator('[data-fountain-html-comment]')).toHaveCount(0);
      await undo.click();
      await save.click();
      await expect(saved).toHaveValue(original);
      await page.setViewportSize({ width: 390, height: 844 });
      await workshop.getByLabel('HTML comment data', { exact: true }).scrollIntoViewIfNeeded();
      await expect(workshop.getByRole('button', { name: 'Apply comment data' })).toBeVisible();
      await workshop.screenshot({ path: path.join(directory, 'author-mobile.png') });
      await workshop.locator('iframe').scrollIntoViewIfNeeded();
      await reader.locator('body').screenshot({ path: path.join(directory, 'reader-mobile.png') });
      assert.deepEqual(errors, []);
    } catch (error) {
      failure = String(error.stack ?? error);
      await page.screenshot({ path: path.join(directory, 'failure.png') }).catch(() => {});
    } finally {
      const frames = page.frames().map(frame => ({ name: frame.name(), url: frame.url(), detached: frame.isDetached() }));
      await context.tracing.stop({ path: path.join(directory, 'trace.zip') });
      await context.close();
      const result = { iteration, platform: process.platform, passed: !failure, failure, errors, events, frames };
      report.push(result);
      console.log(JSON.stringify(result));
      await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    }
  }
} finally { await browser.close(); }
if (report.some(result => !result.passed)) process.exitCode = 1;
