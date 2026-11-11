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

test('loads real Markdown, retains template undo and sends only actual user changes to the Vue 2 host', async ({ page }, info) => {
  await page.goto('/tests/browser/fixtures/gitlab-vue2.html');
  const editor = page.getByRole('textbox', { name: 'GitLab Vue 2 bridge editor', exact: true });
  const source = page.getByRole('textbox', { name: 'Markdown replacement source', exact: true });
  const changes = page.getByLabel('Host document change count', { exact: true });
  const undo = page.getByRole('button', { name: 'Undo document', exact: true });
  await source.fill('## Loaded heading\n\n**Baseline** text.');
  await page.getByRole('button', { name: 'Load Markdown baseline', exact: true }).click();
  await expect(editor.getByRole('heading', { name: 'Loaded heading', exact: true })).toBeVisible();
  await expect(editor.locator('strong')).toHaveText('Baseline');
  await expect(changes).toHaveText('0');
  await expect(undo).toBeDisabled();
  await page.screenshot({ path: info.outputPath('vue2-loaded-heading.png') });
  await editor.locator('p').click(); await page.keyboard.press('End'); await page.keyboard.type('A');
  await expect(page.getByLabel('Latest host Markdown', { exact: true })).toHaveText('## Loaded heading\n\n**Baseline** text.A');
  await expect(changes).toHaveText('1');
  await source.fill('## Template\n\n> Retain this quote.');
  await page.getByRole('button', { name: 'Apply Markdown template', exact: true }).click();
  await expect(editor.locator('blockquote')).toHaveText('Retain this quote.');
  await expect(changes).toHaveText('1');
  await page.screenshot({ path: info.outputPath('vue2-template.png') });
  await undo.click();
  await expect(editor.locator('p')).toHaveText('Baseline text.A');
  await undo.click();
  await expect(editor.locator('p')).toHaveText('Baseline text.');
  await expect(undo).toBeDisabled();
  await page.getByRole('button', { name: 'Redo document', exact: true }).click();
  await expect(editor.locator('p')).toHaveText('Baseline text.A');
  await source.fill('Fresh baseline.');
  await page.getByRole('button', { name: 'Load Markdown baseline', exact: true }).click();
  await expect(editor).toHaveText('Fresh baseline.');
  await expect(undo).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Redo document', exact: true })).toBeDisabled();
  await expect(page.getByLabel('View mount count', { exact: true })).toHaveText('1');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('vue2-loaded-baseline.png') });
  await writeFile(info.outputPath('serialized-content.json'), JSON.stringify({ engine: info.project.name,
    scope: 'Real compiled Vue 2 component, public Fountain engine and ordinary Markdown importer/exporter. Not GitLab dialect, real backend or full application verification.',
    silentInitialLoad: true, undoableTemplate: true, baselineClearsHistory: true, viewRetained: true }, null, 2));
});

test('edits pinned GitLab reference rendering without replacing source tokens with display labels', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/browser/fixtures/gitlab-vue2.html?gitlab-rendered=1');
  const editor = page.getByRole('textbox', { name: 'GitLab Vue 2 bridge editor', exact: true });
  const original = 'See #1 and !1 by @root with ~bug in b51c8ef20575';
  const source = page.getByRole('textbox', { name: 'Markdown replacement source', exact: true });
  const host = page.getByLabel('Latest host Markdown', { exact: true });
  const references = editor.locator('[data-fountain-gitlab-reference]');
  await source.fill(original);
  await page.getByRole('button', { name: 'Load Markdown baseline', exact: true }).click();
  await expect(references).toHaveCount(5);
  await expect(references.last()).toHaveText('b51c8ef2');
  await expect(editor.locator('[data-fountain-gitlab-reference="label"]')).toHaveCSS('background-color', 'rgb(102, 153, 204)');
  await expect(editor.locator('[data-fountain-gitlab-reference="label"]')).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(page.getByLabel('Host document change count', { exact: true })).toHaveText('0');
  await editor.locator('p').click(); await page.keyboard.press('End');
  await writeFile(info.outputPath('native-end-caret.json'), JSON.stringify(await page.evaluate(() => {
    const selection = getSelection(), node = selection?.anchorNode;
    return { name: node?.nodeName, offset: selection?.anchorOffset, text: node?.textContent,
      parentPath: node?.parentElement?.closest('[data-fountain-path]')?.getAttribute('data-fountain-path'),
      html: node instanceof Element ? node.outerHTML : node?.parentElement?.outerHTML };
  }), null, 2));
  await page.keyboard.type(' added');
  await expect(host).toHaveText(original + ' added');
  await page.screenshot({ path: info.outputPath('gitlab-reference-edit.png') });
  await page.getByRole('button', { name: 'Undo document', exact: true }).click();
  await expect(host).toHaveText(original);
  await editor.locator('p').click(); await page.keyboard.press('End'); await page.keyboard.press('Backspace');
  await expect(references).toHaveCount(4);
  expect(await host.textContent()).not.toContain('b51c8ef20575');
  await page.screenshot({ path: info.outputPath('gitlab-reference-deleted.png') });
  await page.getByRole('button', { name: 'Undo document', exact: true }).click();
  await expect(references).toHaveCount(5);
  await expect(host).toHaveText(original);
  await page.screenshot({ path: info.outputPath('gitlab-reference-restored.png') });
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
  await writeFile(info.outputPath('gitlab-rendered-source.json'), JSON.stringify({ engine: info.project.name,
    scope: 'Real compiled Fountain conversion, Vue 2 view and native editing over pinned GitLab HTML response data. Not a live GitLab service or full product.',
    rawReferenceTokensRetained: true, shortDisplayCommit: true, labelColor: true, nativeDeleteAndUndo: true }, null, 2));
});
