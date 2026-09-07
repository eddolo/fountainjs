import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { listNumberingJourney } from '../browser/list-numbering-journey';

test('zero-based procedure: real clipboard, keyboard outdent, undo, export and reopen', async ({ page }, info) => {
  await listNumberingJourney(page, info, true);
});

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

test('table captions remain readable and editable through real paste and Markdown reopen', async ({ page, context }, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const source = '<h2>Measurement report</h2><table><caption>Trial <strong>results</strong> — <a href="/method">method notes</a></caption><tr><th>Sample</th><th>Result</th></tr><tr><td>A</td><td>42</td></tr></table><p>All samples were measured twice.</p>';
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill(source);
  await page.getByRole('checkbox', { name: 'Convert HTML blocks to rich content' }).check();
  await expect(page.getByRole('list', { name: 'Markdown HTML conversion details' })).toContainText('caption association');
  await capture(page, info, '35-table-caption-conversion-warning');
  await page.evaluate(async html => navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }) })]), source);
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+v');
  await expect(editor.locator('h2')).toHaveText('Measurement report');
  await expect(editor.locator('strong')).toHaveText('results');
  await expect(editor.getByRole('link', { name: 'method notes' })).toBeVisible();
  await expect(editor.locator('table')).toHaveCount(1);
  await expect(editor.locator('td').last()).toHaveText('42');
  await editor.locator('strong').dblclick();
  await page.keyboard.type('outcomes');
  await expect(editor.locator('strong')).toHaveText('outcomes');
  await page.keyboard.press('Control+z');
  await expect(editor.locator('strong')).toHaveText('results');
  await page.keyboard.press('Control+Shift+z');
  await expect(editor.locator('strong')).toHaveText('outcomes');
  await editor.scrollIntoViewIfNeeded();
  await capture(page, info, '36-table-caption-edit-and-undo');
  const output = page.locator('.demo-output');
  const expected = withoutNodeIds(await output.locator('pre').innerText());
  await output.getByRole('button', { name: 'markdown', exact: true }).click();
  const markdown = await output.locator('pre').innerText();
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill(markdown);
  await expect.poll(async () => withoutNodeIds(await output.locator('pre').innerText())).toEqual(expected);
});

test('complex figures keep evidence and rich captions through conversion paste editing and reopen', async ({ page, context }, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const source = '<figure><h2>Experiment evidence</h2><p>Before the diagram.</p><img src="/demo-media.svg" alt="Evidence diagram" width="320"><p>Measured result: 42.</p><figcaption><strong>Important</strong> <a href="/evidence">method notes</a></figcaption></figure>';
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill(source);
  await page.getByRole('checkbox', { name: 'Convert HTML blocks to rich content' }).check();
  const notes = page.getByRole('list', { name: 'Markdown HTML conversion details' });
  await expect(notes).toContainText('figure grouping');
  const output = page.locator('.demo-output');
  await output.getByRole('button', { name: 'html', exact: true }).click();
  await expect(output.locator('pre')).toContainText('Measured result: 42.');
  await capture(page, info, '32-complex-figure-conversion');
  // Paste the original complex figure, not the already converted HTML, to
  // exercise the browser importer independently of the server projection.
  await page.evaluate(async html => navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }) })]), source);
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+v');
  await expect(editor.locator('h2')).toHaveText('Experiment evidence');
  await expect(editor.getByRole('img', { name: 'Evidence diagram' })).toBeVisible();
  await expect(editor.locator('strong')).toHaveText('Important');
  await expect(editor.getByRole('link', { name: 'method notes' })).toBeVisible();
  await editor.getByText('Measured result: 42.', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Verified.');
  await expect(editor).toContainText('Measured result: 42. Verified.');
  await page.keyboard.press('Control+z');
  await expect(editor).not.toContainText('Verified.');
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toContainText('Measured result: 42. Verified.');
  await editor.scrollIntoViewIfNeeded();
  await capture(page, info, '33-complex-figure-editable-evidence');
  const expected = withoutNodeIds(await output.locator('pre').innerText());
  expect(expected.content[2].attrs.width).toBe('320px');
  await output.getByRole('button', { name: 'html', exact: true }).click();
  const retainedHTML = await output.locator('pre').innerText();
  await output.getByRole('button', { name: 'markdown', exact: true }).click();
  await output.locator('summary').click();
  await expect(output.locator('details')).toContainText('Image layout, responsive-source, loading, and caption metadata');
  await capture(page, info, '34-reported-Markdown-image-layout-loss');
  const markdown = await output.locator('pre').innerText();
  await page.goto('/demos/node-markdown.html');
  await page.getByRole('button', { name: 'Server HTML', exact: true }).click();
  await page.getByLabel('Server HTML input').fill(retainedHTML);
  await expect.poll(async () => withoutNodeIds(await output.locator('pre').innerText())).toEqual(expected);
  await page.locator('.headless-input-tabs').getByRole('button', { name: 'Markdown', exact: true }).click();
  await page.getByLabel('Markdown input', { exact: true }).fill(markdown);
  // Standard image Markdown has no width field. Assert the exact reported
  // projection, not a comparison that strips arbitrary attributes or content.
  const projected = structuredClone(expected);
  projected.content[2].attrs.width = '100%';
  await expect.poll(async () => withoutNodeIds(await output.locator('pre').innerText())).toEqual(projected);
});

