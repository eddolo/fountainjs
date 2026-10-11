import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { Schema } from '../../src/core/schema';
import { CoreSchemaSpec } from '../../src/extensions';
import { firstStrongDirection, containedTextDirection } from '../../src/core/first-strong-direction';

const samples = ['', '123 .,😀', '\u0301\u05b0 123 שלום', '١٢٣ العربية', '١٢٣ English',
  '😀 𞤀 Adlam', '😀 𝒜 שלום', '\u200fEnglish', '\u200eשלום', '\u202b\u2067\u2069\u202c English',
  '\u200b\ufeffשלום', 'English שלום', 'שלום English', '€٠١٢ --'];
const escape = (text: string) => text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

test('compares portable first-strong resolution with independent native browser controls', async ({ page }, info) => {
  const schema = new Schema(CoreSchemaSpec);
  const p = (text: string, dir?: string) => schema.node('paragraph', dir ? { dir } : {}, [schema.text(text)]);
  const fixtures = [
    { name: 'nested fixed context excluded', html: '<p dir="ltr">Latin excluded</p><p>שלום eligible</p>',
      node: schema.node('blockquote', { dir: 'auto' }, [p('Latin excluded', 'ltr'), p('שלום eligible')]) },
    { name: 'nested independent auto excluded', html: '<p dir="auto">שלום excluded</p><p>English eligible</p>',
      node: schema.node('blockquote', { dir: 'auto' }, [p('שלום excluded', 'auto'), p('English eligible')]) },
    { name: 'weak-only subtree with no strong result', html: '<blockquote><p>123😀</p><p>٠١٢ --</p></blockquote>',
      node: schema.node('blockquote', { dir: 'auto' }, [schema.node('blockquote', {}, [p('123😀'), p('٠١٢ --')])]) },
  ];
  const sections = samples.map((text, index) => `<section><h2>${index}: ${escape(JSON.stringify(text))}</h2><div class="sample" data-case="${index}" dir="auto">${escape(text) || '<br>'}</div></section>`)
    .concat(fixtures.map((fixture, index) => `<section><h2>${escape(fixture.name)}</h2><div class="sample" data-case="${samples.length + index}" dir="auto">${fixture.html}</div></section>`));
  await page.setContent(`<style>body{font:17px/1.4 sans-serif;padding:16px;margin:0}h1{font-size:24px}main{display:grid;grid-template-columns:1fr 1fr;gap:12px}section{border:1px solid #aaa;padding:8px}h2{font:13px monospace;margin:0 0 8px}.sample{border:1px solid #ddd;padding:8px;min-height:24px}p{margin:4px 0}</style><h1>${info.project.name}: independent native controls — not a Fountain view integration</h1><main>${sections.join('')}</main>`);
  const observed = await page.locator('[data-case]').evaluateAll(nodes => nodes.map(node => ({
    case: Number(node.getAttribute('data-case')), direction: getComputedStyle(node).direction,
  })));
  const expected = samples.map(text => firstStrongDirection(text) ?? 'ltr')
    .concat(fixtures.map(fixture => containedTextDirection(fixture.node) ?? 'ltr'));
  await writeFile(info.outputPath('first-strong-native-observations.json'), JSON.stringify({
    engine: info.project.name, unicodeVersion: '17.0.0', scope: '17 bounded native oracle cases, not exhaustive browser Unicode conformance or Fountain integration',
    samples, fixtures: fixtures.map(fixture => ({ name: fixture.name, html: fixture.html, model: fixture.node.toJSON() })), expected, observed,
  }, null, 2));
  await page.screenshot({ path: info.outputPath('first-strong-native-controls.png'), fullPage: true });
  expect(observed.map(value => value.direction)).toEqual(expected);
});
