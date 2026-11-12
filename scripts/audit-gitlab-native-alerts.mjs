import { expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export async function auditNativeAlerts({ page, editor, toolbar, output, report }) {
  const screenshot = name => page.screenshot({ path: fileURLToPath(new URL(name, output)), fullPage: true, caret: 'initial' });
  const alert = editor.locator('[data-fountain-gitlab-alert]').first();
  const title = alert.locator('[data-fountain-gitlab-alert-title]');
  const menu = toolbar.getByTestId('native-alert-menu');
  const kind = menu.getByRole('combobox', { name: 'Alert type' });
  await editor.getByText('Recovered paste', { exact: true }).click();
  await page.keyboard.press('End');
  await menu.getByRole('button', { name: 'Insert alert' }).click();
  await expect(alert).toBeVisible();
  await page.keyboard.type('Deployment procedure ready.');
  await expect(alert).toContainText('Deployment procedure ready.');
  for (const [value, label] of [['note', 'Note'], ['tip', 'Tip'], ['important', 'Important'], ['warning', 'Warning'], ['caution', 'Caution']]) {
    await kind.selectOption(value);
    await expect(alert).toHaveAttribute('data-fountain-gitlab-alert', value);
    await expect(title).toHaveAttribute('data-fountain-default-title', label);
    expect(await title.evaluate(node => getComputedStyle(node, '::before').content)).toBe(JSON.stringify(label));
    await expect(title).toHaveText('');
  }
  report.checks.push('Actual toolbar inserts an editable alert and all five kinds update the generated visible title without storing a fake custom title');
  await title.click(); await page.keyboard.press('Control+b'); await page.keyboard.type('Tip');
  await expect(title).toHaveText('Tip');
  await expect(title.locator('strong')).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: 'Bold', exact: true })).toBeDisabled();
  await expect(toolbar.getByRole('button', { name: 'Insert or edit link', exact: true })).toBeDisabled();
  await kind.selectOption('warning'); await expect(title).toHaveText('Tip');
  await title.click(); await page.keyboard.press('Home'); await page.keyboard.press('Shift+End');
  await page.keyboard.type('Deployment status'); await expect(title).toHaveText('Deployment status');
  await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await page.keyboard.type('Rollback owner: Ada.');
  await expect(alert).toContainText('Rollback owner: Ada.');
  await expect(alert).toContainText('Deployment procedure ready.');
  await screenshot('alert-custom-title.png');
  report.checks.push('Actual title editing preserves explicit default words, disables incompatible formatting and links, and Enter moves into the body without losing existing text');
  await menu.getByRole('button', { name: 'Convert alert to text' }).click();
  await expect(editor.locator('[data-fountain-gitlab-alert]')).toHaveCount(0);
  await expect(editor.getByText('Deployment status', { exact: true })).toBeVisible();
  await toolbar.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(title).toHaveText('Deployment status');
  await menu.getByRole('button', { name: 'Delete alert', exact: true }).click();
  await expect(editor.locator('[data-fountain-gitlab-alert]')).toHaveCount(0);
  await toolbar.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(title).toHaveText('Deployment status');
  report.checks.push('Actual Convert to text and Delete alert retain their distinct behavior and both restore the complete title/body through one-step undo');
  await editor.getByText('Recovered paste', { exact: true }).click(); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  const source = '- > [!tip] Nested deployment\n  >\n  > Nested body.\n  >\n  > ```math\n  > a^2+b^2=c^2\n  > ```\n  >\n  > ```python\n  > print("ready")\n  > ```\n- Neighbor alert item';
  await page.evaluate(value => navigator.clipboard.writeText(value), source);
  const rendered = page.waitForResponse(response => {
    if (response.request().method() !== 'POST' || !response.ok()) return false;
    try { return response.request().postDataJSON()?.text === source; } catch { return false; }
  });
  await toolbar.getByRole('button', { name: 'Paste Markdown', exact: true }).click();
  report.nativeAlertRendering = (await (await rendered).json()).body;
  const list = editor.locator('ul').filter({ hasText: 'Neighbor alert item' });
  const nested = list.locator('[data-fountain-gitlab-alert]');
  await expect(nested).toBeVisible();
  await expect(nested.locator('.katex')).toBeVisible();
  await expect(nested.locator('pre')).toContainText('print("ready")');
  await nested.getByText('Nested body.', { exact: true }).click();
  await kind.selectOption('important');
  await menu.getByRole('button', { name: 'Delete alert', exact: true }).click();
  await expect(nested).toHaveCount(0);
  await expect(list.locator(':scope > li')).toHaveCount(2);
  await expect(list.getByText('Neighbor alert item', { exact: true })).toBeVisible();
  await toolbar.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(nested).toHaveAttribute('data-fountain-gitlab-alert', 'important');
  await expect(nested.locator('.katex')).toBeVisible();
  await screenshot('alert-nested-math-code.png');
  report.nativeAlerts = { customTitle: 'Deployment status', kind: 'warning', body: ['Rollback owner: Ada.', 'Deployment procedure ready.'],
    nestedTitle: 'Nested deployment', nestedKind: 'important', nestedFormula: 'a^2+b^2=c^2', nestedCode: 'print("ready")' };
  report.checks.push('Actual GitLab renderer imports a list-nested alert containing fenced math and code; kind change, full removal and undo preserve both typed blocks and its neighboring item');
}

export async function assertSavedNativeAlerts({ page, description, report, output, phase }) {
  // Exercise GitLab's real long-description expansion before comparing its full reader.
  const expand = page.getByTestId('show-all-btn');
  if (await expand.isVisible()) await expand.click();
  const state = report.nativeAlerts;
  expect(description).toContain(`[!${state.kind}] ${state.customTitle}`);
  for (const body of state.body) expect(description).toContain(body);
  expect(description).toContain(`[!${state.nestedKind}] ${state.nestedTitle}`);
  expect(description).toContain('  > ```math\n  > ' + state.nestedFormula + '\n  > ```');
  expect(description).toContain('  > ```python\n  > ' + state.nestedCode + '\n  > ```');
  const root = page.locator('main .markdown-alert-warning').filter({ has: page.locator('.markdown-alert-title', { hasText: state.customTitle }) });
  await expect(root).toBeVisible(); for (const body of state.body) await expect(root).toContainText(body);
  const nested = page.locator('main .markdown-alert-important').filter({ has: page.locator('.markdown-alert-title', { hasText: state.nestedTitle }) });
  await expect(nested).toBeVisible(); await expect(nested.locator('.katex')).toBeVisible();
  await expect(nested.locator('pre')).toContainText(state.nestedCode);
  await root.scrollIntoViewIfNeeded(); await expect(root).toBeInViewport();
  if (output && phase) await page.screenshot({ path: fileURLToPath(new URL(`alert-reader-${phase}.png`, output)), fullPage: true });
}