test('nested inert HTML keeps literal source and surrounding Markdown through real editing', async ({ page, context }, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const source = '# Maintenance note\n\n- Operator checklist\n\n  > Before *marked*.\n  >\n  > <custom-panel mode="read-only">\n  > *literal* &amp; \\*\n  > </custom-panel>\n  >\n  > After **strong**.';
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill(source);
  const output = page.locator('.demo-output');
  const original = withoutNodeIds(await output.locator('pre').innerText());
  await output.getByRole('button', { name: 'html', exact: true }).click();
  await expect(output.locator('pre')).toContainText('&lt;custom-panel');
  await expect(output.locator('pre')).toContainText('<em>marked</em>');
  await expect(output.locator('pre')).toContainText('<strong>strong</strong>');
  const html = await output.locator('pre').innerText();
  await page.evaluate(async html => navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }) })]), html);
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+v');
  await expect(editor.locator('li blockquote')).toHaveCount(1);
  await expect(editor.locator('custom-panel')).toHaveCount(0);
  await expect(editor.locator('blockquote')).toContainText('<custom-panel mode="read-only">');
  await expect(editor.locator('blockquote')).toContainText('*literal* &amp; \\*');
  await expect(editor.locator('em')).toHaveText('marked');
  // This host adds one caret paragraph after a trailing list. Assert that exact
  // addition; do not strip blank paragraphs or relax any imported content.
  await expect.poll(async () => withoutNodeIds(await output.locator('pre').innerText())).toEqual({
    ...original,
    content: [...original.content, { type: 'paragraph', attrs: { align: 'left' }, content: [{ type: 'text', text: '' }] }],
  });
  await editor.scrollIntoViewIfNeeded();
  await capture(page, info, '30-nested-inert-HTML-keeps-literal-lines');
  await editor.locator('strong').dblclick();
  await page.keyboard.type('ready');
  await expect(editor.locator('strong')).toHaveText('ready');
  await page.keyboard.press('Control+z');
  await expect(editor.locator('strong')).toHaveText('strong');
  await page.keyboard.press('Control+Shift+z');
  await expect(editor.locator('strong')).toHaveText('ready');
  const changed = withoutNodeIds(await output.locator('pre').innerText());
  await output.getByRole('button', { name: 'markdown', exact: true }).click();
  const markdown = await output.locator('pre').innerText();
  await capture(page, info, '31-edited-nested-source-and-canonical-export');
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill(markdown);
  await expect.poll(async () => withoutNodeIds(await output.locator('pre').innerText())).toEqual(changed);
});

test('conversion losses are visible before the remaining content is pasted and edited', async ({ page, context }, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill('# Imported notice\n\nNotice <unknown-inline>label</unknown-inline><!-- private note --><a href="javascript:privateLink()"> end.</a><img src="javascript:privateImage()">');
  await page.getByRole('checkbox', { name: 'Convert inline HTML formatting' }).check();
  const notes = page.getByRole('list', { name: 'Markdown HTML conversion details' });
  await expect(notes.getByRole('listitem')).toHaveCount(5);
  await expect(notes).toContainText('HTML comments were omitted');
  await expect(notes).toContainText('Unmapped inline HTML elements');
  await expect(notes).toContainText('Unsafe link URLs');
  await expect(notes).toContainText('Images with missing or unsafe');
  await expect(notes).not.toContainText('private');
  const output = page.locator('.demo-output');
  await output.getByRole('button', { name: 'html', exact: true }).click();
  await expect(output.locator('pre')).toContainText('<p>Notice label end.</p>');
  await capture(page, info, '28-explicit-HTML-conversion-losses');
  const html = await output.locator('pre').innerText();
  await page.evaluate(async html => navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }) })]), html);
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+v');
  await expect(editor).toContainText('Notice label end.');
  await expect(editor.locator('img, a, unknown-inline')).toHaveCount(0);
  await editor.getByText('Notice label end.', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Reviewed.');
  await expect(editor).toContainText('Notice label end. Reviewed.');
  await page.keyboard.press('Control+z');
  await expect(editor).not.toContainText('Reviewed.');
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toContainText('Reviewed.');
  await capture(page, info, '29-readable-content-after-lossy-import');
});

