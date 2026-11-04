import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LIST_LAYOUT_STYLES } from '../../src/core/list-layout';
import { PARAGRAPH_SPACING_STYLES } from '../../src/core/paragraph-spacing';
import { inspectLinePaint } from './helpers/line-paint';

export async function listMarkerVisibilityJourney(page: Page, info: TestInfo) {
  const root = process.env.FOUNTAIN_LIST_MARKER_AUDIT_DIR
    ? resolve(`${process.env.FOUNTAIN_LIST_MARKER_AUDIT_DIR}/${info.project.name}`)
    : info.outputPath('list-marker-visibility');
  await mkdir(root, { recursive: true });
  await page.goto('/conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles(resolve('tests/fixtures/native-docx/cooling-report.docx'));
  const workspace = page.getByRole('region', { name: 'Conversion workspace: cooling-report.docx', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  const downloadModel = async (name: string) => {
    await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('json');
    const pending = page.waitForEvent('download');
    await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
    await (await pending).saveAs(resolve(root, name));
    return JSON.parse(await readFile(resolve(root, name), 'utf8'));
  };
  const paragraphs = editor.locator('ol > li > p');
  await expect(paragraphs).toHaveCount(3);
  const before = await downloadModel('before.json');
  await editor.screenshot({ path: resolve(root, 'initial.png') });
  await paragraphs.first().click(); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await expect(paragraphs).toHaveCount(4);
  const empty = paragraphs.filter({ hasText: /^$/ });
  await expect(empty).toHaveCount(1);
  const actual = await inspectLinePaint(page, empty, resolve(root, 'actual-marker.png'));
  expect(actual.pixels.dark).toBeGreaterThan(4);
  await editor.screenshot({ path: resolve(root, 'entered.png') });
  const list = await editor.locator('ol').first().evaluate(element => element.outerHTML);
  const oracle = await page.context().newPage();
  let positive, negative;
  try {
    const base = `<style>body{margin:40px;background:white;color:black;font:16px/1.7 Arial}p{margin:0}${LIST_LAYOUT_STYLES}${PARAGRAPH_SPACING_STYLES}`;
    // Native isolated HTML controls. Literal "2." is independent of Fountain's
    // counter calculation; suppressing the pseudo must produce no dark pixels.
    await oracle.setContent(`${base}#oracle p::before{content:"2."!important}</style><div id="oracle">${list}</div>`);
    const candidate = oracle.locator('ol > li:nth-child(2) > p');
    positive = await inspectLinePaint(oracle, candidate, resolve(root, 'positive-marker.png'));
    expect(positive.pixels.dark).toBeGreaterThan(4);
    await oracle.addStyleTag({ content: '#oracle p::before{content:none!important}' });
    negative = await inspectLinePaint(oracle, candidate, resolve(root, 'negative-marker.png'));
    expect(negative.pixels.dark).toBe(0);
  } finally { await oracle.close(); }
  await empty.click(); await page.keyboard.press('Home'); await page.keyboard.press('Backspace');
  await expect(paragraphs).toHaveCount(3);
  await expect(paragraphs.first()).toHaveText('Record the initial temperature before starting the timer.');
  const after = await downloadModel('after.json');
  expect(after).toEqual(before);
  await writeFile(resolve(root, 'observations.json'), JSON.stringify({ actual, positive, negative,
    completeJSONAfterEnterBackspaceEqual: true, emptyNumberAlreadyPaints: true, productionFixApplied: false }, null, 2) + '\n');
}
