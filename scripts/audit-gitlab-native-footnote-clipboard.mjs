import { expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Model APIs are deliberately absent: create, select, copy, paste and history
// all pass through the actual GitLab application and trusted browser input.
export async function auditNativeFootnoteClipboard({ page, editor, toolbar, output, report, move = false }) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const definitions = editor.locator('[data-fountain-footnote-definition]');
  const references = editor.locator('sup[data-fountain-footnote-reference]');
  const graph = () => editor.evaluate(root => ({
    definitions: [...root.querySelectorAll('[data-fountain-footnote-definition]')].map(node => ({
      id: node.getAttribute('data-fountain-footnote-definition'), label: node.getAttribute('data-gitlab-footnote-label'),
      text: node.textContent, strong: [...node.querySelectorAll('strong')].map(mark => mark.textContent),
    })),
    references: [...root.querySelectorAll('sup[data-fountain-footnote-reference]')].map(node => ({
      id: node.getAttribute('data-fountain-footnote-reference'), label: node.getAttribute('data-gitlab-footnote-label'),
    })),
  }));
  await definitions.first().locator('p').click();
  await page.keyboard.press('Home'); await page.keyboard.press('Shift+End');
  await page.keyboard.press('Control+b');
  await expect(definitions.first().locator('strong')).toHaveText(report.nativeFootnotes.bodies[0]);
  const before = await graph();
  const main = editor.locator('p').filter({ hasText: 'End of the original description.' }).first();
  await main.click(); await page.keyboard.press('Home'); await page.keyboard.press('Shift+End');
  await page.keyboard.press('Control+c');
  const plain = await page.evaluate(() => navigator.clipboard.readText());
  expect(plain).toContain('[^evidence]'); expect(plain).toContain('[^2]');
  for (const text of report.nativeFootnotes.bodies) expect(plain).toContain(text);
  const continuation = editor.locator('p').filter({ hasText: 'A continuation before the endnotes.' });
  await continuation.click(); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await page.keyboard.press('Control+v');
  await expect(definitions).toHaveCount(4); await expect(references).toHaveCount(6);
  const pasted = await graph();
  expect(new Set(pasted.definitions.map(note => note.id)).size).toBe(4);
  expect(new Set(pasted.definitions.map(note => note.label)).size).toBe(4);
  expect(pasted.references.slice(0, 3)).toEqual(before.references);
  for (let index = 0; index < 2; index++) {
    expect(pasted.definitions[index]).toEqual(before.definitions[index]);
    const duplicate = pasted.definitions[index + 2], original = before.definitions[index];
    expect(duplicate.id).not.toBe(original.id); expect(duplicate.label).not.toBe(original.label);
    expect(duplicate.text).toBe(original.text); expect(duplicate.strong).toEqual(original.strong);
  }
  for (const reference of pasted.references) {
    expect(pasted.definitions.filter(note => note.id === reference.id && note.label === reference.label)).toHaveLength(1);
  }
  expect(pasted.references[3].id).toBe(pasted.references[5].id);
  expect(pasted.references[3].id).not.toBe(pasted.references[4].id);
  await toolbar.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(definitions).toHaveCount(2); await expect(references).toHaveCount(3);
  expect(await graph()).toEqual(before);
  await toolbar.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(definitions).toHaveCount(4); expect(await graph()).toEqual(pasted);
  await page.screenshot({ path: fileURLToPath(new URL('footnote-copied-graph.png', output)), fullPage: true });
  let final = pasted;
  if (move) {
    const paragraphs = editor.locator('p').filter({ hasText: 'End of the original description.' });
    await expect(paragraphs).toHaveCount(2);
    await paragraphs.first().click({ position: { x: 20, y: 10 } });
    await page.keyboard.press('Home'); await page.keyboard.press('Shift+End'); await page.keyboard.press('Control+x');
    await expect(paragraphs).toHaveCount(1); await expect(references).toHaveCount(3); await expect(definitions).toHaveCount(4);
    const cut = await graph();
    expect(cut.definitions).toEqual(pasted.definitions);
    await continuation.click({ position: { x: 20, y: 10 } }); await page.keyboard.press('End'); await page.keyboard.press('Control+v');
    await expect(paragraphs).toHaveCount(2); await expect(references).toHaveCount(6); await expect(definitions).toHaveCount(4);
    const moved = await graph(); expect(moved.definitions).toEqual(pasted.definitions);
    for (const reference of moved.references) expect(moved.definitions.filter(note => note.id === reference.id && note.label === reference.label)).toHaveLength(1);
    await toolbar.getByRole('button', { name: 'Undo', exact: true }).click(); expect(await graph()).toEqual(cut);
    await toolbar.getByRole('button', { name: 'Undo', exact: true }).click(); expect(await graph()).toEqual(pasted);
    await toolbar.getByRole('button', { name: 'Redo', exact: true }).click(); expect(await graph()).toEqual(cut);
    await toolbar.getByRole('button', { name: 'Redo', exact: true }).click(); expect(await graph()).toEqual(moved);
    final = moved;
    report.nativeFootnoteCut = { before: pasted, cut, moved };
    await page.screenshot({ path: fileURLToPath(new URL('footnote-cut-moved-graph.png', output)), fullPage: true });
    report.checks.push('Trusted cut moves all three references while retaining the four original/copied definitions, source labels and bold marks; separate cut/paste Undo and Redo restore each graph');
  }
  report.nativeFootnoteClipboard = { ...final, plain };
  report.checks.push('Trusted copy includes both owned footnote bodies; native paste creates two fresh identities and collision-free source labels, retains shared references and bold text, and one Undo/Redo restores the whole graph');
}