test('opt-in inline HTML survives a real rich paste edit undo and Markdown reimport', async ({ page, context }, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill('# Incident handover\n\nOwner: <em>important</em>.\n\nReview <strong>first and *second*</strong> together.\n\nLink: *<a href="/safe">one* two</a>.');
  await page.getByRole('checkbox', { name: 'Convert inline HTML formatting' }).check();
  const output = page.locator('.demo-output');
  await output.getByRole('button', { name: 'html', exact: true }).click();
  await expect(output.locator('pre')).toContainText('<em>important</em>');
  await expect(page.getByRole('list', { name: 'Markdown HTML conversion details' })).toContainText('not lossless HTML conversion');
  await expect(page.getByRole('list', { name: 'Markdown HTML conversion details' }).getByRole('listitem')).toHaveCount(1);
  await capture(page, info, '26-opt-in-inline-HTML-conversion');
  const html = await output.locator('pre').innerText();
  await page.evaluate(async html => navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }) })]), html);
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+v');
  await expect(editor.locator('em').first()).toHaveText('important');
  await expect(editor.locator('strong em, em strong')).toHaveText('second');
  await editor.getByText('important', { exact: true }).dblclick();
  await page.keyboard.type('critical');
  await expect(editor.locator('em').first()).toHaveText('critical');
  await page.keyboard.press('Control+z');
  await expect(editor.locator('em').first()).toHaveText('important');
  await page.keyboard.press('Control+Shift+z');
  await expect(editor.locator('em').first()).toHaveText('critical');
  await editor.scrollIntoViewIfNeeded();
  await capture(page, info, '27-inline-HTML-editable-content');
  const expected = withoutNodeIds(await output.locator('pre').innerText());
  await output.getByRole('button', { name: 'markdown', exact: true }).click();
  const markdown = await output.locator('pre').innerText();
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill(markdown);
  await expect.poll(async () => withoutNodeIds(await output.locator('pre').innerText())).toEqual(expected);
  expect(errors).toEqual([]);
});

test('raw HTML lexical boundaries preserve visible Markdown formatting through real editing', async ({ page, context }, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const source = '# HTML boundary review\n\nMalformed <a x=="*important*"> stays text.\n\nValid <a x="*literal*"> stays inert; *outside* is emphasized.\n\nShort <!--> *visible* after.\n\nClose </a x="*editable*"> is not an HTML tag.';
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill(source);
  const output = page.locator('.demo-output');
  await output.getByRole('button', { name: 'html', exact: true }).click();
  await expect(output.locator('pre')).toContainText('<em>important</em>');
  await expect(output.locator('pre')).toContainText('<em>outside</em>');
  const html = await output.locator('pre').innerText();
  expect(html).not.toContain('<a ');
  await capture(page, info, '24-HTML-token-boundaries-in-conversion');
  await page.evaluate(async html => navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }) })]), html);
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+v');
  await expect(editor.locator('em')).toHaveText(['important', 'outside', 'visible', 'editable']);
  await expect(editor).toContainText('<a x="*literal*">');
  await expect(editor.locator('a')).toHaveCount(0);
  await editor.getByText('important', { exact: true }).dblclick();
  await page.keyboard.type('critical');
  await expect(editor.locator('em').first()).toHaveText('critical');
  await page.keyboard.press('Control+z');
  await expect(editor.locator('em').first()).toHaveText('important');
  await page.keyboard.press('Control+Shift+z');
  await expect(editor.locator('em').first()).toHaveText('critical');
  const expected = withoutNodeIds(await output.locator('pre').innerText());
  await editor.scrollIntoViewIfNeeded();
  await capture(page, info, '25-inert-HTML-and-edited-emphasis');
  await output.getByRole('button', { name: 'markdown', exact: true }).click();
  const markdown = await output.locator('pre').innerText();
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill(markdown);
  await expect.poll(async () => withoutNodeIds(await output.locator('pre').innerText())).toEqual(expected);
});

