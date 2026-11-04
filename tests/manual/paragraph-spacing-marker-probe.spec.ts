import { test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('inspect native list marker geometry without changing the editor document', async ({ page }) => {
  await page.goto('/conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles(resolve('artifacts/paragraph-spacing-source-20261104/spacing-review.html'));
  const editor = page.getByRole('textbox', { name: 'Imported document editor', exact: true });
  const actual = await editor.locator('ol').evaluate(node => ({
    html: node.outerHTML,
    editorFont: getComputedStyle(node.closest('[role="textbox"]')!).font,
    elements: [node, ...node.querySelectorAll('li,p')].map(element => {
      const css = getComputedStyle(element), box = element.getBoundingClientRect();
      return { tag: element.tagName, text: element.textContent, x: box.x, y: box.y, height: box.height,
        display: css.display, font: css.font, lineHeight: css.lineHeight, margin: css.margin,
        padding: css.padding, border: css.border, inline: element.getAttribute('style') };
    }),
  }));
  const experiments = [];
  const surface = await page.context().newPage();
  try {
    for (const [name, css] of [
      ['native', ''], ['flow-root-list-item', 'li{display:flow-root list-item}'],
      ['marker-font', 'li::marker{font:11pt/14pt Arial}'],
      ['marker-longhand-font', 'li::marker{font-family:Arial;font-size:11pt;line-height:14pt}'],
      ['marker-line-only', 'li::marker{line-height:14pt}'],
      ['matching-owner-font', 'li{font:11pt/14pt Arial}'],
    ]) {
      await surface.setContent(`<style>body{font:${actual.editorFont}}li{line-height:1.6}${css}</style>${actual.html}`);
      experiments.push(await surface.locator('ol').evaluate((node, name) => {
        const p = [...node.querySelectorAll('p')].map(node => node.getBoundingClientRect());
        return { name, gap: p[1]!.y - p[0]!.bottom, itemDisplay: getComputedStyle(node.querySelector('li')!).display };
      }, name));
    }
  } finally { await surface.close(); }
  await writeFile('artifacts/paragraph-spacing-marker-probe-20261104.json', JSON.stringify({ actual, experiments }, null, 2) + '\n');
});
