import { expect, test, type Locator } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const nested = (dir: string) => `<ul dir="ltr"><li><p>Outer parent</p><ol dir="${dir}" start="0"><li><p>שלום anchor</p></li><li><p>English selected</p></li><li><p>English tail</p></li></ol></li><li><p>Outer after</p></li></ul>`;
const indent = (fixed: boolean) => `<ol dir="auto" start="0"><li><p>שלום anchor</p></li><li${fixed ? ' dir="ltr"' : ''}><p>Parent paragraph</p></li><li><p>English selected</p></li><li><p>English tail</p></li></ol>`;
const cases = [
  { name: 'nested-lift-auto', source: nested('auto'), action: 'Lift list item' },
  { name: 'nested-lift-fixed-control', source: nested('rtl'), action: 'Lift list item' },
  { name: 'indent-under-fixed-item', source: indent(true), action: 'Indent list item' },
  { name: 'indent-same-context-control', source: indent(false), action: 'Indent list item' },
] as const;

const directions = (root: Locator) => root.locator('p').evaluateAll(elements => elements
  .filter(element => element.textContent?.trim())
  .map(element => ({ text: element.textContent, direction: getComputedStyle(element).direction })));

// Pointer/keyboard use of the actual public importer, toolbar, history and
// download. No editor API calls, synthetic events or DOM selection writes.
// Soft fidelity assertions retain subsequent export/history evidence rather
// than hiding it behind the first known mismatch. Failures remain failures.
for (const sample of cases) test(sample.name, async ({ page }, info) => {
  const observations: Record<string, unknown> = { source: sample.source, sample: sample.name };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const native = await page.context().newPage();
  try {
    await native.setContent(`<style>body{font:18px/1.5 sans-serif;padding:24px}p{margin:16px 0}</style>${sample.source}`);
    const nativeBefore = await directions(native.locator('body'));
    observations.nativeBefore = nativeBefore;
    await native.locator('body').screenshot({ path: info.outputPath('nested-native-before.png') });
    // Independent native source establishes that changing the group's first
    // strong character changes its shared automatic direction. This is oracle
    // setup only; every Fountain edit below uses real keyboard input.
    await native.setContent(sample.source.replace('שלום anchor', 'English שלום anchor'));
    const nativeAfterAnchorEdit = await directions(native.locator('body'));
    observations.nativeAfterAnchorEdit = nativeAfterAnchorEdit;

    await page.goto('/conversion-lab.html');
    const name = `${sample.name}.html`;
    await page.getByLabel('Choose documents').setInputFiles({ name, mimeType: 'text/html', buffer: Buffer.from(sample.source) });
    const workspace = page.getByRole('region', { name: `Conversion workspace: ${name}`, exact: true });
    const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
    const selected = editor.locator('p').filter({ hasText: 'English selected' });
    await expect(selected).toBeVisible();
    const imported = await directions(editor);
    observations.imported = imported;
    expect(imported).toEqual(nativeBefore);
    const download = async (format: 'json' | 'html') => {
      await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption(format);
      const pending = page.waitForEvent('download');
      await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
      return readFile((await (await pending).path())!, 'utf8');
    };
    const originalJSON = JSON.parse(await download('json'));
    observations.originalJSON = originalJSON;
    await selected.click();
    await workspace.getByRole('button', { name: sample.action, exact: true }).click();
    observations.transformed = await directions(editor);
    expect.soft(observations.transformed, 'shared direction must survive toolbar reparenting').toEqual(nativeBefore);
    await editor.screenshot({ path: info.outputPath('nested-toolbar-transformed.png') });
    const transformedJSON = JSON.parse(await download('json'));
    observations.transformedJSON = transformedJSON;
    await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(JSON.parse(await download('json')), 'transform undo restores complete JSON').toEqual(originalJSON);
    await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
    expect(JSON.parse(await download('json')), 'transform redo restores complete JSON').toEqual(transformedJSON);

    const html = await download('html');
    await native.setContent(html);
    observations.exportedReader = await directions(native.locator('body'));
    expect.soft(observations.exportedReader, 'downloaded HTML must retain the source direction').toEqual(nativeBefore);
    await native.locator('body').screenshot({ path: info.outputPath('nested-exported-reader.png') });

    const anchor = editor.locator('p').filter({ hasText: 'שלום anchor' });
    await anchor.click();
    await page.keyboard.press('Home');
    await page.keyboard.insertText('English ');
    // A native-input failure here is distinct from a direction-scope failure.
    await expect(anchor).toHaveText('English שלום anchor');
    observations.afterAnchorEdit = await directions(editor);
    expect.soft(observations.afterAnchorEdit, 'the retained shared group must still respond to first-strong edits').toEqual(nativeAfterAnchorEdit);
    await editor.screenshot({ path: info.outputPath('nested-anchor-edited.png') });
    await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(JSON.parse(await download('json')), 'typing undo restores the complete transformed JSON').toEqual(transformedJSON);
    expect(errors).toEqual([]);
  } finally {
    observations.pageErrors = errors;
    await writeFile(info.outputPath('nested-direction-observations.json'), JSON.stringify(observations, null, 2));
    await native.close();
  }
});
