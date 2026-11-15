import { expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/** Real author controls and network requests; never injects model mutations. */
export async function auditNativeFootnoteRenaming({ page, editor, toolbar, output, report }) {
  const definitions = editor.locator('[data-fountain-footnote-definition]');
  const references = editor.locator('sup[data-fountain-footnote-reference]');
  const ids = await definitions.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-fountain-footnote-definition')));
  const open = async index => {
    await definitions.nth(index).locator('p').first().click();
    await toolbar.getByRole('button', { name: 'Footnote actions', exact: true }).click();
    await page.getByRole('dialog', { name: 'Footnote actions', exact: true }).getByRole('button', { name: 'Rename label', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Rename footnote label', exact: true });
    await expect(dialog).toBeVisible(); return dialog;
  };
  const field = dialog => dialog.getByRole('textbox', { name: 'Footnote label', exact: true });
  const apply = dialog => dialog.getByRole('button', { name: 'Rename footnote', exact: true }).click();
  const audit = async (dialog, name) => {
    const surface = await dialog.evaluate(async element => {
      const root = element.closest('.modal') || element;
      const initialOpacity = getComputedStyle(root).opacity;
      const animations = root.getAnimations({ subtree: true });
      await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
      return { initialOpacity, animations: animations.length, finalOpacity: getComputedStyle(root).opacity };
    });
    await expect(dialog).toHaveCSS('opacity', '1');
    const result = await dialog.evaluate(element => window.axe.run(element));
    (report.footnoteRenameAccessibility ??= []).push({ name, surface, violations: result.violations });
    expect(result.violations).toEqual([]);
  };
  let dialog = await open(0);
  await expect(field(dialog)).toHaveValue('1');
  await expect(dialog.getByText('Used in Markdown references. Display numbers follow document order automatically.', { exact: true })).toBeVisible();
  await audit(dialog, 'rename-note-dialog');
  await field(dialog).fill('2'); await apply(dialog);
  await expect(dialog.getByRole('alert')).toContainText('connect references to another note');
  await expect(field(dialog)).toHaveValue('2');
  await expect(definitions.first()).toHaveAttribute('data-gitlab-footnote-label', '1');
  await page.screenshot({ path: fileURLToPath(new URL('rename-collision.png', output)), fullPage: true });
  let failed = false;
  const pattern = '**/*no_header_anchors*';
  const rejectOnce = route => {
    const request = route.request();
    let source; try { source = request.postDataJSON()?.text; } catch { /* Only renderer JSON belongs to this failure. */ }
    if (!failed && request.method() === 'POST' && typeof source === 'string' && source.includes('[^evidence]')) {
      failed = true; return route.abort('failed');
    }
    return route.continue();
  };
  await page.route(pattern, rejectOnce);
  try {
    await field(dialog).fill('evidence'); await apply(dialog);
    await expect(dialog.getByRole('alert')).toContainText('label could not be checked');
    expect(failed).toBe(true); await expect(field(dialog)).toHaveValue('evidence');
    await expect(definitions.first()).toHaveAttribute('data-gitlab-footnote-label', '1');
    await page.screenshot({ path: fileURLToPath(new URL('rename-offline-draft.png', output)), fullPage: true });
  } finally { await page.unroute(pattern, rejectOnce); }
  await field(dialog).press('Enter'); await expect(dialog).toBeHidden();
  await expect(definitions.first()).toHaveAttribute('data-gitlab-footnote-label', 'evidence');
  await expect(references.nth(0)).toHaveAttribute('data-gitlab-footnote-label', 'evidence');
  await expect(references.nth(2)).toHaveAttribute('data-gitlab-footnote-label', 'evidence');
  expect(await definitions.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-fountain-footnote-definition')))).toEqual(ids);
  await toolbar.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(definitions.first()).toHaveAttribute('data-gitlab-footnote-label', '1');
  await toolbar.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(definitions.first()).toHaveAttribute('data-gitlab-footnote-label', 'evidence');
  dialog = await open(1); await field(dialog).fill('EVIDENCE'); await apply(dialog);
  await expect(dialog.getByRole('alert')).toContainText('connect references to another note');
  await expect(definitions.nth(1)).toHaveAttribute('data-gitlab-footnote-label', '2');
  await page.screenshot({ path: fileURLToPath(new URL('rename-case-collision.png', output)), fullPage: true });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  report.checks.push('Actual label editor retains exact-collision and HTTP-failure drafts, retries successfully, preserves native IDs, updates shared references atomically with Undo/Redo, and refuses a real GitLab case-folded collision');

  await references.nth(1).click(); await page.keyboard.press('Alt+F10');
  await page.getByRole('dialog', { name: 'Footnote actions', exact: true }).getByRole('button', { name: 'Remove this reference', exact: true }).click();
  await expect(references).toHaveCount(2);
  const unusedLabel = 'archived-research-note-with-a-long-label-that-must-wrap-on-a-narrow-screen';
  dialog = await open(1); await field(dialog).fill(unusedLabel); await apply(dialog);
  await expect(dialog).toBeHidden();
  await expect(definitions.nth(1)).toHaveAttribute('data-gitlab-footnote-label', unusedLabel);
  await expect(definitions.nth(1)).toContainText('Second note body.');
  const unusedLayout = () => definitions.nth(1).evaluate(element => {
    const label = getComputedStyle(element, '::before');
    const body = element.querySelector('p').getBoundingClientRect(), bounds = element.getBoundingClientRect();
    return { position: label.position, display: label.display, wrap: label.overflowWrap,
      bodyOffset: body.y - bounds.y, lineHeight: parseFloat(label.lineHeight),
      overflow: element.scrollWidth > element.clientWidth + 1 };
  });
  const desktopUnused = await unusedLayout();
  expect(desktopUnused.position).toBe('static'); expect(desktopUnused.display).toBe('block');
  expect(desktopUnused.bodyOffset).toBeGreaterThanOrEqual(desktopUnused.lineHeight - 1);
  await page.screenshot({ path: fileURLToPath(new URL('rename-unused-note.png', output)), fullPage: true });
  const unusedViewport = page.viewportSize();
  await page.setViewportSize({ width: 360, height: 800 });
  await definitions.nth(1).scrollIntoViewIfNeeded();
  const mobileUnused = await unusedLayout();
  expect(mobileUnused.wrap).toBe('anywhere'); expect(mobileUnused.overflow).toBe(false);
  expect(mobileUnused.bodyOffset).toBeGreaterThanOrEqual(mobileUnused.lineHeight * 2 - 1);
  await page.screenshot({ path: fileURLToPath(new URL('rename-unused-mobile.png', output)), fullPage: true });
  await page.setViewportSize(unusedViewport);
  report.unusedFootnoteLabelLayout = { desktop: desktopUnused, mobile: mobileUnused };
  report.checks.push('An unused note’s long source label occupies its own wrapping line above its body at desktop and 360px, without horizontal overflow');
  await toolbar.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(definitions.nth(1)).toHaveAttribute('data-gitlab-footnote-label', '2');
  await toolbar.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(references).toHaveCount(3);
  const viewport = page.viewportSize();
  dialog = await open(0); await field(dialog).fill('research-β');
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(field(dialog)).toHaveValue('research-β');
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await audit(dialog, 'mobile-rename-note-dialog');
  await page.screenshot({ path: fileURLToPath(new URL('rename-mobile-draft.png', output)), fullPage: true });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.setViewportSize(viewport);
  await expect(definitions.first()).toHaveAttribute('data-gitlab-footnote-label', 'evidence');
  report.nativeFootnotes.labels = ['evidence', '2'];
  report.nativeFootnoteRenaming = { nativeIDs: ids, label: 'evidence', refusedCaseCollision: true, failedRequestRetried: true, unusedBodyRetained: true };
  report.checks.push('An unused definition renames through real bounded host rendering without losing its body; Undo restores its label/reference, and a 360px draft cancels without publishing a label change');
}