test('unfamiliar wrappers retain editable structure through Markdown conversion and rich clipboard paste', async ({ page, context }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const html = '<incident-panel>\n<inner-panel><h2>Incident handover</h2><p>First paragraph</p><p>Second paragraph</p><ul><li>Check health</li></ul><table><tr><td>Evidence</td></tr></table><p>Handover complete.</p></inner-panel>\n</incident-panel>';
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill(html);
  await page.getByRole('checkbox', { name: 'Convert HTML blocks to rich content' }).check();
  await expect(page.getByText(/Unmapped HTML block wrappers were removed/)).toBeVisible();
  const output = page.locator('.demo-output');
  await expect(output.locator('pre')).toContainText('Incident handover');
  const imported = withoutNodeIds(await output.locator('pre').innerText());
  await capture(page, info, '21-wrapper-conversion-and-explicit-warning');
  await page.locator('.headless-input-tabs').getByRole('button', { name: 'Server HTML', exact: true }).click();
  await page.getByLabel('Server HTML input', { exact: true }).fill(html);
  await expect(page.getByRole('list', { name: 'Server HTML conversion details' })).toContainText('Unmapped HTML block wrappers were removed');
  await expect.poll(async () => withoutNodeIds(await output.locator('pre').innerText())).toEqual(imported);

  // Paste the ORIGINAL unfamiliar HTML, not the already converted output, so
  // this independently exercises the browser clipboard importer.
  await page.evaluate(async html => navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }) })]), html);
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+v');
  await expect(editor.locator(':scope > h2')).toHaveText('Incident handover');
  await expect(editor.locator(':scope > p')).toHaveText(['First paragraph', 'Second paragraph', 'Handover complete.']);
  await expect(editor.locator(':scope > ul')).toHaveText('Check health');
  await expect(editor.locator('table td')).toHaveText('Evidence');
  await expect.poll(async () => withoutNodeIds(await output.locator('pre').innerText())).toEqual(imported);
  await editor.getByText('First paragraph', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Follow-up assigned.');
  await page.keyboard.press('Control+z');
  await expect(editor).not.toContainText('Follow-up assigned.');
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toContainText('Follow-up assigned.');
  const changed = withoutNodeIds(await output.locator('pre').innerText());
  await editor.scrollIntoViewIfNeeded();
  await capture(page, info, '22-wrapper-content-edited-as-real-blocks');
  await output.getByRole('button', { name: 'markdown', exact: true }).click();
  await output.locator('summary').click();
  await expect(output.getByText(/Pipe Markdown makes the first row column headers/)).toBeVisible();
  await output.getByRole('checkbox', { name: 'Keep table structure with HTML' }).check();
  const markdown = await output.locator('pre').innerText();
  await page.goto('/demos/node-markdown.html');
  await page.getByRole('checkbox', { name: 'Convert HTML blocks to rich content' }).check();
  await page.getByLabel('Markdown input', { exact: true }).fill(markdown);
  await expect.poll(async () => withoutNodeIds(await output.locator('pre').innerText())).toEqual(changed);
  expect(errors).toEqual([]);
});

test('one-column pipe Markdown remains an editable table through export and reimport', async ({ page, context }, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill('| Evidence |\n| :-: |\n| Check health |\n\nHandover complete.');
  const output = page.locator('.demo-output');
  await output.getByRole('button', { name: 'html', exact: true }).click();
  await expect(output.locator('pre')).toContainText('<th');
  const html = await output.locator('pre').innerText();
  await page.evaluate(async html => navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }) })]), html);
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+v');
  await expect(editor.locator('th')).toHaveText('Evidence');
  await expect(editor.locator('td')).toHaveText('Check health');
  await editor.getByText('Check health', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' — passed');
  await expect(editor.locator('td')).toHaveText('Check health — passed');
  const expected = withoutNodeIds(await output.locator('pre').innerText());
  await output.getByRole('button', { name: 'markdown', exact: true }).click();
  await expect(output.getByRole('checkbox', { name: 'Keep table structure with HTML' })).not.toBeChecked();
  const markdown = await output.locator('pre').innerText();
  await editor.scrollIntoViewIfNeeded();
  await capture(page, info, '23-one-column-table-and-pipe-export');
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill(markdown);
  await expect.poll(async () => withoutNodeIds(await output.locator('pre').innerText())).toEqual(expected);
});

