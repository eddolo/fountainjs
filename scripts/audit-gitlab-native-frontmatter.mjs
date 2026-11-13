import { expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

export async function auditNativeFrontmatter({ page, editor, toolbar, output, report }) {
  const header = editor.locator('pre[data-fountain-gitlab-frontmatter]');
  const controls = page.getByRole('region', { name: 'Code block controls', exact: true });
  const format = controls.getByRole('combobox', { name: 'Frontmatter format', exact: true });
  const dialog = () => page.getByRole('dialog', { name: 'Frontmatter source', exact: true });
  const field = () => dialog().getByRole('textbox', { name: 'Frontmatter source', exact: true });
  const screenshot = name => page.screenshot({ path: fileURLToPath(new URL(name, output)), fullPage: true, caret: 'initial', animations: 'disabled' });
  const open = async () => { await controls.getByRole('button', { name: 'Edit frontmatter source', exact: true }).click(); await expect(field()).toBeVisible(); };
  const apply = async text => { await field().fill(text); await dialog().getByRole('button', { name: 'Apply frontmatter source', exact: true }).click(); await expect(dialog()).toBeHidden(); };
  const undo = () => toolbar.getByRole('button', { name: 'Undo', exact: true }).click();
  const redo = () => toolbar.getByRole('button', { name: 'Redo', exact: true }).click();
  const before = await editor.innerText();
  await toolbar.getByRole('button', { name: 'Insert frontmatter', exact: true }).click();
  await expect(header).toBeVisible(); await expect(format).toHaveValue('yaml');
  await expect(toolbar.getByRole('combobox', { name: 'Text style', exact: true })).toHaveValue('frontmatter');
  for (const name of ['Insert a quote', 'Bullet list', 'Numbered list', 'Checklist', 'Bold'])
    await expect(toolbar.getByRole('button', { name, exact: true })).toBeDisabled();
  await expect(toolbar.getByRole('button', { name: 'Insert frontmatter', exact: true })).toBeDisabled();
  expect((await editor.innerText()).includes(before)).toBe(true);
  const text = 'title: "Fountain research & <review>"\n# Keep author comments\ntags:\n  - reproducibility\n  - 研究';
  await open(); await apply(text);
  await expect(header).toContainText('Keep author comments');
  await undo(); await expect(header).toHaveText(''); await redo(); await expect(header).toContainText(text);
  report.checks.push('Real toolbar inserts first-root YAML without replacing body content; native source Apply, Undo and Redo preserve comments, literal markup and Unicode');
  await header.locator('code').click(); await page.keyboard.press('Control+a');
  await expect(toolbar.getByRole('button', { name: 'Bold', exact: true })).toBeDisabled();
  await page.keyboard.press('Control+b');
  await header.locator('code').click(); await open(); await expect(field()).toHaveValue(text);
  await dialog().getByRole('button', { name: 'Cancel source edit', exact: true }).click();

  await open();
  const bad = text + '\n---\nThis would be outside the header';
  await field().fill(bad); await dialog().getByRole('button', { name: 'Apply frontmatter source', exact: true }).click();
  await expect(dialog().getByRole('alert')).toContainText('delimiter on its own line');
  await expect(field()).toHaveValue(bad); await expect(header).not.toContainText('This would be outside');
  await screenshot('frontmatter-retained-delimiter-draft.png');
  await dialog().getByRole('button', { name: 'Cancel source edit', exact: true }).click();
  await expect(dialog()).toBeHidden();
  report.checks.push('A premature header delimiter is refused atomically; the visible draft is retained and Cancel leaves the document unchanged');

  for (const [language, value] of [['toml', 'title = "Research"\n# TOML comment'], ['json', '{ "title": "Research", "verified": true }']]) {
    await format.fill(language); await controls.getByRole('button', { name: 'Apply frontmatter format', exact: true }).click();
    await expect(header).toHaveAttribute('data-language', language);
    await open(); await expect(field()).toHaveValue(text); await apply(value);
    await expect(header).toContainText(value); await screenshot(`frontmatter-${language}-source.png`);
    await undo(); await undo(); await expect(header).toHaveAttribute('data-language', 'yaml');
    await open(); await expect(field()).toHaveValue(text);
    await dialog().getByRole('button', { name: 'Cancel source edit', exact: true }).click();
  }
  report.checks.push('Real TOML and JSON format/source controls retain text rather than pretending to translate syntax; two deliberate edits undo back to exact YAML');

  await header.locator('code').click(); await page.keyboard.press('End');
  await page.keyboard.type(' # browser edit'); await expect(header).toContainText('# browser edit');
  await undo(); await expect(header).not.toContainText('# browser edit');
  await controls.getByRole('button', { name: 'Copy code', exact: true }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(text);
  await controls.getByRole('button', { name: 'Delete code block', exact: true }).click();
  await expect(header).toHaveCount(0); await undo(); await expect(header).toContainText(text);
  await header.locator('code').click();
  await controls.getByRole('button', { name: 'Convert to regular code block', exact: true }).click();
  await expect(header).toHaveCount(0); await undo(); await expect(header).toContainText(text);
  report.checks.push('Browser typing, exact clipboard copy, full-header deletion and explicit regular-code conversion work with one-step undo');

  await header.locator('code').click(); await open();
  const installed = JSON.parse(await readFile(new URL('../artifacts/gitlab-native-browser-install/install.json', import.meta.url)));
  const require = createRequire(installed.source + '/storybook/package.json');
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const accessibility = await dialog().evaluate(element => window.axe.run(element));
  expect(accessibility.violations).toEqual([]);
  const viewport = page.viewportSize(); await page.setViewportSize({ width: 360, height: 800 });
  await expect(field()).toBeVisible();
  expect(await dialog().evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await screenshot('frontmatter-mobile-source.png');
  await dialog().getByRole('button', { name: 'Cancel source edit', exact: true }).click();
  await page.setViewportSize(viewport);
  await header.scrollIntoViewIfNeeded(); await screenshot('frontmatter-edited.png');
  report.nativeFrontmatter = { language: 'yaml', text, copied, accessibilityViolations: accessibility.violations };
  report.checks.push('Frontmatter source dialog has no scoped axe violations and remains usable at 360px without dialog overflow');
}

export async function assertSavedNativeFrontmatter({ page, description, report, output, phase }) {
  const state = report.nativeFrontmatter;
  expect(description.startsWith('---\n' + state.text + '\n---\n\n')).toBe(true);
  const expand = page.getByTestId('show-all-btn'); if (await expand.isVisible()) await expand.click();
  const rendered = page.locator('main pre[data-lang-params="frontmatter"]');
  await expect(rendered).toHaveAttribute('data-canonical-lang', state.language);
  expect(await rendered.locator('code').textContent()).toBe(state.text);
  await rendered.scrollIntoViewIfNeeded();
  await page.screenshot({ path: fileURLToPath(new URL(`frontmatter-reader-${phase}.png`, output)), fullPage: true, animations: 'disabled' });
  // The real saved source must load back into native controls, not just look right.
  await page.getByTestId('work-item-edit-form-button').click();
  const wrapper = page.getByTestId('work-item-description-wrapper');
  const header = wrapper.locator('[contenteditable="true"] pre[data-fountain-gitlab-frontmatter]');
  await expect(header).toBeVisible(); await header.locator('code').click();
  await page.getByRole('button', { name: 'Edit frontmatter source', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Frontmatter source', exact: true });
  await expect(dialog.getByRole('textbox', { name: 'Frontmatter source', exact: true })).toHaveValue(state.text);
  await page.screenshot({ path: fileURLToPath(new URL(`frontmatter-native-reopened-${phase}.png`, output)), fullPage: true, animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Cancel source edit', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  report.nativeFrontmatterPhases ??= []; report.nativeFrontmatterPhases.push(phase);
}
