import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MarkdownImporter, Schema, StarterKit } from 'fountainjs-editor';
import { issueMarkdownOptions } from '../../examples/react-app/src/issue-markdown-policy';

type Probe = { exports: { durationMs: number }[]; inputs: { data: string | null; toTwoFramesMs: number }[] };
declare global { interface Window { __issueInputProbe: Probe } }

export async function measureIssueInput(page: Page, info: TestInfo) {
  const root = info.outputPath('issue-input-journey');
  await mkdir(root, { recursive: true });
  const source = ['[ref]: /target "Original"', '', '# Large issue ###', '', 'Edit this paragraph.', '',
    ...Array.from({ length: 4999 }, (_, index) => `Paragraph ${index + 1} with __source__ [link][ref].\r\n`), ''].join('\r\n');
  await writeFile(resolve(root, 'original.md'), source);
  const moduleURLs: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (/(?:\/deps\/fountainjs-editor|\/dist\/index)\.js(?:\?|$)/u.test(response.url()) && !response.url().includes('/node_modules/.pnpm/')) moduleURLs.push(response.url()); });
  await page.goto('/issue-editor.html');
  const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
  await expect(editor).toBeVisible();
  expect(moduleURLs.length, 'Observe the actual module used by the host before instrumenting it.').toBeGreaterThan(0);
  const moduleURL = moduleURLs.at(-1)!;
  await page.evaluate(async url => {
    const { MarkdownExporter } = await import(/* @vite-ignore */ url);
    window.__issueInputProbe = { exports: [], inputs: [] };
    const original = MarkdownExporter.exportWithSource;
    MarkdownExporter.exportWithSource = function (this: typeof MarkdownExporter, ...args: Parameters<typeof original>) {
      const start = performance.now();
      try { return original.apply(this, args); }
      finally { window.__issueInputProbe.exports.push({ durationMs: performance.now() - start }); }
    };
    document.addEventListener('beforeinput', event => {
      if (!(event.target instanceof Element) || event.target.getAttribute('aria-label') !== 'Issue description editor') return;
      const start = performance.now(), data = (event as InputEvent).data;
      requestAnimationFrame(() => requestAnimationFrame(() => window.__issueInputProbe.inputs.push({ data, toTwoFramesMs: performance.now() - start })));
    }, true);
  }, moduleURL);
  await page.getByLabel('Open Markdown draft file', { exact: true }).setInputFiles({ name: 'large-issue.md', mimeType: 'text/markdown', buffer: Buffer.from(source) });
  const first = editor.locator(':scope > p').first();
  await expect(editor.locator(':scope > p')).toHaveCount(5000);
  await expect(first).toHaveText('Edit this paragraph.');
  const importExports = await page.evaluate(() => window.__issueInputProbe.exports.length);
  await first.click();
  await page.keyboard.press('End');
  await page.evaluate(() => { window.__issueInputProbe.exports = []; window.__issueInputProbe.inputs = []; });
  for (const [index, character] of [...'XYZ'].entries()) {
    await page.keyboard.type(character);
    await expect.poll(() => page.evaluate(() => window.__issueInputProbe.inputs.length)).toBe(index + 1);
  }
  await expect(first).toHaveText('Edit this paragraph.XYZ');
  const measured = await page.evaluate(() => window.__issueInputProbe);
  await page.screenshot({ path: resolve(root, 'typed.png') });
  await writeFile(resolve(root, 'input-measurement.json'), JSON.stringify({ engine: info.project.name, documentParagraphs: 5000,
    moduleURL, importExports, ...measured, errors }, null, 2));
  return { root, editor, first, source, expected: source.replace('Edit this paragraph.', 'Edit this paragraph.XYZ'), measured, errors };
}

export async function runIssueInputJourney(page: Page, info: TestInfo): Promise<void> {
  const result = await measureIssueInput(page, info);
  expect(result.measured.exports, 'Typing must not serialize the full document.').toEqual([]);
}