test('rich table Markdown export keeps structure through the public controls', async ({ page, context }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/demos/node-markdown.html');
  const html = '<h1>Release checks</h1><table><tr><th colspan="2" data-colwidth="140,180"><p>Release checklist</p><p>Owner: Ada</p><ul><li>Run smoke tests</li><li>Keep rollback ready</li></ul><pre><code>npm test\n\nnpm run build</code></pre><table><tr><td>Nested evidence</td></tr></table></th></tr></table>';
  await page.getByRole('button', { name: 'Server HTML', exact: true }).click();
  await page.getByLabel('Server HTML input', { exact: true }).fill(html);
  const output = page.locator('.demo-output');
  await expect(output.locator('pre')).toContainText('table_header');
  const expected = withoutNodeIds(await output.locator('pre').innerText());
  await output.getByRole('button', { name: 'markdown', exact: true }).click();
  await output.locator('summary').click();
  await expect(output.getByText(/Multiple or non-paragraph cell blocks are flattened/)).toBeVisible();
  await output.getByRole('checkbox', { name: 'Keep table structure with HTML' }).check();
  await expect(output.getByText(/Table projected as HTML/)).toBeVisible();
  await output.scrollIntoViewIfNeeded();
  await capture(page, info, '19-html-table-markdown-choice-and-notes');
  const markdown = await output.locator('pre').innerText();
  expect(markdown).toContain('npm test&#10;&#10;npm run build');
  await output.getByRole('button', { name: 'Copy', exact: true }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  // Windows' plain-text clipboard may normalize physical LF separators to
  // CRLF. Encoded code newlines must remain exact in the restored document.
  expect(copied.replace(/\r\n/g, '\n')).toBe(markdown);
  await page.locator('.headless-input-tabs').getByRole('button', { name: 'Markdown', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Convert HTML blocks to rich content' }).check();
  await page.getByLabel('Markdown input', { exact: true }).fill(copied);
  await output.getByRole('button', { name: 'json', exact: true }).click();
  await expect.poll(async () => withoutNodeIds(await output.locator('pre').innerText())).toEqual(expected);
  await output.getByRole('button', { name: 'html', exact: true }).click();
  const restored = await output.locator('pre').innerText();
  await page.evaluate(async html => navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }) })]), restored);
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+v');
  await expect(editor.locator('table')).toHaveCount(2);
  await expect(editor.locator('pre')).toHaveText('npm test\n\nnpm run build');
  await expect(editor.locator('th').first()).toHaveAttribute('colspan', '2');
  await editor.getByText('Owner: Ada', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' approved');
  await expect(editor).toContainText('Owner: Ada approved');
  await editor.scrollIntoViewIfNeeded();
  await capture(page, info, '20-html-markdown-table-rendered-and-editable');
  expect(errors).toEqual([]);
});

test('structured table cells survive real copy, editing, and server HTML re-import', async ({ page, context }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const html = '<h1>Incident handover</h1><table><thead><tr><th>Actions and evidence</th></tr></thead><tbody><tr><td><p>First paragraph</p><p>Second paragraph</p><h3>Checks</h3><ul><li>Check health</li><li>Notify team</li></ul><blockquote><p>Keep the rollback image.</p></blockquote><table><tr><td>Nested evidence</td></tr></table></td></tr></tbody><tfoot><tr><td>Signed off by Ada</td></tr></tfoot></table>';
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill(html);
  await page.getByRole('checkbox', { name: 'Convert HTML blocks to rich content' }).check();
  const output = page.locator('.demo-output');
  await output.getByRole('button', { name: 'html', exact: true }).click();
  await expect(output.locator('pre')).toContainText('<h3>Checks</h3>');
  const converted = await output.locator('pre').innerText();
  await page.evaluate(async html => navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }) })]), converted);
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+v');
  const cell = editor.locator('td > .fountain-table-cell__content').first();
  await expect(cell.locator(':scope > p')).toHaveText(['First paragraph', 'Second paragraph']);
  await expect(editor.locator('table')).toHaveCount(2);
  await cell.getByText('First paragraph', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' reviewed');
  await page.keyboard.press('Control+z');
  await expect(cell.locator(':scope > p').first()).toHaveText('First paragraph');
  await page.keyboard.press('Control+Shift+z');
  await expect(cell.locator(':scope > p').first()).toHaveText('First paragraph reviewed');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Follow-up assigned.');
  await expect(cell.locator(':scope > p')).toHaveText(['First paragraph reviewed', 'Follow-up assigned.', 'Second paragraph']);
  await editor.scrollIntoViewIfNeeded();
  await capture(page, info, '16-table-cell-multiblock-editing');
  await output.getByRole('button', { name: 'json', exact: true }).click();
  const expected = withoutNodeIds(await output.locator('pre').innerText());
  await cell.getByText('Follow-up assigned.', { exact: true }).click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+c');
  const copied = await page.evaluate(async () => {
    for (const item of await navigator.clipboard.read()) {
      if (item.types.includes('text/html')) return (await item.getType('text/html')).text();
    }
    return '';
  });
  expect(copied).toContain('Incident handover');
  expect(copied).toContain('<h3>Checks</h3>');
  expect(copied).toContain('Signed off by Ada');
  await page.goto('/demos/node-markdown.html');
  await page.getByRole('button', { name: 'Server HTML', exact: true }).click();
  await page.getByLabel('Server HTML input', { exact: true }).fill(copied);
  await expect.poll(async () => withoutNodeIds(await output.locator('pre').innerText())).toEqual(expected);
  await capture(page, info, '17-table-cell-copied-html-reimport');
  await output.getByRole('button', { name: 'html', exact: true }).click();
  const reimported = await output.locator('pre').innerText();
  await page.evaluate(async html => navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }) })]), reimported);
  await page.goto('/demos/go-docs-service.html');
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+v');
  await expect.poll(async () => withoutNodeIds(await output.locator('pre').innerText())).toEqual(expected);
  await expect(editor.locator('table')).toHaveCount(2);
  await editor.getByText('Signed off by Ada', { exact: true }).scrollIntoViewIfNeeded();
  await capture(page, info, '18-table-nesting-and-footer-after-reimport');
  expect(errors).toEqual([]);
});

