import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  await page.route('**/readonly-image.png', route => route.fulfill({
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64'),
  }));
  await page.route('**/readonly-image-check', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><link rel="stylesheet" href="/dist/styles.css"><main id="mount"></main>',
  }));
  await page.goto('http://127.0.0.1:4195/readonly-image-check');
  const result = await page.evaluate(async () => {
    const { createEditor, CoreSchemaSpec, EditorView } = await import('/dist/index.js');
    const source = '/readonly-image.png';
    const editor = createEditor({ schema: CoreSchemaSpec, editable: false, content: {
      type: 'doc', content: [{ type: 'image_super', attrs: { src: source } }],
    } });
    const view = new EditorView(document.querySelector('#mount'), editor);
    return {
      editable: editor.editable,
      controls: [...view.dom.querySelectorAll('textarea,figcaption,.fountain-image__resize-controls')].map(element => ({
        tag: element.tagName, class: element.className, hidden: element.hidden,
        display: getComputedStyle(element).display, height: element.getBoundingClientRect().height,
        placeholder: element.getAttribute('placeholder'),
      })),
    };
  });
  await page.screenshot({ path: 'artifacts/readonly-image-inspection-20261111.png' });
  await writeFile('artifacts/readonly-image-inspection-20261111.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
