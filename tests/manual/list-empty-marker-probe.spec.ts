import { test, expect, type Locator, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LIST_LAYOUT_STYLES } from '../../src/core/list-layout';
import { PARAGRAPH_SPACING_STYLES } from '../../src/core/paragraph-spacing';

async function paint(page: Page, paragraph: Locator, path: string) {
  const box = await paragraph.boundingBox();
  if (!box) throw Error('Expected a visible line box.');
  const clip = { x: Math.max(0, box.x - 40), y: Math.floor(box.y), width: 180, height: Math.ceil(box.height) };
  const png = await page.screenshot({ path, clip, caret: 'hide' });
  const pixels = await page.evaluate(async base64 => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    let dark = 0, left = width, right = -1, top = height, bottom = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      if (data[offset] < 120 && data[offset + 1] < 120 && data[offset + 2] < 120 && data[offset + 3] > 200) {
        dark++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    return { dark, left, right, top, bottom, width, height };
  }, png.toString('base64'));
  return { box, clip, pixels, styles: await paragraph.evaluate(element => {
    const style = getComputedStyle(element), marker = getComputedStyle(element, '::before');
    return { html: element.outerHTML, content: marker.content, display: marker.display, color: marker.color,
      font: marker.font, markerWidth: marker.width, markerHeight: marker.height, markerIndent: marker.textIndent,
      align: marker.textAlign, marginEnd: marker.marginInlineEnd, paragraphIndent: style.textIndent,
      paragraphFont: style.font, overflow: style.overflow, itemDisplay: getComputedStyle(element.parentElement!).display };
  }) };
}

test('isolate the missing empty numbered-item paint without changing the editor engine', async ({ page }, info) => {
  const root = resolve(`${process.env.FOUNTAIN_EMPTY_MARKER_PROBE_ROOT ?? 'artifacts/list-empty-marker-probe-20261104'}/${info.project.name}`);
  await mkdir(root);
  await page.goto('/conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles(resolve('tests/fixtures/native-docx/cooling-report.docx'));
  const editor = page.getByRole('textbox', { name: 'Imported document editor', exact: true });
  await editor.screenshot({ path: resolve(root, 'initial-editor.png') });
  const first = editor.locator('ol > li > p').first();
  await first.click(); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  const empty = editor.locator('ol > li > p').filter({ hasText: /^$/ });
  await expect(empty).toHaveCount(1);
  const items = editor.locator('ol > li');
  await expect(items).toHaveCount(4);
  expect((await empty.boundingBox())?.height).toBeGreaterThan(10);
  await empty.evaluate(element => ({ html: element.outerHTML, content: getComputedStyle(element, '::before').content }));
  for (const [a, b] of [[first, empty], [empty, editor.locator('ol > li > p').nth(2)]]) {
    const left = await a.boundingBox(), right = await b.boundingBox();
    expect(right!.y - left!.y - left!.height).toBeCloseTo(0, 1);
  }
  const before = { editor: await editor.boundingBox(), empty: await empty.boundingBox() };
  await editor.screenshot({ path: resolve(root, 'actual-editor-before.png') });
  const afterFirstFull = { editor: await editor.boundingBox(), empty: await empty.boundingBox() };
  const actual = await paint(page, empty, resolve(root, 'actual.png'));
  await editor.screenshot({ path: resolve(root, 'actual-editor-after.png'), caret: 'hide' });
  const afterSecondFull = { editor: await editor.boundingBox(), empty: await empty.boundingBox() };
  const repeated = await paint(page, empty, resolve(root, 'actual-repeated.png'));
  const list = await editor.locator('ol').first().evaluate(element => element.outerHTML);
  const isolated = await page.context().newPage();
  const cases = [];
  try {
    for (const [name, editable, extra, replace] of [
      ['native', false, '', false], ['editable', true, '', false],
      ['plain-br', true, '', true], ['width-one', true, 'p::before{width:1px!important}', false],
      ['inline-pseudo', true, 'p::before{display:inline!important;width:auto!important}', false],
      ['positive-text', true, '', 'control'],
    ] as const) {
      await isolated.setContent(`<style>body{margin:40px;background:white;color:black;font:16px/1.7 Arial}p{margin:0}${LIST_LAYOUT_STYLES}${PARAGRAPH_SPACING_STYLES}${extra}</style><div contenteditable="${editable}">${list}</div>`);
      const candidate = isolated.locator('ol > li:nth-child(2) > p');
      if (replace) await candidate.evaluate((element, value) => { element.replaceChildren(value === 'control' ? document.createTextNode('Control') : document.createElement('br')); }, replace);
      cases.push({ name, ...(await paint(isolated, candidate, resolve(root, `${name}.png`))) });
    }
  } finally { await isolated.close(); }
  await writeFile(resolve(root, 'observations.json'), JSON.stringify({ before, afterFirstFull, afterSecondFull, actual, repeated, cases }, null, 2) + '\n');
});