test('comment-only HTML does not create editable blank paragraphs during conversion', async ({ page, context }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill('# Review note\n\nBefore\n\n<!-- internal separator -->\n\nAfter');
  await page.getByRole('checkbox', { name: 'Convert HTML blocks to rich content' }).check();
  const output = page.locator('.demo-output');
  await expect(async () => expect(JSON.parse(await output.locator('pre').innerText()).content).toHaveLength(3)).toPass();
  await output.getByRole('button', { name: 'html', exact: true }).click();
  const html = await output.locator('pre').innerText();
  await page.evaluate(async html => navigator.clipboard.write([new ClipboardItem({
    'text/html': new Blob([html], { type: 'text/html' }),
  })]), html);
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+v');
  await expect(editor.locator(':scope > p')).toHaveCount(2);
  await editor.getByText('Before', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(editor.locator(':scope > p')).toHaveCount(3);
  await page.keyboard.type('Author-added paragraph');
  await expect(editor).toContainText('Author-added paragraph');
  await capture(page, info, 'html-comment-fragment-edited');
  await page.keyboard.press('Control+z');
  await expect(editor).not.toContainText('Author-added paragraph');
  await page.keyboard.press('Control+z');
  await expect(editor.locator(':scope > p')).toHaveCount(2);
  await capture(page, info, 'html-comment-fragment-restored');
  expect(errors).toEqual([]);
});

test('split HTML table becomes a real editable table with history and export', async ({ page, context }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill('# Experiment results\n\n<table>\n\n<tr><th>Sample</th><th>Value</th></tr>\n\n<tr>\n\n<td>Alpha</td><td>42</td>\n\n</tr>\n\n</table>\n\nReviewed by Ada.');
  await page.getByRole('checkbox', { name: 'Convert HTML blocks to rich content' }).check();
  const output = page.locator('.demo-output');
  await expect(output.locator('pre')).toContainText('table_cell');
  await output.getByRole('button', { name: 'html', exact: true }).click();
  const html = await output.locator('pre').innerText();
  await page.evaluate(async html => navigator.clipboard.write([new ClipboardItem({
    'text/html': new Blob([html], { type: 'text/html' }),
  })]), html);
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+v');
  await expect(editor.locator('table tr')).toHaveCount(2);
  await expect(editor.locator('table th')).toHaveText(['Sample', 'Value']);
  const value = editor.locator('table td').nth(1);
  await value.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' verified');
  await expect(value).toHaveText('42 verified');
  await capture(page, info, 'html-flow-table-edited');
  await page.keyboard.press('Control+z');
  await expect(value).toHaveText('42');
  await page.keyboard.press('Control+Shift+z');
  await expect(value).toHaveText('42 verified');
  await output.getByRole('button', { name: 'markdown', exact: true }).click();
  await expect(output.locator('pre')).toContainText('42 verified');
  await capture(page, info, 'html-flow-table-exported');
  expect(errors).toEqual([]);
});

test('legacy section order matches native rendering through paste edit history and reopen', async ({ page, context }, info) => {
  const source = '<table><tfoot><tr><td>Total</td><td>30</td></tr></tfoot><tbody><tr><td>Build</td><td>10</td></tr><tr><td>Deploy</td><td>20</td></tr></tbody><thead><tr><th scope="col">Stage</th><th scope="col">Minutes</th></tr></thead></table>';
  await page.setContent(`<style>body{font:18px system-ui;padding:48px}table{border-collapse:collapse;width:650px}td,th{border:1px solid #bbb;padding:16px;text-align:left}</style><h1>Browser-rendered source</h1><p>Source markup places the footer first and the header last.</p>${source}`);
  const expected = await page.locator('tr').evaluateAll(rows => rows.map(row => ({ y: row.getBoundingClientRect().top, text: row.textContent })).sort((a, b) => a.y - b.y).map(row => row.text));
  expect(expected).toEqual(['StageMinutes', 'Build10', 'Deploy20', 'Total30']);
  await capture(page, info, 'native-source-table');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/demos/go-docs-service.html');
  await page.evaluate(async html => navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }) })]), source);
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+v');
  await expect(editor.locator('tr')).toHaveText(expected);
  await capture(page, info, 'imported-table-matches-source-order');
  await editor.getByText('Build', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' checked');
  await page.keyboard.press('Control+z');
  await expect(editor.locator('tr')).toHaveText(expected);
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toContainText('Build checked');
  const output = page.locator('.demo-output');
  await output.getByRole('button', { name: 'html', exact: true }).click();
  await capture(page, info, 'table-order-edited-and-exported');
  const exported = await output.locator('pre').innerText();
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill(exported);
  await page.getByRole('checkbox', { name: 'Convert HTML blocks to rich content' }).check();
  await expect(async () => {
    const table = JSON.parse(await output.locator('pre').innerText()).content[0];
    const text = (node: { text?: string; content?: unknown[] }): string => node.text ?? (node.content ?? []).map(child => text(child as typeof node)).join('');
    expect(table.content.map(text)).toEqual(['StageMinutes', 'Build checked10', 'Deploy20', 'Total30']);
  }).toPass();
});

