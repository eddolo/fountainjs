import { expect, type Page, type TestInfo } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import type { NodeJSON } from '../../src/core/schema/node';

/** Real file selection and editing; no document/selection API writes. */
export async function htmlAnchorLossJourney(page: Page, info: TestInfo): Promise<void> {
  const source = '<h2>Anchor import audit</h2><p>Before <a id="private-bookmark">Section</a> after.</p><p>Safe <a href="/next"></a> empty link. <a href="/guide">Guide</a></p>';
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles({ name: 'anchors.html', mimeType: 'text/html', buffer: Buffer.from(source) });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: anchors.html', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  const report = workspace.locator('.lab-notice');
  await expect(report).toContainText('unmapped-inline-element');
  await expect(report).toContainText('named-anchor references are not preserved');
  await expect(report).not.toContainText('private-bookmark');
  await expect(workspace.getByLabel('Original source', { exact: true })).toHaveText(source);
  await expect(editor.locator('[id="private-bookmark"]')).toHaveCount(0);
  // Empty linked runs are deliberately non-actionable in the live view.
  // Prove the destination survives the actual download, not DOM href equality.
  await expect(editor.locator('a:not([href])')).toHaveCount(1);
  await expect(editor.locator('a[href="/guide"]')).toHaveText('Guide');
  await workspace.screenshot({ path: info.outputPath('anchor-loss-imported.png') });
  await editor.scrollIntoViewIfNeeded();
  await editor.screenshot({ path: info.outputPath('anchor-loss-imported-editor.png') });

  const paragraph = editor.locator('p').filter({ hasText: 'Before Section after.' });
  await paragraph.click(); await page.keyboard.press('Home'); await page.keyboard.type('Edited: ');
  await expect(paragraph).toHaveText('Edited: Before Section after.');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(paragraph).toHaveText('Before Section after.');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(paragraph).toHaveText('Edited: Before Section after.');
  await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('json');
  await workspace.getByRole('button', { name: 'Check round trip', exact: true }).click();
  await expect(workspace.getByLabel('Round-trip result', { exact: true })).toContainText('Exact Fountain document equality after reopening.');
  await expect(workspace.getByLabel('Round-trip result', { exact: true })).toContainText('Missing original content is not restored by a successful round trip.');
  const downloadJSON = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const jsonFile = await downloadJSON;
  await jsonFile.saveAs(info.outputPath('anchor-loss-export.json'));
  const exported = JSON.parse(await readFile(info.outputPath('anchor-loss-export.json'), 'utf8')) as NodeJSON;
  const leaves: NodeJSON[] = [];
  const visit = (node: NodeJSON) => { if (node.type === 'text') leaves.push(node); (node.content ?? []).forEach(visit); };
  visit(exported);
  expect(leaves.filter(node => node.text === '' && node.marks?.some(mark => mark.type === 'link' && mark.attrs?.href === '/next'))).toHaveLength(1);
  await expect(workspace.getByRole('textbox', { name: 'Reopened export preview', exact: true }).locator('a:not([href])')).toHaveCount(1);
  await workspace.screenshot({ path: info.outputPath('anchor-loss-edited-reopened.png') });
  const reader = workspace.getByRole('textbox', { name: 'Reopened export preview', exact: true });
  await reader.scrollIntoViewIfNeeded();
  await reader.screenshot({ path: info.outputPath('anchor-loss-reopened-editor.png') });
  await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('html');
  const downloadHTML = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const htmlFile = await downloadHTML;
  await htmlFile.saveAs(info.outputPath('anchor-loss-export.html'));
  const html = await readFile(info.outputPath('anchor-loss-export.html'), 'utf8');
  expect(html).toMatch(/<a\b[^>]*href="\/next"[^>]*><\/a>/);
  expect(html).not.toContain('private-bookmark');
  await writeFile(info.outputPath('anchor-loss-observations.json'), JSON.stringify({ source,
    original: await workspace.getByLabel('Original source', { exact: true }).textContent(),
    report: await report.textContent(), editorHTML: await editor.innerHTML(),
    exportedDocument: exported, exportedHTML: html,
    viewPolicy: 'Empty links retain marks in JSON/HTML but intentionally have no actionable href in the view.',
    roundTrip: await workspace.getByLabel('Round-trip result', { exact: true }).textContent(), pageErrors: errors,
  }, null, 2));
  expect(errors).toEqual([]);
}
