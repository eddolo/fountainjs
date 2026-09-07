import { expect, test, type Page, type TestInfo } from '@playwright/test';

const runbook = [
  '# Deployment runbook',
  '',
  '10. Prepare release',
  '',
  '    Confirm the release window.',
  '',
  '        npm test',
  '',
  '',
  '        npm run build',
  '',
  '    > Keep the rollback image.',
  '',
  '11. Deploy',
  '    - Check health',
  '    - Notify the team',
  '',
  'Done.',
].join('\n');

async function capture(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await info.attach(name, { path, contentType: 'image/png' });
}

// Markdown carries content, not the host's generated persistent node IDs.
const withoutNodeIds = (json: string) => JSON.parse(json, (key, value) => {
  if (key === 'nodeId') return undefined;
  if (key === 'attrs' && Object.keys(value).length === 0) return undefined;
  return value;
});

test('inert HTML source remains multiline editable text through the public demos', async ({ page, context }, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/demos/node-markdown.html');
  const source = '<script>\n\n[hidden]: /wrong\n# literal heading\n\n</script>\n\nOutside';
  await page.getByLabel('Markdown input', { exact: true }).fill(source);
  const output = page.locator('.demo-output');
  await output.getByRole('button', { name: 'html', exact: true }).click();
  const html = await output.locator('pre').innerText();
  expect(html).toContain('&lt;script&gt;');
  await page.evaluate(async html => navigator.clipboard.write([new ClipboardItem({
    'text/html': new Blob([html], { type: 'text/html' }),
  })]), html);
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+v');
  await expect(editor.locator('script, h1, a')).toHaveCount(0);
  await expect(editor.locator(':scope > p')).toHaveCount(2);
  await expect(editor.locator('br:not([data-fountain-caret-placeholder])')).toHaveCount(5);
  await editor.getByText('# literal heading', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' remains text');
  await expect(editor).toContainText('# literal heading remains text');
  await capture(page, info, '07-inert-html-multiline-editing');
  await page.keyboard.press('Control+z');
  await expect(editor).not.toContainText('remains text');
});