export async function assertSavedNativeFootnoteClipboard({ page, description, report, phase }) {
  const expected = report.nativeFootnoteClipboard;
  const sourceDefinitions = [...description.matchAll(/^\[\^([^\]]+)\]:/gmu)].map(match => match[1]);
  const sourceReferences = [...description.matchAll(/\[\^([^\]]+)\](?!:)/gu)].map(match => match[1]);
  expect(sourceDefinitions).toEqual(expected.definitions.map(note => note.label));
  expect(sourceReferences).toEqual(expected.references.map(reference => reference.label));
  const reader = page.getByTestId('work-item-description');
  const notes = reader.locator('section[data-footnotes] > ol > li');
  const references = reader.locator('sup a[data-footnote-ref]');
  await expect(notes).toHaveCount(4); await expect(references).toHaveCount(6);
  const ids = await notes.evaluateAll(nodes => nodes.map(node => node.id));
  expect(new Set(ids).size).toBe(4);
  for (const definition of expected.definitions) {
    const targets = ids.filter(id => id.startsWith(`fn-${definition.label}-`));
    expect(targets).toHaveLength(1);
    const body = reader.locator(`li[id="${targets[0]}"]`);
    await expect(body).toContainText(definition.text);
    expect(await body.locator('strong').allTextContents()).toEqual(definition.strong);
  }
  report.checks.push(`Four copied/original definitions retain their source labels, bodies and marks in the saved Markdown and actual reader (${phase})`);
  for (let index = 0; index < expected.references.length; index++) {
    const reference = references.nth(index), expectedReference = expected.references[index];
    const id = ids.find(id => id.startsWith(`fn-${expectedReference.label}-`));
    await expect(reference).toHaveAttribute('href', `#${id}`);
    const referenceID = await reference.getAttribute('id'); expect(referenceID).toBeTruthy();
    await reference.click();
    const target = reader.locator(`li[id="${id}"]`);
    await expect(target).toBeInViewport(); expect(new URL(page.url()).hash).toBe(`#${id}`);
    const backlink = target.locator(`a[data-footnote-backref][href="#${referenceID}"]`);
    await expect(backlink).toHaveCount(1); await backlink.click();
    await expect(reference).toBeInViewport(); expect(new URL(page.url()).hash).toBe(`#${referenceID}`);
  }
  report.checks.push(`All six real reader references and their individual backlinks navigate to the correct copied/original note (${phase})`);
}
