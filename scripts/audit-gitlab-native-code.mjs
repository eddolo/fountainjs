import { expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export async function auditNativeCode({ page, editor, toolbar, output, report }) {
  const text = 'const total = 42;\nconsole.log(total);';
  const source = '```javascript\n' + text + '\n```\n\n- ```js\n  Nested console\n  ```\n- Neighbor item';
  const code = editor.locator('pre').filter({ hasText: 'const total = 42;' });
  const controls = toolbar.getByRole('region', { name: 'Code block controls' });
  const language = controls.getByRole('combobox', { name: 'Code language' });
  const screenshot = name => page.screenshot({ path: fileURLToPath(new URL(name, output)), fullPage: true, caret: 'initial' });
  await editor.getByText('Recovered paste', { exact: true }).click();
  await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await page.evaluate(value => navigator.clipboard.writeText(value), source);
  const rendered = page.waitForResponse(response => {
    if (response.request().method() !== 'POST' || !response.ok()) return false;
    try { return response.request().postDataJSON()?.text === source; }
    catch { return false; }
  });
  await toolbar.getByRole('button', { name: 'Paste Markdown', exact: true }).click();
  report.nativeCodeRendering = (await (await rendered).json()).body;
  await expect(code).toBeVisible(); await code.locator('code').click();
  await expect(language).toHaveValue('javascript');
  expect((await code.locator('code').textContent()).replace(/\n$/u, '')).toBe(text);
  await language.fill('python'); await controls.getByRole('button', { name: 'Apply language' }).click();
  await expect(code).toHaveAttribute('data-language', 'python');
  await toolbar.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(code).toHaveAttribute('data-language', 'javascript');
  await toolbar.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(code).toHaveAttribute('data-language', 'python');
  report.checks.push('Actual GitLab-rendered multiline highlighted code imports, changes language and restores through one-step undo/redo');

  await controls.getByRole('button', { name: 'Copy code', exact: true }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.replace(/\n$/u, '')).toBe(text);
  expect(copied).toBe(await code.locator('code').textContent());
  await expect(controls.getByRole('status')).toHaveText('Code copied.');
  await language.fill('two words'); await controls.getByRole('button', { name: 'Apply language' }).click();
  await expect(controls.getByRole('alert')).toContainText('language label');
  await expect(language).toHaveValue('two words'); await expect(code).toHaveAttribute('data-language', 'python');
  await screenshot('code-invalid-draft.png');
  await language.fill('my-company-dsl'); await language.press('Escape');
  await expect(language).toHaveValue('python');
  expect(await editor.evaluate(element => element.contains(document.activeElement))).toBe(true);
  report.checks.push('Real browser clipboard copies the complete code source; invalid/custom drafts and Escape preserve the code and restore editor focus');

  const before = await code.locator('code').textContent();
  await controls.getByRole('button', { name: 'Delete code block' }).click(); await expect(code).toHaveCount(0);
  await toolbar.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(code).toBeVisible(); await expect(code).toHaveAttribute('data-language', 'python');
  expect(await code.locator('code').textContent()).toBe(before);
  await code.locator('code').click(); await page.keyboard.press('End');
  await page.keyboard.type(' // reviewed'); await expect(code).toContainText('// reviewed');
  await screenshot('code-edited.png');
  report.nativeCode = { originalText: text, copiedText: copied, language: 'python',
    finalText: await code.locator('code').textContent() };
  report.checks.push('Delete removes the full code block, undo restores it, and actual browser typing edits the restored code in place');

  const list = editor.locator('ul').filter({ hasText: 'Neighbor item' });
  const nested = list.locator('pre').filter({ hasText: 'Nested console' });
  await nested.locator('code').click(); await expect(language).toHaveValue('js');
  await controls.getByRole('button', { name: 'Delete code block' }).click();
  await expect(nested).toHaveCount(0); await expect(list.locator(':scope > li')).toHaveCount(2);
  await toolbar.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(nested).toBeVisible();
  await toolbar.getByRole('button', { name: 'Redo', exact: true }).click(); await expect(nested).toHaveCount(0);
  await page.keyboard.type('Replaced nested code');
  await expect(list.locator(':scope > li').nth(0)).toHaveText('Replaced nested code');
  await expect(list.locator(':scope > li').nth(0)).toBeInViewport();
  await expect(list.locator(':scope > li').nth(1)).toHaveText('Neighbor item');
  await screenshot('code-nested-removal.png');
  report.nativeCode.nestedReplacement = 'Replaced nested code';
  report.checks.push('Actual nested code deletion/undo/redo retains its list and neighboring item; browser typing lands in the replacement paragraph and the result remains in the viewport');
}
