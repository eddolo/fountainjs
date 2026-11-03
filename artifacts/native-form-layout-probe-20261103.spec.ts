import { test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('isolates native form host layout', async ({ page }, info) => {
  await page.goto('/browser-tests.html');
  const results = await page.evaluate(async () => {
    const results: unknown[] = [];
    for (const display of ['inline', 'block', 'inline-block']) for (const anchor of ['host', 'editor', 'separate']) {
      const tag = `layout-${display}-${anchor}`;
      let internals: ElementInternals;
      customElements.define(tag, class extends HTMLElement {
        static formAssociated = true;
        constructor() { super(); internals = this.attachInternals(); }
      });
      const form = document.createElement('form'), host = document.createElement(tag);
      host.style.display = display; host.tabIndex = -1;
      const editor = document.createElement('div'); editor.contentEditable = 'true';
      editor.style.cssText = 'display:block;min-height:150px;padding:20px;border:1px solid';
      const paragraph = document.createElement('p'); paragraph.append(document.createElement('br'));
      const separate = document.createElement('span'); separate.tabIndex = -1;
      separate.style.cssText = 'position:absolute;display:block;width:1px;height:1px;pointer-events:none';
      separate.addEventListener('focus', () => editor.focus());
      host.addEventListener('focus', () => editor.focus());
      editor.append(paragraph); host.append(separate, editor); form.append(host); document.body.append(form);
      const measure = () => [host, editor, paragraph].map(element => ({tag:element.tagName,
        width:element.getBoundingClientRect().width, height:element.getBoundingClientRect().height}));
      const before = measure();
      internals!.setValidity({valueMissing:true}, 'Please enter content.', anchor === 'host' ? host : anchor === 'editor' ? editor : separate);
      const invalid = measure();
      internals!.reportValidity();
      await new Promise(resolve => requestAnimationFrame(resolve));
      const reported = measure();
      results.push({display,anchor,before,invalid,reported});
      form.remove();
    }
    return results;
  });
  await writeFile(info.outputPath('native-layout-matrix.json'), JSON.stringify(results, null, 2));
});
