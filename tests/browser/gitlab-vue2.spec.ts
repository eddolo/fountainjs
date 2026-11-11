import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('keeps actual Vue 2 host mode changes and view remounts on one Fountain document history', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/browser/fixtures/gitlab-vue2.html');
  await page.evaluate(() => {
    const events: unknown[] = [];
    Object.assign(globalThis, { bridgeClipboardProbe: events });
    document.addEventListener('copy', event => events.push({ type: 'copy', prevented: event.defaultPrevented,
      target: (event.target as Element)?.tagName, active: document.activeElement?.tagName,
      selected: getSelection()?.rangeCount ? getSelection()!.getRangeAt(0).cloneContents().textContent : null,
      types: [...(event.clipboardData?.types ?? [])], writtenLength: event.clipboardData?.getData('text/plain').length }));
    document.addEventListener('paste', event => events.push({ type: 'paste', target: (event.target as Element)?.tagName,
      types: [...(event.clipboardData?.types ?? [])], receivedLength: event.clipboardData?.getData('text/plain').length }));
  });
  const editor = page.getByRole('textbox', { name: 'GitLab Vue 2 bridge editor', exact: true });
  const mounts = page.getByLabel('View mount count', { exact: true });
  await expect(editor).toHaveText('Vue 2 integration.');
  await expect(mounts).toHaveText('1');
  await editor.click(); await page.keyboard.press('End'); await page.keyboard.type('A');
  await expect(editor).toHaveText('Vue 2 integration.A');
  await page.getByRole('button', { name: 'Use read-only mode', exact: true }).click();
  await expect(editor).toHaveAttribute('contenteditable', 'false');
  await expect(editor).toHaveAttribute('aria-readonly', 'true');
  await editor.click(); await page.keyboard.type('blocked'); await page.keyboard.press('Backspace');
  await expect(editor).toHaveText('Vue 2 integration.A');
  await expect(page.getByRole('button', { name: 'Undo document', exact: true })).toBeDisabled();
  await expect(mounts).toHaveText('1');
  await page.keyboard.press('ControlOrMeta+a');
  await expect.poll(() => page.evaluate(() => getSelection()?.rangeCount
    ? getSelection()!.getRangeAt(0).cloneContents().textContent : null)).toBe('Vue 2 integration.A');
  await page.keyboard.press('ControlOrMeta+c');
  await page.getByRole('textbox', { name: 'External copy target', exact: true }).focus();
  await page.keyboard.press('ControlOrMeta+v');
  await writeFile(info.outputPath('read-only-clipboard.json'), JSON.stringify(await page.evaluate(() => (
    globalThis as typeof globalThis & { bridgeClipboardProbe: unknown[] }
  ).bridgeClipboardProbe), null, 2));
  await expect(page.getByRole('textbox', { name: 'External copy target', exact: true })).toHaveValue('Vue 2 integration.A');
  await page.screenshot({ path: info.outputPath('vue2-read-only.png') });
  await page.getByRole('button', { name: 'Enable editing', exact: true }).click();
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await page.getByRole('button', { name: 'Undo document', exact: true }).click();
  await expect(editor).toHaveText('Vue 2 integration.');
  await page.getByRole('button', { name: 'Redo document', exact: true }).click();
  await expect(editor).toHaveText('Vue 2 integration.A');
  await page.getByRole('button', { name: 'Detach surface', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.getByRole('button', { name: 'Attach surface', exact: true }).click();
  await expect(editor).toHaveText('Vue 2 integration.A');
  await expect(mounts).toHaveText('2');
  await page.getByRole('button', { name: 'Undo document', exact: true }).click();
  await expect(editor).toHaveText('Vue 2 integration.');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('vue2-remounted-history.png') });
  await writeFile(info.outputPath('gitlab-vue2.json'), JSON.stringify({ engine: info.project.name, runtime: 'Real Vue 2.7.16 and its SFC compiler',
    scope: 'Compiled surface component against the package build; not the full GitLab application, Markdown service, auth, upload or collaboration verification.',
    modePreservesMount: true, remountPreservesHistory: true, nativeReadOnlyCopy: true, errors }, null, 2));
  expect(errors).toEqual([]);
});

test('removes the surface when a host filter refuses read-only mode and recovers without losing the document', async ({ page }) => {
  await page.goto('/tests/browser/fixtures/gitlab-vue2.html?reject-mode=1');
  const editor = page.getByRole('textbox', { name: 'GitLab Vue 2 bridge editor', exact: true });
  await expect(editor).toHaveText('Vue 2 integration.');
  await editor.click(); await page.keyboard.press('End'); await page.keyboard.type('A');
  await expect(editor).toHaveText('Vue 2 integration.A');
  await page.getByRole('button', { name: 'Use read-only mode', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('refused the interaction-mode change');
  await expect(page.getByRole('button', { name: 'Undo document', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Enable editing', exact: true }).click();
  await expect(editor).toHaveText('Vue 2 integration.A');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('View mount count', { exact: true })).toHaveText('2');
  await page.getByRole('button', { name: 'Undo document', exact: true }).click();
  await expect(editor).toHaveText('Vue 2 integration.');
});
