import { expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

export async function auditNativeQuickActions({ page, editor, toolbar, output, report, api, project, issue }) {
  page.on('response', async response => {
    if (response.request().method() !== 'POST' || !response.url().includes('/api/graphql')) return;
    let data;
    try { data = (await response.json()).data?.workItemUpdate; } catch { return; }
    if (!data?.workItem) return;
    report.nativeQuickActionMutations ??= [];
    report.nativeQuickActionMutations.push({ description: data.workItem.widgets?.find(widget => widget.type === 'DESCRIPTION')?.description,
      errors: data.errors });
  });
  const label = 'Fountain quick action & review';
  const labels = await api('GET', `/projects/${project.id}/labels?search=Fountain%20quick%20action`);
  if (!labels.some(item => item.name === label)) await api('POST', `/projects/${project.id}/labels`, {
    data: { name: label, color: '#6699cc' },
  });
  const before = await api('GET', `/projects/${project.id}/issues/${issue.iid}`);
  expect(before.state).toBe('opened'); expect(before.labels).not.toContain(label);
  const originalText = await editor.innerText();
  await page.keyboard.press('End'); await page.keyboard.press('Enter');
  const source = `/label ~"${label}"\n[retained]: https://example.com\n\nSee [help][retained]\n\n> [!note] Note\n>\n> Explicit title after a quick action.\n\n\`\`\`yaml frontmatter\ntitle: Paper after a quick action\n\`\`\`\n\n\\/close`;
  await page.evaluate(text => navigator.clipboard.writeText(text), source);
  await toolbar.getByRole('button', { name: 'Paste Markdown', exact: true }).click();
  await expect(editor.getByText('/close', { exact: true })).toBeVisible();
  await expect(editor.getByRole('link', { name: label, exact: true })).toBeVisible();
  await expect(editor.getByRole('link', { name: 'help', exact: true })).toHaveAttribute('href', 'https://example.com');
  await expect(editor.locator('[data-fountain-node="gitlab_alert_title"]')).toHaveText('Note');
  await expect(editor.locator('pre[data-fountain-node="code_block"]')).toContainText('title: Paper after a quick action');
  await toolbar.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(editor.getByText('/close', { exact: true })).toHaveCount(0);
  expect((await editor.innerText()).trim()).toBe(originalText.trim());
  await toolbar.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(editor.getByText('/close', { exact: true })).toBeVisible();
  await editor.getByText('/close', { exact: true }).click();
  await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await editor.pressSequentially('Edited after importing quick actions and literal text.');
  const wrapper = page.getByTestId('work-item-description-wrapper');
  await wrapper.getByRole('button', { name: 'Switch to plain text editing', exact: true }).click();
  const field = wrapper.locator('textarea'); await expect(field).toBeVisible();
  const canonical = await field.inputValue();
  expect(canonical).toContain(`/label ~"${label}"`);
  expect(canonical).toContain('\\/close');
  expect(canonical).toContain('[help](https://example.com)');
  expect(canonical).toContain('> [!note] Note');
  expect(canonical).toContain('```yaml frontmatter\ntitle: Paper after a quick action\n```');
  expect(canonical).not.toContain('&#10;');
  await page.screenshot({ path: fileURLToPath(new URL('quick-actions-source.png', output)), fullPage: true });
  await wrapper.getByRole('button', { name: 'Switch to rich text editing', exact: true }).click();
  await expect(editor.getByText('/close', { exact: true })).toBeVisible();
  expect((await api('GET', `/projects/${project.id}/issues/${issue.iid}`)).labels).not.toContain(label);
  expect((await api('GET', `/projects/${project.id}/issues/${issue.iid}`)).state).toBe('opened');
  const install = JSON.parse(await readFile(new URL('../artifacts/gitlab-native-browser-install/install.json', import.meta.url)));
  const require = createRequire(install.source + '/storybook/package.json');
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const accessibility = await wrapper.evaluate(element => window.axe.run(element));
  expect(accessibility.violations).toEqual([]);
  await editor.getByText('/close', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: fileURLToPath(new URL('quick-actions-rich.png', output)), fullPage: true });
  report.nativeQuickActions = { label, canonical, accessibilityViolations: accessibility.violations };
  report.checks.push('Actual clipboard import of a label command, following reference definition, explicit alert title, fenced metadata and literal slash is editable and atomically undoable; source/rich switching retains source without running the command');
}

export async function assertSavedNativeQuickActions({ page, saved, report, output, phase }) {
  expect(saved.labels).toContain(report.nativeQuickActions.label);
  expect(saved.state).toBe('opened');
  expect(saved.description).toContain('\\/close');
  expect(saved.description).toContain('[help](https://example.com)');
  expect(saved.description).toContain('> [!note] Note');
  expect(saved.description).toContain('```yaml frontmatter\ntitle: Paper after a quick action\n```');
  expect(saved.description).not.toContain('/label');
  await expect(page.getByText('/close', { exact: true })).toBeVisible();
  await page.getByTestId('work-item-edit-form-button').click();
  const wrapper = page.getByTestId('work-item-description-wrapper');
  const editor = wrapper.locator('.fountain-editor[contenteditable="true"]');
  await expect(editor.getByText('/close', { exact: true })).toBeVisible();
  await expect(editor.locator('[data-fountain-node="gitlab_alert_title"]')).toHaveText('Note');
  await expect(editor.locator('pre[data-fountain-node="code_block"]')).toContainText('title: Paper after a quick action');
  await wrapper.getByRole('button', { name: 'Switch to plain text editing', exact: true }).click();
  const source = wrapper.getByTestId('markdown-editor-form-field');
  await expect(source).toBeVisible();
  report.nativeQuickActionReopenReads ??= [];
  const conflict = wrapper.getByTestId('conflicted-description');
  report.nativeQuickActionReopenReads.push({ phase, initialSource: await source.inputValue(), serverSource: saved.description,
    conflictSource: await conflict.count() ? await conflict.inputValue() : null });
  expect(await source.inputValue()).toBe(saved.description);
  await expect(wrapper.getByTestId('conflicted-description')).toHaveCount(0);
  await wrapper.getByRole('button', { name: 'Switch to rich text editing', exact: true }).click();
  await expect(editor.getByText('/close', { exact: true })).toBeVisible();
  await editor.getByText('/close', { exact: true }).click();
  await page.keyboard.press('End'); await page.keyboard.type(' remains literal');
  await wrapper.getByRole('button', { name: 'Switch to plain text editing', exact: true }).click();
  await expect(source).toBeVisible();
  expect(await source.inputValue()).toContain('\\/close remains literal');
  await expect(wrapper.getByTestId('conflicted-description')).toHaveCount(0);
  await page.screenshot({ path: fileURLToPath(new URL(`quick-actions-reopened-${phase}.png`, output)), fullPage: true });
  await wrapper.getByRole('button', { name: 'Switch to rich text editing', exact: true }).click();
  await expect(editor.getByText('/close remains literal', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByTestId('work-item-edit-form-button')).toBeVisible();
  report.nativeQuickActionPhases ??= []; report.nativeQuickActionPhases.push(phase);
  report.checks.push(`Normal GitLab submit applies the label and consumes its command; the escaped close stays inert and remains escaped on a later native edit (${phase})`);
}
