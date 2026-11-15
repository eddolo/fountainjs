import { expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const readGraph = editor => editor.evaluate(root => {
  const tables = [...root.querySelectorAll(':scope > table')];
  const text = cell => {
    const copy = cell.cloneNode(true);
    for (const reference of copy.querySelectorAll('[data-fountain-footnote-reference],a[data-footnote-ref]'))
      (reference.tagName === 'A' ? reference.parentElement : reference).remove();
    return copy.textContent.replace(/\s+/gu, ' ').trim();
  };
  return {
    blocks: [...root.children].filter(node => node.hasAttribute('data-fountain-node')).map(node => ({
      type: node.getAttribute('data-fountain-node'), text: node.textContent,
    })),
    tables: tables.map(table => [...table.rows].map(row => [...row.cells].map(cell => ({
      type: cell.tagName, text: text(cell), rowspan: cell.rowSpan, colspan: cell.colSpan,
      strong: [...cell.querySelectorAll('strong')].map(node => node.textContent),
    })))),
    definitions: [...root.querySelectorAll('[data-fountain-footnote-definition]')].map(node => ({
      id: node.getAttribute('data-fountain-footnote-definition'), label: node.getAttribute('data-gitlab-footnote-label'),
      text: node.textContent, strong: [...node.querySelectorAll('strong')].map(mark => mark.textContent),
    })),
    references: [...root.querySelectorAll('sup[data-fountain-footnote-reference]')].map(node => ({
      id: node.getAttribute('data-fountain-footnote-reference'), label: node.getAttribute('data-gitlab-footnote-label'),
      table: tables.indexOf(node.closest('table')),
    })),
  };
});

export async function auditNativeTableClipboard({ page, editor, toolbar, output, report }) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const main = editor.locator('p').filter({ hasText: 'End of the original description.' }).first();
  await main.click(); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  const markdown = '| Stage | Owner |\n| --- | --- |\n| Evidence **one**[^grid] | Ada |\n| Next **two** | Grace |\n\n[^grid]: **Grid body.**';
  await page.evaluate(value => navigator.clipboard.writeText(value), markdown);
  await toolbar.getByRole('button', { name: 'Paste Markdown', exact: true }).click();
  const source = editor.locator('table').filter({ hasText: 'Owner' });
  const destination = editor.locator('table').filter({ hasText: 'Status' });
  const definitions = editor.locator('[data-fountain-footnote-definition]');
  await expect(source).toHaveCount(1); await expect(definitions).toHaveCount(1);
  await expect(source.locator('td strong')).toHaveText(['one', 'two']);
  const before = await readGraph(editor);
  await source.locator('td p').first().click();
  await page.keyboard.press('Alt+Shift+ArrowRight'); await page.keyboard.press('Alt+Shift+ArrowDown');
  await page.keyboard.press('Control+c');
  const copiedText = await page.evaluate(() => navigator.clipboard.readText());
  expect(copiedText).toContain('Evidence one'); expect(copiedText).toContain('\tAda\nNext two\tGrace');
  expect(copiedText).toContain('Grid body.'); expect(copiedText).toContain(`[^${before.definitions[0].label}]`);
  await destination.getByText('Save', { exact: true }).click(); await page.keyboard.press('End');
  await page.keyboard.press('Control+v');
  await expect(destination.locator('tr')).toHaveCount(3); await expect(definitions).toHaveCount(2);
  await expect(destination.locator('td strong')).toHaveText(['one', 'two']);
  await expect(editor.locator('table')).toHaveCount(2);
  const pasted = await readGraph(editor);
  expect(pasted.definitions[0]).toEqual(before.definitions[0]);
  expect(pasted.definitions[1].id).not.toBe(before.definitions[0].id);
  expect(pasted.definitions[1].label).not.toBe(before.definitions[0].label);
  await toolbar.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await readGraph(editor)).toEqual(before);
  await toolbar.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await readGraph(editor)).toEqual(pasted);
  await destination.scrollIntoViewIfNeeded();
  await page.screenshot({ path: fileURLToPath(new URL('table-cell-grid-pasted.png', output)), fullPage: true });
  report.checks.push('Trusted cell-range copy includes its owned note; rich paste grows the real GitLab table, preserves cell roles/marks and note ownership, and one Undo/Redo restores both graphs');

  // A body-only slice is not a GFM header table. Refuse it outside a table
  // rather than silently promoting the first data row to column headers.
  await main.click(); await page.keyboard.press('End');
  const beforeRefusal = await readGraph(editor); await page.keyboard.press('Control+v');
  await expect(page.getByTestId('work-item-description-wrapper').getByTestId('content-editor-error')).toBeVisible();
  expect(await readGraph(editor)).toEqual(beforeRefusal);
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await page.screenshot({ path: fileURLToPath(new URL('table-body-slice-refused.png', output)), fullPage: true });
  report.checks.push('A body-row-only table slice refuses standalone GitLab Markdown insertion without changing cell roles, source content or owned notes; editing stays available');

  await source.locator('th p').first().click();
  await page.keyboard.press('Alt+Shift+ArrowRight'); await page.keyboard.press('Alt+Shift+ArrowDown');
  await page.keyboard.press('Alt+Shift+ArrowDown'); await page.keyboard.press('Control+c');
  await main.click(); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  const beforeDocumentPaste = await readGraph(editor); await page.keyboard.press('Control+v');
  await expect(editor.locator('table')).toHaveCount(3); await expect(definitions).toHaveCount(3);
  await expect(page.getByTestId('work-item-description-wrapper').getByTestId('content-editor-error')).toHaveCount(0);
  const final = await readGraph(editor);
  expect(final.references).toHaveLength(3);
  expect(new Set(final.definitions.map(note => note.id)).size).toBe(3);
  expect(new Set(final.definitions.map(note => note.label)).size).toBe(3);
  for (const reference of final.references) expect(final.definitions.filter(note => note.id === reference.id && note.label === reference.label)).toHaveLength(1);
  await toolbar.getByRole('button', { name: 'Undo', exact: true }).click(); expect(await readGraph(editor)).toEqual(beforeDocumentPaste);
  await toolbar.getByRole('button', { name: 'Redo', exact: true }).click(); expect(await readGraph(editor)).toEqual(final);
  const installation = JSON.parse(await readFile(new URL('../artifacts/gitlab-native-browser-install/install.json', import.meta.url)));
  const require = createRequire(installation.source + '/storybook/package.json');
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const accessibility = await editor.evaluate(element => window.axe.run(element));
  expect(accessibility.violations).toEqual([]);
  report.nativeTableClipboard = { ...final, copiedText, refusedBodySlice: true, accessibility: accessibility.violations };
  await page.screenshot({ path: fileURLToPath(new URL('table-document-copy.png', output)), fullPage: true });
  report.checks.push('Copying the full header/body table into prose succeeds after refusal, preserves three independent note identities and marks, supports atomic history, clears the error, and passes a whole-editor accessibility scan');
}

