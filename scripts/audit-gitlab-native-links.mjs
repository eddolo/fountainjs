import { expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { parseFragment } from 'parse5';

export async function auditNativeLinks({ page, context, editor, toolbar, output, report }) {
  await page.evaluate(() => {
    window.fountainLinkEvents = [];
    const owner = document.querySelector('[data-testid="native-link-menu"]');
    const component = owner?.__vue__ ?? owner?.__vueParentComponent?.proxy;
    const record = event => {
      if (!event.target.closest?.('[data-testid="native-link-menu"], [role="tooltip"], [role="dialog"]')) return;
      if (window.fountainLinkEvents.length >= 256) return;
      window.fountainLinkEvents.push({ event: event.type, tag: event.target.tagName,
        name: event.target.closest('button')?.textContent.trim().slice(0, 80),
        prevented: event.defaultPrevented, active: document.activeElement?.tagName,
        menu: component ? { name: component.$options?.name, open: component.dialogOpen, disabled: component.disabled, available: component.available,
          connected: component.root?.isConnected, currentRoot: component.root === component.getEditorRoot?.(),
          sessionClosed: component.sessionState?.closed, conflict: component.sessionState?.conflict,
          serviceStatus: component.contentEditor?.status, selection: component.contentEditor?.editor?.state.selection.kind,
          path: component.contentEditor?.editor?.state.selection.path } : null,
        hostError: owner?.closest('[data-fountain-integration]')?.getAttribute('data-fountain-error') });
      if (event.type === 'click') queueMicrotask(() => {
        window.fountainLinkEvents.push({ event: 'after-click', name: event.target.closest('button')?.textContent.trim().slice(0, 80),
          open: component?.dialogOpen, serviceStatus: component?.contentEditor?.status,
          hostError: owner?.closest('[data-fountain-integration]')?.getAttribute('data-fountain-error') });
      });
    };
    for (const name of ['mousedown', 'mouseup', 'click', 'focusin', 'focusout']) document.addEventListener(name, record);
  });
  const label = 'Fountain link bold tail';
  const dialog = page.getByRole('dialog', { name: 'Edit link', exact: true });
  const link = editor.locator('a').filter({ hasText: label });
  const screenshot = name => page.screenshot({ path: fileURLToPath(new URL(name, output)), fullPage: true, caret: 'initial' });
  report.nativeLinkRendering = [];
  const apply = async canonicalHref => {
    const rendered = page.waitForResponse(response => {
      if (response.request().method() !== 'POST' || !response.ok()) return false;
      try { return response.request().postDataJSON()?.text === `[link](${canonicalHref})`; }
      catch { return false; }
    });
    await dialog.getByRole('button', { name: 'Apply link', exact: true }).click();
    const response = await rendered, body = (await response.json()).body;
    const anchors = [];
    const visit = node => {
      if (node.tagName === 'a') anchors.push(node.attrs.find(attr => attr.name === 'href')?.value);
      for (const child of node.childNodes ?? []) visit(child);
    };
    visit(parseFragment(body));
    expect(anchors).toHaveLength(1);
    expect(typeof anchors[0]).toBe('string');
    report.nativeLinkRendering.push({ canonicalHref, resolvedHref: anchors[0] });
    await expect(dialog).toBeHidden();
    return anchors[0];
  };
  await editor.getByText('Recovered paste', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.evaluate(() => navigator.clipboard.writeText('Fountain link **bold** tail'));
  await toolbar.getByRole('button', { name: 'Paste Markdown', exact: true }).click();
  await expect(editor.locator('strong').filter({ hasText: 'bold' })).toBeVisible();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await toolbar.getByRole('button', { name: 'Insert or edit link', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Link text', exact: true })).toHaveValue(label);
  await dialog.getByRole('textbox', { name: 'Link URL', exact: true }).fill('/help');
  report.nativeLinkFocus = [];
  for (let index = 0; index < 7; index++) {
    await page.keyboard.press('Tab');
    await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    report.nativeLinkFocus.push(await dialog.evaluate(() => ({ tag: document.activeElement.tagName,
      label: document.activeElement.getAttribute('aria-label') || document.activeElement.textContent?.trim().slice(0, 80) })));
  }
  await screenshot('link-create-dialog.png');
  const firstResolved = await apply('/help');
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAttribute('href', firstResolved);
  await expect(link.locator('strong')).toHaveText('bold');
  await toolbar.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(link).toHaveCount(0);
  await expect(editor.locator('strong').filter({ hasText: 'bold' })).toBeVisible();
  await toolbar.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(link).toHaveCount(1);
  report.checks.push('Native toolbar creates one continuous link across mixed formatting; dialog traps keyboard focus; one-step undo/redo retains the label and bold fragment');

  await link.click();
  for (const name of ['Copy link URL', 'Edit link', 'Remove link']) {
    const button = page.getByRole('button', { name, exact: true });
    await expect(button).toBeVisible();
    expect(await button.evaluate(element => {
      const text = element.querySelector('span');
      return !text || text.scrollWidth <= text.clientWidth + 1;
    })).toBe(true);
  }
  await page.getByRole('button', { name: 'Copy link URL', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Link URL copied.' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(new URL(firstResolved, page.url()).href);
  const preview = page.getByRole('tooltip').filter({ has: page.getByRole('button', { name: 'Copy link URL', exact: true }) });
  await expect(preview).toHaveCSS('opacity', '1');
  await preview.screenshot({ path: fileURLToPath(new URL('link-preview-panel.png', output)), caret: 'initial' });
  await screenshot('link-preview.png');
  await page.getByRole('button', { name: 'Edit link', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Link URL', exact: true })).toHaveValue('/help');
  await expect(dialog.getByRole('textbox', { name: 'Link text', exact: true })).toHaveValue(label);
  await dialog.getByRole('textbox', { name: 'Link URL', exact: true }).fill('/help/user');
  const nextResolved = await apply('/help/user');
  await expect(link).toHaveAttribute('href', nextResolved);
  report.checks.push('Clicking the actual link exposes native preview, copies its absolute URL to the browser clipboard and prefills canonical URL/full label for editing');

  await link.click();
  await page.keyboard.press('Control+k');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Link text', exact: true }).fill('Cancelled draft');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(editor).toBeFocused();
  await expect(link).toHaveAttribute('href', nextResolved);
  await expect(link).toHaveText(label);
  await page.getByRole('button', { name: 'Remove link', exact: true }).click();
  await expect(link).toHaveCount(0);
  await toolbar.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(link).toHaveAttribute('href', nextResolved);
  report.checks.push('Native Ctrl+K and Escape cancel retain source and return focus; Remove link preserves text/formatting and has one-step undo');

  await link.click();
  await page.keyboard.press('Control+k');
  await dialog.getByRole('textbox', { name: 'Link URL', exact: true }).fill('/help/offline-retry');
  try {
    await context.setOffline(true);
    await dialog.getByRole('button', { name: 'Apply link', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Your draft and document are retained');
    await expect(dialog.getByRole('textbox', { name: 'Link URL', exact: true })).toHaveValue('/help/offline-retry');
    await expect(link).toHaveAttribute('href', nextResolved);
    await screenshot('link-offline-draft-retained.png');
  } finally { await context.setOffline(false); }
  const finalResolved = await apply('/help/offline-retry');
  await expect(link).toHaveAttribute('href', finalResolved);
  report.nativeLink = { label, href: '/help/offline-retry', displayHref: finalResolved, formatting: 'bold', browserClipboard: true,
    offlineRecovery: true, focusTrap: true, escapeReturnsFocus: true };
  report.checks.push('Real browser offline mode refuses the actual GitLab renderer request, retains both draft fields/document and succeeds on retry after reconnect');
  report.nativeLinkEvents = await page.evaluate(() => window.fountainLinkEvents);
}