test('row-group merged ownership cells survive real paste editing history and HTML reopen', async ({ page, context }, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const source = '<h2>Release ownership</h2><table><tbody><tr><td rowspan="0">Ada</td><td>Build</td></tr><tr><td>Deploy</td></tr></tbody><tbody><tr><td rowspan="0">Grace</td><td>Review</td></tr><tr><td>Approve</td></tr></tbody></table>';
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill(source);
  await page.getByRole('checkbox', { name: 'Convert HTML blocks to rich content' }).check();
  await expect(page.getByRole('list', { name: 'Markdown HTML conversion details' })).toContainText('Zero rowspan');
  await page.evaluate(async html => navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }) })]), source);
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+v');
  await expect(editor.locator('td[rowspan="2"]')).toHaveCount(2);
  await editor.getByText('Build', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' verified');
  await expect(editor).toContainText('Build verified');
  await page.keyboard.press('Control+z');
  await expect(editor).not.toContainText('Build verified');
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toContainText('Build verified');
  const output = page.locator('.demo-output');
  await output.getByRole('button', { name: 'html', exact: true }).click();
  await capture(page, info, 'merged-ownership-edited-and-exported');
  const exported = await output.locator('pre').innerText();
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill(exported);
  await page.getByRole('checkbox', { name: 'Convert HTML blocks to rich content' }).check();
  await expect(async () => {
    const table = JSON.parse(await output.locator('pre').innerText()).content[1];
    expect(table.content[0].content[0].attrs.rowspan).toBe(2);
    expect(table.content[2].content[0].attrs.rowspan).toBe(2);
  }).toPass();
  await expect(output.locator('pre')).toContainText('Build verified');
});

test('failed HTML flow keeps literal closing tags through paste editing undo and export', async ({ page, context }, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/demos/node-markdown.html');
  const source = '# Import recovery\n\n<table><tr><td>\n<pre>\n**Hello**,\n\n_world_.\n</pre>\n</td></tr></table>';
  await page.getByLabel('Markdown input', { exact: true }).fill(source);
  await page.getByRole('checkbox', { name: 'Convert HTML blocks to rich content' }).check();
  await page.getByRole('checkbox', { name: 'Convert inline HTML formatting' }).check();
  await expect(page.getByRole('list', { name: 'Markdown HTML conversion details' })).toContainText('protected Markdown block');
  const output = page.locator('.demo-output');
  await expect(output.locator('pre')).toContainText('</pre>');
  await capture(page, info, 'fallback-warning-and-preserved-source');
  await output.getByRole('button', { name: 'html', exact: true }).click();
  const html = await output.locator('pre').innerText();
  await page.evaluate(async html => navigator.clipboard.write([new ClipboardItem({
    'text/html': new Blob([html], { type: 'text/html' }),
  })]), html);
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+v');
  await expect(editor).toContainText('</pre>');
  const paragraph = editor.locator('p').filter({ hasText: 'world' });
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' recovered');
  await expect(paragraph).toContainText('</pre> recovered');
  await page.keyboard.press('Control+z');
  await expect(paragraph).toContainText('</pre>');
  await expect(paragraph).not.toContainText('recovered');
  await page.keyboard.press('Control+Shift+z');
  await expect(paragraph).toContainText('</pre> recovered');
  await output.getByRole('button', { name: 'markdown', exact: true }).click();
  await expect(output.locator('pre')).toContainText('pre');
  await capture(page, info, 'literal-fallback-edited-and-exported');
  const exported = await output.locator('pre').innerText();
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill(exported);
  await expect(output.locator('pre')).toContainText('</pre> recovered');
});