test('authored blank paragraphs remain visible through Markdown export and reimport', async ({ page, context }, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const html = '<p>Spacing review</p><p></p><ul><li><p></p><pre><code>Keep this code inside the list.</code></pre><p></p></li></ul><p>After</p>';
  await page.goto('/demos/go-docs-service.html');
  await page.evaluate(async html => navigator.clipboard.write([new ClipboardItem({
    'text/html': new Blob([html], { type: 'text/html' }),
  })]), html);
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+v');
  await editor.getByText('After', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(editor.locator(':scope > p')).toHaveCount(5);
  await expect(editor.locator('li > p')).toHaveCount(2);
  await expect(editor.locator('li > pre')).toHaveText('Keep this code inside the list.');
  await capture(page, info, '10-authored-spacing-before-export');
  const output = page.locator('.demo-output');
  await output.getByRole('button', { name: 'json', exact: true }).click();
  const authored = withoutNodeIds(await output.locator('pre').innerText());
  await output.getByRole('button', { name: 'markdown', exact: true }).click();
  const markdown = await output.locator('pre').innerText();
  expect(markdown.match(/data-fountain-empty/g)).toHaveLength(5);

  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill(markdown);
  await expect.poll(async () => withoutNodeIds(await output.locator('pre').innerText())).toEqual(authored);
  await output.getByRole('button', { name: 'html', exact: true }).click();
  const exportedHTML = await output.locator('pre').innerText();
  await page.evaluate(async html => navigator.clipboard.write([new ClipboardItem({
    'text/html': new Blob([html], { type: 'text/html' }),
  })]), exportedHTML);
  await page.goto('/demos/go-docs-service.html');
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+v');
  await expect(editor.locator(':scope > p')).toHaveCount(5);
  await expect(editor.locator('li > p')).toHaveCount(2);
  await expect(editor.locator('li > pre')).toHaveText('Keep this code inside the list.');
  await expect.poll(async () => withoutNodeIds(await output.locator('pre').innerText())).toEqual(authored);
  await editor.scrollIntoViewIfNeeded();
  await capture(page, info, '11-authored-spacing-after-reimport');
});

test('nested incident runbook preserves literal definitions through editing and export', async ({ page, context }, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const source = '# Incident runbook\n\n- <script>\n  [hidden]: /wrong\n  </script>\n\n- ```text\n  [secret]: /not-a-link\n  ```\n\n[hidden] stays literal. [guide]\n\n12. [guide]: /runbook\n\n    Operator checklist\n\nEnd of runbook.';
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill(source);
  const output = page.locator('.demo-output');
  await output.getByRole('button', { name: 'html', exact: true }).click();
  const html = await output.locator('pre').innerText();
  expect(html).toContain('[hidden]: /wrong');
  expect(html).toContain('[secret]: /not-a-link');
  await page.evaluate(async html => navigator.clipboard.write([new ClipboardItem({
    'text/html': new Blob([html], { type: 'text/html' }),
  })]), html);
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+v');
  await expect(editor).toContainText('[hidden]: /wrong');
  await expect(editor.locator('pre')).toHaveText('[secret]: /not-a-link');
  await expect(editor.locator('script')).toHaveCount(0);
  await expect(editor.locator('a')).toHaveCount(1);
  // Browser clipboard import resolves relative URLs against the source page.
  await expect(editor.locator('a')).toHaveAttribute('href', new URL('/runbook', page.url()).href);
  await editor.getByText('Operator checklist', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' verified');
  await expect(editor).toContainText('Operator checklist verified');
  await capture(page, info, '08-nested-runbook-edited');
  await page.keyboard.press('Control+z');
  await expect(editor).not.toContainText('verified');
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toContainText('Operator checklist verified');
  await output.getByRole('button', { name: 'markdown', exact: true }).click();
  const exported = await output.locator('pre').innerText();
  await output.getByRole('button', { name: 'json', exact: true }).click();
  const edited = withoutNodeIds(await output.locator('pre').innerText());
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill(exported);
  await expect.poll(async () => withoutNodeIds(await output.locator('pre').innerText())).toEqual(edited);
  await capture(page, info, '09-nested-runbook-reimported');
});

test('unwrapped clipboard fragment: formatting, surrounding text, edit, and undo', async ({ page, context }, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/demos/go-docs-service.html');
  await page.evaluate(async () => navigator.clipboard.write([new ClipboardItem({
    'text/html': new Blob(['Before <strong>bold</strong> and <a href="https://example.com/target">link</a>.<p>Middle</p>After'], { type: 'text/html' }),
    'text/plain': new Blob(['Before bold and link.\nMiddle\nAfter'], { type: 'text/plain' }),
  })]));
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+v');
  await expect(editor.locator(':scope > p')).toHaveText(['Before bold and link.', 'Middle', 'After']);
  await expect(editor.locator('strong')).toHaveText('bold');
  await expect(editor.locator('a')).toHaveText('link');
  await expect(editor.locator('a')).toHaveCSS('text-decoration-line', 'underline');
  await editor.scrollIntoViewIfNeeded();
  await capture(page, info, '05-unwrapped-rich-paste');
  await editor.getByText('After', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' editing');
  await expect(editor).toContainText('After editing');
  await page.keyboard.press('Control+z');
  await expect(editor.locator(':scope > p')).toHaveText(['Before bold and link.', 'Middle', 'After']);
  await capture(page, info, '06-fragment-edit-undone');
});

test('numbered runbook: import, rich paste, nested editing, undo, and Markdown export', async ({ page, context }, info) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill(runbook);
  const output = page.locator('.demo-output');
  await output.getByRole('button', { name: 'html', exact: true }).click();
  await expect(output.locator('pre')).toContainText('<ol start="10">');
  const html = await output.locator('pre').innerText();
  await capture(page, info, '01-imported-runbook');
  // Supply the same standard MIME pair as a browser's rich-content Copy action.
  await page.evaluate(async ({ html, plain }) => {
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([plain], { type: 'text/plain' }),
    })]);
  }, { html, plain: runbook });

  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+v');
  await expect(editor).toContainText('Deployment runbook');
  await expect(editor.locator('ol').first()).toHaveAttribute('start', '10');
  await expect(editor.locator('ol > li').first().locator(':scope > p')).toHaveCount(2);
  await expect(editor.locator('pre')).toHaveText('npm test\n\n\nnpm run build');
  await expect(editor.locator('blockquote')).toHaveText('Keep the rollback image.');
  await expect(editor.locator('ul > li')).toHaveCount(2);
  await editor.scrollIntoViewIfNeeded();
  await capture(page, info, '02-rendered-runbook');

  await editor.getByText('Confirm the release window.', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Approved.');
  await expect(editor).toContainText('Confirm the release window. Approved.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Keep an operator online.');
  await expect(editor.locator('ol').first().locator(':scope > li')).toHaveCount(3);
  await expect(editor.locator('ol').first().locator(':scope > li').nth(1)).toContainText('Keep an operator online.');
  await capture(page, info, '03-edited-nested-paragraph');
  await page.keyboard.press('Control+z');
  await expect(editor).not.toContainText('Keep an operator online.');
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toContainText('Keep an operator online.');

  await output.getByRole('button', { name: 'markdown', exact: true }).click();
  const exported = await output.locator('pre').innerText();
  expect(exported).toContain('10. Prepare release');
  expect(exported).toContain('12. Deploy');
  expect(exported).toContain('    Confirm the release window. Approved.');
  expect(exported).toContain('11. Keep an operator online.');
  await output.getByRole('button', { name: 'json', exact: true }).click();
  const edited = withoutNodeIds(await output.locator('pre').innerText());

  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill(exported);
  await expect.poll(async () => withoutNodeIds(await output.locator('pre').innerText())).toEqual(edited);
  await output.getByRole('button', { name: 'markdown', exact: true }).click();
  await output.scrollIntoViewIfNeeded();
  await capture(page, info, '04-export-and-reimport');
  expect(errors).toEqual([]);
});
