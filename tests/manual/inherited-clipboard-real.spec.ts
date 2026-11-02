import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import type { mountInheritedClipboardFixture } from '../browser/fixtures/inherited-clipboard';

declare global {
  var inheritedClipboardAudit: ReturnType<typeof mountInheritedClipboardFixture>;
  var mountInheritedClipboardAudit: () => Promise<ReturnType<typeof mountInheritedClipboardFixture>>;
}

for (const action of ['copy', 'cut']) test(`inherited node direction survives trusted ${action} into native and Fountain destinations`, async ({ page }, info) => {
  const native = await page.context().newPage(), errors: string[] = [];
  const observations: Record<string, unknown> = { action };
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/browser-tests.html');
  await page.evaluate(async () => { globalThis.inheritedClipboardAudit = await globalThis.mountInheritedClipboardAudit(); });
  const host = page.locator('#inherited-clipboard-fixture');
  const inspect = () => page.evaluate(() => globalThis.inheritedClipboardAudit.inspect());
  try {
    const before = await inspect(); observations.before = before;
    const source = host.getByRole('textbox', { name: 'Source document', exact: true });
    await expect(source.getByText('English child', { exact: true })).toHaveCSS('direction', 'rtl');
    await native.setContent(before.sourceHTML);
    expect(await native.getByText('English child', { exact: true }).evaluate(element => getComputedStyle(element).direction)).toBe('rtl');
    await host.getByRole('button', { name: 'Select nested child block', exact: true }).click();
    expect((await inspect()).sourceSelection).toBe('node');
    await page.keyboard.press(action === 'copy' ? 'ControlOrMeta+c' : 'ControlOrMeta+x');
    if (action === 'cut') {
      await expect(source).not.toContainText('English child');
      await host.getByRole('button', { name: 'Undo source', exact: true }).click();
    }
    expect((await inspect()).source).toEqual(before.source);
    await native.setContent('<style>body{padding:24px;font:18px/1.6 sans-serif}</style><div contenteditable="true" role="textbox" aria-label="Independent destination"></div>');
    await native.evaluate(() => document.addEventListener('paste', event => {
      (globalThis as any).__inheritedPaste = { trusted: event.isTrusted, html: event.clipboardData?.getData('text/html'), text: event.clipboardData?.getData('text/plain') };
    }));
    await native.bringToFront();
    const control = native.getByRole('textbox', { name: 'Independent destination', exact: true });
    await control.click(); await native.keyboard.press('ControlOrMeta+v');
    await expect(control).toHaveText('English child');
    await expect(control.locator('p')).toHaveCSS('direction', 'rtl');
    observations.delivered = await native.evaluate(() => (globalThis as any).__inheritedPaste);
    expect((observations.delivered as { trusted: boolean }).trusted).toBe(true);
    expect((observations.delivered as { html: string }).html).not.toContain('שלום anchor');
    await control.screenshot({ path: info.outputPath('independent-pasted-child.png') });
    await page.bringToFront();
    await host.getByRole('button', { name: 'Select destination', exact: true }).click();
    await page.keyboard.press('ControlOrMeta+v');
    const target = host.getByRole('textbox', { name: 'Destination document', exact: true });
    await expect(target).toHaveText('English child');
    await expect(target.locator('p')).toHaveCSS('direction', 'rtl');
    const pasted = await inspect(); observations.pasted = pasted;
    expect(pasted.target.content![0]!.attrs?.dir).toBe('rtl');
    expect(pasted.reports.at(-1)?.issues.some(issue => issue.lossy && issue.message.includes('direction snapshot'))).toBe(true);
    await target.screenshot({ path: info.outputPath('fountain-pasted-child.png') });
    await host.getByRole('button', { name: 'Undo destination', exact: true }).click();
    expect((await inspect()).target).toEqual(before.target);
    await host.getByRole('button', { name: 'Redo destination', exact: true }).click();
    expect((await inspect()).target).toEqual(pasted.target);
    expect((await inspect()).source).toEqual(before.source);
    expect(errors).toEqual([]);
  } finally {
    observations.errors = errors;
    await writeFile(info.outputPath('inherited-clipboard-observations.json'), JSON.stringify(observations, null, 2));
    await page.evaluate(() => globalThis.inheritedClipboardAudit.destroy());
    await native.close();
  }
});