test('HTML deletion scope remains formatted through editing history and Markdown export', async ({ page, context }, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill('# Editorial review\n\n<del>\n\n*Previous recommendation*\n\n</del>\n\nCurrent recommendation.');
  await page.getByRole('checkbox', { name: 'Convert HTML blocks to rich content' }).check();
  const output = page.locator('.demo-output');
  await expect(output.locator('pre')).toContainText('strike');
  await output.getByRole('button', { name: 'html', exact: true }).click();
  const html = await output.locator('pre').innerText();
  await page.evaluate(async html => navigator.clipboard.write([new ClipboardItem({
    'text/html': new Blob([html], { type: 'text/html' }),
  })]), html);
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+v');
  const deletion = editor.locator('s, del');
  await expect(deletion).toHaveText('Previous recommendation');
  await deletion.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' revised');
  await expect(deletion).toHaveText('Previous recommendation revised');
  await page.keyboard.press('Control+z');
  await expect(deletion).toHaveText('Previous recommendation');
  await page.keyboard.press('Control+Shift+z');
  await expect(deletion).toHaveText('Previous recommendation revised');
  await output.getByRole('button', { name: 'markdown', exact: true }).click();
  await expect(output.locator('pre')).toContainText('revised');
  await capture(page, info, 'html-flow-formatting-edited');
});

test('opt-in HTML block conversion becomes editable content and survives canonical export', async ({ page, context }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/demos/node-markdown.html');
  const source = '# Imported incident\n\n<div><h2>Response plan</h2><p><strong>Owner:</strong> Ada &amp; Grace</p><ul><li>Check health</li><li>Notify team</li></ul></div>\n\nOutside paragraph.';
  await page.getByLabel('Markdown input', { exact: true }).fill(source);
  const output = page.locator('.demo-output');
  await output.getByRole('button', { name: 'html', exact: true }).click();
  await expect(output.locator('pre')).toContainText('&lt;div&gt;');
  await page.getByRole('checkbox', { name: 'Convert HTML blocks to rich content' }).check();
  await expect(output.locator('pre')).toContainText('<h2');
  await expect(output.locator('pre')).not.toContainText('&lt;div&gt;');
  await capture(page, info, '14-opt-in-html-block-conversion');
  const html = await output.locator('pre').innerText();
  await page.evaluate(async html => navigator.clipboard.write([new ClipboardItem({
    'text/html': new Blob([html], { type: 'text/html' }),
  })]), html);
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+v');
  await expect(editor.getByRole('heading', { name: 'Response plan' })).toBeVisible();
  await expect(editor.locator('ul > li')).toHaveCount(2);
  await editor.getByText('Check health', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' and latency');
  await expect(editor).toContainText('Check health and latency');
  await page.keyboard.press('Control+z');
  await expect(editor).not.toContainText('and latency');
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toContainText('Check health and latency');
  await editor.scrollIntoViewIfNeeded();
  await capture(page, info, '15-converted-html-edited-as-document');
  await output.getByRole('button', { name: 'json', exact: true }).click();
  const expected = withoutNodeIds(await output.locator('pre').innerText());
  await output.getByRole('button', { name: 'markdown', exact: true }).click();
  const markdown = await output.locator('pre').innerText();
  expect(markdown).toContain('## Response plan');
  expect(markdown).not.toContain('<div>');
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill(markdown);
  await expect.poll(async () => withoutNodeIds(await output.locator('pre').innerText())).toEqual(expected);
  expect(errors).toEqual([]);
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

test('empty formatting survives conversion and controls the next typed text', async ({ page, context }, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const source = '# Styled template\n\n<span data-fountain-text-style="true" style=""><strong></strong></span>\n\nAfter';
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill(source);
  const output = page.locator('.demo-output');
  const original = withoutNodeIds(await output.locator('pre').innerText());
  await output.getByRole('button', { name: 'markdown', exact: true }).click();
  expect(await output.locator('pre').innerText()).toContain('<strong></strong>');
  await output.getByRole('button', { name: 'html', exact: true }).click();
  const html = await output.locator('pre').innerText();
  await page.evaluate(async html => navigator.clipboard.write([new ClipboardItem({
    'text/html': new Blob([html], { type: 'text/html' }),
  })]), html);
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+v');
  await expect.poll(async () => withoutNodeIds(await output.locator('pre').innerText())).toEqual(original);
  const blank = editor.locator(':scope > p').first();
  await expect(blank).toHaveText('');
  await blank.click();
  await page.keyboard.type('This inherits bold.');
  await expect(blank.locator('strong')).toHaveText('This inherits bold.');
  await capture(page, info, '12-typed-into-preserved-empty-formatting');
  await page.keyboard.press('Control+z');
  await expect(blank).toHaveText('');
  await expect.poll(async () => withoutNodeIds(await output.locator('pre').innerText())).toEqual(original);
  await output.getByRole('button', { name: 'markdown', exact: true }).click();
  const markdown = await output.locator('pre').innerText();
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill(markdown);
  await expect.poll(async () => withoutNodeIds(await output.locator('pre').innerText())).toEqual(original);
  await capture(page, info, '13-empty-formatting-restored-and-reimported');
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
