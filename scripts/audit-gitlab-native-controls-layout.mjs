import { expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

// Exercise the installed product's controls, rather than a mock toolbar.
export async function auditNativeControlsLayout({ page, editor, toolbar, output, report }) {
  const viewport = page.viewportSize();
  const before = await editor.innerText();
  const installation = JSON.parse(await readFile(new URL('../artifacts/gitlab-native-browser-install/install.json', import.meta.url)));
  const require = createRequire(installation.source + '/storybook/package.json');
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const layouts = [];
  for (const width of [1440, 1100, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await editor.getByRole('img', { name: 'Uploaded baseline figure', exact: true }).click();
    await toolbar.scrollIntoViewIfNeeded();
    const menu = width < 640 ? toolbar.getByTestId('native-media-menu')
      : page.getByRole('dialog', { name: 'Media actions', exact: true });
    await expect(menu).toBeVisible();
    const attach = await toolbar.getByRole('button', { name: 'Attach a file or image', exact: true }).boundingBox();
    const paste = await toolbar.getByRole('button', { name: 'Paste Markdown', exact: true }).boundingBox();
    expect(Math.abs(attach.y - paste.y)).toBeLessThanOrEqual(2);
    const bounds = await toolbar.boundingBox();
    const overflow = await toolbar.evaluate(root => root.scrollWidth - root.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    if (width >= 640) {
      const trigger = await toolbar.getByRole('button', { name: 'Media actions', exact: true }).boundingBox();
      expect(Math.abs(trigger.y - paste.y)).toBeLessThanOrEqual(2);
    }
    if (width === 1440) expect(bounds.height).toBeLessThanOrEqual(52);
    const actions = [];
    for (const name of ['Edit media properties', 'Open media', 'Copy media URL', 'Replace media file', 'Delete media']) {
      const action = menu.getByRole(name === 'Open media' ? 'link' : 'button', { name, exact: true });
      await expect(action).toBeVisible();
      actions.push({ name, ...await action.boundingBox() });
    }
    for (let index = 1; index < actions.length; index++)
      expect(actions[index].y).toBeGreaterThanOrEqual(actions[index - 1].y + actions[index - 1].height + 4);
    const accessibility = await toolbar.evaluate(element => window.axe.run(element));
    expect(accessibility.violations).toEqual([]);
    if (width >= 640) {
      const popupAccessibility = await menu.evaluate(element => window.axe.run(element));
      expect(popupAccessibility.violations).toEqual([]);
    }
    await toolbar.screenshot({ path: fileURLToPath(new URL(`controls-toolbar-${width}.png`, output)) });
    await menu.screenshot({ path: fileURLToPath(new URL(`controls-media-${width}.png`, output)) });
    if (width === 1440) {
      await editor.focus(); await page.keyboard.press('Alt+F10');
      await expect(menu.getByRole('button', { name: 'Edit media properties', exact: true })).toBeFocused();
      await page.keyboard.press('Enter');
    } else await menu.getByRole('button', { name: 'Edit media properties', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Media properties', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Media description', exact: true })).toHaveValue('Uploaded baseline figure');
    await dialog.getByRole('button', { name: 'Cancel media edit', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(await editor.innerText()).toBe(before);
    layouts.push({ width, toolbar: bounds, clipboard: { attach, paste }, actions, overflow,
      accessibilityScans: width < 640 ? 1 : 2, accessibility: [] });
  }
  await page.setViewportSize(viewport); await editor.focus(); await page.keyboard.press('Escape');
  report.nativeControlsLayout = { layouts, documentUnchanged: true, keyboardProperties: true };
  report.checks.push('Actual GitLab controls stay grouped without horizontal overflow at 1440/1100/390px; media actions have distinct rows and separated deletion; keyboard properties, mobile dialog cancellation and toolbar/popup accessibility pass without changing content');
}