export async function assertSavedNativeTableClipboard({ page, description, report, phase }) {
  const expected = report.nativeTableClipboard, reader = page.getByTestId('work-item-description');
  expect([...description.matchAll(/^\[\^([^\]]+)\]:/gmu)].map(match => match[1])).toEqual(expected.definitions.map(note => note.label));
  expect([...description.matchAll(/\[\^([^\]]+)\](?!:)/gu)].map(match => match[1])).toEqual(expected.references.map(reference => reference.label));
  const tables = await reader.locator('table').evaluateAll(tables => tables.map(table => [...table.rows].map(row => [...row.cells].map(cell => {
    const copy = cell.cloneNode(true);
    for (const reference of copy.querySelectorAll('a[data-footnote-ref]')) reference.parentElement.remove();
    return { type: cell.tagName, text: copy.textContent.replace(/\s+/gu, ' ').trim(), rowspan: cell.rowSpan, colspan: cell.colSpan,
      strong: [...cell.querySelectorAll('strong')].map(node => node.textContent) };
  }))));
  expect(tables).toEqual(expected.tables);
  const notes = reader.locator('section[data-footnotes] > ol > li'), references = reader.locator('sup a[data-footnote-ref]');
  await expect(notes).toHaveCount(3); await expect(references).toHaveCount(3);
  const ids = await notes.evaluateAll(nodes => nodes.map(node => node.id));
  for (const definition of expected.definitions) {
    const matches = ids.filter(id => id.startsWith(`fn-${definition.label}-`)); expect(matches).toHaveLength(1);
    const target = reader.locator(`li[id="${matches[0]}"]`);
    await expect(target).toContainText(definition.text); expect(await target.locator('strong').allTextContents()).toEqual(definition.strong);
  }
  for (let index = 0; index < expected.references.length; index++) {
    const reference = references.nth(index), id = ids.find(id => id.startsWith(`fn-${expected.references[index].label}-`));
    await expect(reference).toHaveAttribute('href', `#${id}`); const returnID = await reference.getAttribute('id');
    await reference.click(); await expect(reader.locator(`li[id="${id}"]`)).toBeInViewport();
    expect(new URL(page.url()).hash).toBe(`#${id}`);
    await reader.locator(`li[id="${id}"] a[data-footnote-backref][href="#${returnID}"]`).click();
    await expect(reference).toBeInViewport(); expect(new URL(page.url()).hash).toBe(`#${returnID}`);
  }
  report.checks.push(`All three real tables retain their cell roles, geometry, text and marks with three correctly linked notes in saved source and reader (${phase})`);
}
