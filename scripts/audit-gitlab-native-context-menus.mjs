import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Real browser input and actual GitLab rendering; no injected model mutations.
export async function auditNativeContextMenus({ page, editor, toolbar, output, report }) {
  const source = '```js\nconst owned = 7;\n```\n\n```mermaid\ngraph LR\n  Other-->Diagram\n```';
  const owned = editor.locator('pre').filter({ hasText: 'const owned = 7;' });
  const diagram = editor.locator('pre').filter({ hasText: 'Other-->Diagram' });
  const codeMenu = () => page.getByRole('dialog', { name: 'Code block actions', exact: true });
  const codeControls = () => page.getByRole('region', { name: 'Code block controls', exact: true });
  const language = () => codeControls().getByRole('combobox', { name: 'Code language', exact: true });
  const mediaMenu = () => page.getByRole('dialog', { name: 'Media actions', exact: true });
  const mediaControls = () => page.getByRole('group', { name: 'Media controls', exact: true });
  const mediaDialog = () => page.getByRole('dialog', { name: 'Media properties', exact: true });
  const screenshot = name => page.screenshot({ path: fileURLToPath(new URL(name, output)), fullPage: true, animations: 'disabled', caret: 'initial' });
  const undo = () => toolbar.getByRole('button', { name: 'Undo', exact: true }).click();
  const redo = () => toolbar.getByRole('button', { name: 'Redo', exact: true }).click();
  const installed = JSON.parse(await readFile(new URL('../artifacts/gitlab-native-browser-install/install.json', import.meta.url)));
  const require = createRequire(installed.source + '/storybook/package.json');
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const audits = [];
  const audit = async (locator, name) => {
    await expect(locator).toBeVisible();
    const result = await locator.evaluate(element => window.axe.run(element));
    audits.push({ name, violations: result.violations });
    expect(result.violations).toEqual([]);
  };
  const clamped = async locator => {
    const hostBounds = () => editor.evaluate(element => {
      const container = element.closest('.work-item-detail');
      if (!container) throw new Error('Expected the actual GitLab work-item content container.');
      return container.getBoundingClientRect().toJSON();
    });
    await expect.poll(async () => {
      const box = await locator.boundingBox();
      const viewport = page.viewportSize();
      const host = await hostBounds();
      return Boolean(box && box.x >= Math.max(0, host.left) && box.y >= Math.max(0, host.top)
        && box.x + box.width <= Math.min(viewport.width, host.right) + 1
        && box.y + box.height <= Math.min(viewport.height, host.bottom) + 1);
    }).toBe(true);
    report.contextMenuBounds ??= [];
    report.contextMenuBounds.push({ label: await locator.getAttribute('aria-label'), menu: await locator.boundingBox(), host: await hostBounds() });
  };

  await editor.getByText('Recovered paste', { exact: true }).click();
  await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await page.evaluate(value => navigator.clipboard.writeText(value), source);
  const rendered = page.waitForResponse(response => {
    if (response.request().method() !== 'POST' || !response.ok()) return false;
    try { return response.request().postDataJSON()?.text === source; } catch { return false; }
  });
  await toolbar.getByRole('button', { name: 'Paste Markdown', exact: true }).click();
  report.nativeContextRendering = (await (await rendered).json()).body;
  await owned.locator('code').click(); await expect(codeMenu()).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'Code block actions', exact: true })).toHaveAttribute('aria-controls', await codeMenu().getAttribute('id'));
  const ownedText = await owned.locator('code').textContent();
  const originalSyntax = await owned.getAttribute('data-language');
  expect(ownedText.replace(/\n$/u, '')).toBe('const owned = 7;');
  await expect(language()).toHaveValue('js'); await clamped(codeMenu());
  await language().fill('rust');
  await diagram.locator('code').click();
  await expect(language()).toHaveValue('rust');
  await expect(codeControls().getByRole('button', { name: 'Show diagram preview', exact: true })).toHaveCount(0);
  await codeControls().getByRole('button', { name: 'Copy code', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(ownedText);
  await audit(codeMenu(), 'captured-code-context');
  await screenshot('context-owned-language-draft.png');
  await codeControls().getByRole('button', { name: 'Apply language', exact: true }).click();
  await expect(owned).toHaveAttribute('data-language', 'rust');
  await expect(diagram).toHaveAttribute('data-language', 'mermaid');
  await undo(); await expect(owned).toHaveAttribute('data-language', originalSyntax);
  await redo(); await expect(owned).toHaveAttribute('data-language', 'rust');
  report.checks.push('Actual contextual code controls retain their captured owner after a later caret move: Copy and Apply target the first block, not the second diagram; Undo/Redo restore the exact language');

  await owned.locator('code').click(); await page.keyboard.press('Alt+F10');
  await expect(language()).toBeFocused();
  await language().fill('python'); await language().press('Escape');
  expect(await editor.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape'); await expect(codeMenu()).toBeHidden();
  const trigger = toolbar.getByRole('button', { name: 'Code block actions', exact: true });
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click(); await expect(language()).toBeFocused();
  await expect(language()).toHaveValue('rust');
  await language().fill('go');
  const external = page.getByRole('button', { name: 'Save changes', exact: true });
  await external.focus(); await expect(codeMenu()).toBeHidden();
  await trigger.click(); await expect(language()).toHaveValue('go');
  await language().press('Escape');
  await owned.locator('code').click(); await clamped(codeMenu());
  await screenshot('context-keyboard-reopened.png');
  report.checks.push('Real Alt+F10 focuses contextual controls; Escape cancels and restores editor focus, a second Escape dismisses the surface, external focus hides it and the trigger restores an untouched draft');

  await diagram.locator('code').click();
  await codeControls().getByRole('button', { name: 'Edit diagram source', exact: true }).click();
  await expect(page.locator('[role="dialog"][aria-label="Code block actions"]')).toBeHidden();
  const sourceDialog = page.getByRole('dialog', { name: 'Diagram source and preview', exact: true });
  const sourceField = sourceDialog.getByRole('textbox', { name: 'Diagram source', exact: true });
  await sourceField.fill('graph LR\n  Narrow-->Retained');
  await expect(sourceDialog.frameLocator('iframe[title="Mermaid diagram preview"]').locator('svg')).toContainText('Retained');
  await audit(sourceDialog, 'diagram-source-dialog');
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(sourceField).toHaveValue('graph LR\n  Narrow-->Retained');
  await expect(toolbar.getByTestId('native-context-surface').filter({ has: page.getByTestId('native-code-menu') })).toHaveAttribute('data-menu-mode', 'docked');
  expect(await sourceDialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await screenshot('context-mobile-source-draft.png');
  await sourceDialog.getByRole('button', { name: 'Cancel source edit', exact: true }).click();
  await expect(diagram).toContainText('Other-->Diagram');
  await page.setViewportSize(viewport); await owned.locator('code').click();
  await expect(codeMenu()).toBeVisible(); await clamped(codeMenu());
  report.checks.push('Resizing the real source dialog to 360px retains its draft, docks code controls without dialog overflow and cancels without changing the published source');

  const image = editor.getByRole('img', { name: 'Uploaded baseline figure', exact: true });
  await image.click(); await expect(mediaMenu()).toBeVisible(); await clamped(mediaMenu());
  await expect(toolbar.getByRole('button', { name: 'Media actions', exact: true })).toHaveAttribute('aria-controls', await mediaMenu().getAttribute('id'));
  await audit(mediaMenu(), 'image-context');
  await mediaControls().getByRole('button', { name: 'Copy media URL', exact: true }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^\/uploads\//u);
  await mediaControls().getByRole('button', { name: 'Edit media properties', exact: true }).click();
  await expect(mediaDialog()).toHaveCSS('opacity', '1');
  await expect(page.locator('[role="dialog"][aria-label="Media actions"]')).toBeHidden();
  await mediaDialog().getByRole('textbox', { name: 'Media title', exact: true }).fill('Contextual figure reviewed');
  await mediaDialog().getByRole('textbox', { name: 'Media width', exact: true }).fill('240');
  await audit(mediaDialog(), 'image-properties');
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(mediaDialog().getByRole('textbox', { name: 'Media title', exact: true })).toHaveValue('Contextual figure reviewed');
  expect(await mediaDialog().evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await screenshot('context-mobile-media-properties.png');
  await mediaDialog().getByRole('button', { name: 'Apply media changes', exact: true }).click();
  await expect(mediaDialog()).toBeHidden();
  await expect(image).toHaveAttribute('title', 'Contextual figure reviewed');
  await page.setViewportSize(viewport); await image.click();
  expect((await image.boundingBox()).width).toBe(240);
  await undo(); await expect(image).not.toHaveAttribute('title', 'Contextual figure reviewed');
  await redo(); await expect(image).toHaveAttribute('title', 'Contextual figure reviewed');
  await image.click(); await mediaControls().getByRole('button', { name: 'Delete media', exact: true }).click();
  await expect(image).toHaveCount(0); await undo(); await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('title', 'Contextual figure reviewed');
  await image.click(); await page.keyboard.press('Alt+F10');
  await expect(mediaControls().getByRole('button', { name: 'Edit media properties', exact: true })).toBeFocused();
  await clamped(mediaMenu()); await screenshot('context-media-restored.png');
  report.nativeContextMenus = { source, text: ownedText.replace(/\n$/u, ''), copiedCode: ownedText, language: 'rust', copiedMediaURL: copied,
    mediaTitle: 'Contextual figure reviewed', mediaWidth: 240, accessibility: audits };
  report.checks.push('The actual uploaded image exposes a clamped keyboard-accessible contextual surface, copies its canonical URL, edits properties on mobile, and restores exact media through Undo/Redo and Delete/Undo');
}

export async function assertSavedNativeContextMenus({ page, description, report, output, phase }) {
  const state = report.nativeContextMenus;
  expect(description).toContain('```rust\n' + state.text + '\n```');
  expect(description).toContain('```mermaid\ngraph LR\n  Other-->Diagram\n```');
  expect(description).toContain(`![Uploaded baseline figure](${state.copiedMediaURL} "${state.mediaTitle}"){width="${state.mediaWidth}"}`);
  const expand = page.getByTestId('show-all-btn'); if (await expand.isVisible()) await expand.click();
  const image = page.getByTestId('work-item-description').getByRole('img', { name: 'Uploaded baseline figure', exact: true });
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true);
  expect((await image.boundingBox()).width).toBe(state.mediaWidth);
  await page.getByTestId('work-item-edit-form-button').click();
  const editor = page.getByTestId('work-item-description-wrapper').locator('[contenteditable="true"]');
  await editor.locator('pre').filter({ hasText: state.text }).locator('code').click();
  const menu = page.getByRole('dialog', { name: 'Code block actions', exact: true });
  await expect(menu.getByRole('combobox', { name: 'Code language', exact: true })).toHaveValue(state.language);
  await page.screenshot({ path: fileURLToPath(new URL(`context-reopened-${phase}.png`, output)), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  report.nativeContextMenuPhases ??= []; report.nativeContextMenuPhases.push(phase);
}
