import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import type { mountHTMLAnchorFixture } from '../browser/fixtures/html-anchors';

declare global {
  var htmlAnchorAudit: ReturnType<typeof mountHTMLAnchorFixture>;
  var mountHTMLAnchorAudit: () => Promise<ReturnType<typeof mountHTMLAnchorFixture>>;
}

test('edits imported bookmark content and removes an empty bookmark with native input', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/browser-tests.html');
  await page.evaluate(async () => { globalThis.htmlAnchorAudit = await globalThis.mountHTMLAnchorAudit(); });
  const host = page.locator('#html-anchor-fixture');
  const inspect = () => page.evaluate(() => globalThis.htmlAnchorAudit.inspect());
  const source = '<p>Before <a id="chapter" name="legacy">Chapter one</a> after.</p><p>Here <a id="empty"></a> tail.</p>';
  try {
    await host.getByLabel('Import bookmark document').setInputFiles({ name: 'bookmarks.html', mimeType: 'text/html', buffer: Buffer.from(source) });
    const editor = host.getByRole('textbox', { name: 'Bookmark document' });
    const anchor = editor.locator('a[id="chapter"]');
    await expect(anchor).toHaveText('Chapter one');
    expect((await inspect()).html).toBe(source.replace('</p><p>', '</p>\n<p>'));
    const before = await inspect();
    // A double-click selects a word through the browser, without selection writes.
    await anchor.dblclick({ position: { x: 20, y: 10 } });
    // Native word selection on Windows may include the following space.
    // Replace exactly the browser-selected word and preserve that separator.
    const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    expect(selected).toMatch(/^Chapter ?$/u);
    await page.keyboard.type(selected.endsWith(' ') ? 'Section ' : 'Section');
    await expect(anchor).toHaveText('Section one');
    expect(await anchor.getAttribute('href')).toBeNull();
    await host.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(anchor).toHaveText('Chapter one');
    await host.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(anchor).toHaveText('Section one');
    const edited = await inspect();
    await host.screenshot({ path: info.outputPath('bookmark-edited.png') });
    await host.getByRole('button', { name: 'Select empty bookmark', exact: true }).click();
    await page.keyboard.press('Backspace');
    await expect(editor.locator('a[id="empty"]')).toHaveCount(0);
    await expect(editor.locator('p').nth(1)).toHaveText('Here  tail.');
    await host.getByRole('button', { name: 'Undo', exact: true }).click();
    expect((await inspect()).doc).toEqual(edited.doc);
    await host.getByRole('button', { name: 'Reopen exported HTML', exact: true }).click();
    expect((await inspect()).doc).toEqual(edited.doc);
    await host.screenshot({ path: info.outputPath('bookmark-reopened.png') });
    expect(errors).toEqual([]);
    await writeFile(info.outputPath('bookmark-observations.json'), JSON.stringify({ before, edited, reopened: await inspect(), errors }, null, 2));
  } finally {
    await writeFile(info.outputPath('bookmark-final-state.json'), JSON.stringify(await inspect(), null, 2));
    await host.screenshot({ path: info.outputPath('bookmark-final-state.png') });
    await page.evaluate(() => globalThis.htmlAnchorAudit.destroy());
  }
});
