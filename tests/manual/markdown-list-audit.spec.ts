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
