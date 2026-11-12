import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export async function auditNativeReferences({ page, context, editor, toolbar, output, report }) {
  const fixtures = JSON.parse(await readFile(new URL('../integrations/gitlab/fixtures/reference-live-html.json', import.meta.url)));
  if (fixtures.upstream.revision !== report.pin.commit) throw new Error('Reference fixtures use a different GitLab revision');
  const records = fixtures.referenceRecords;
  const issue = `#${records.issueIID}`, mr = `!${records.mergeRequestIID}`;
  const qualified = `${records.projectPath}${issue}`, label = `~"${records.label}"`;
  const boundaries = process.argv.includes('--reference-contexts');
  const source = `Reference controls: ${issue} ${mr} @root ${label}\n\nQualified reference: ${qualified}`
    + (boundaries ? `\n\nContext boundaries: ${issue} ${mr} @root ${label}` : '');
  const origin = new URL(page.url()).origin;
  const section = toolbar.getByRole('region', { name: 'Reference controls', exact: true });
  const field = () => section.getByRole('combobox', { name: 'Reference display', exact: true });
  const paragraph = editor.locator(':scope > p').filter({ hasText: 'Reference controls:' });
  const qualifiedParagraph = editor.locator(':scope > p').filter({ hasText: 'Qualified reference:' });
  const reference = (original, parent = paragraph) => parent.locator(`a[data-fountain-gitlab-reference][data-original=${JSON.stringify(original)}]`);
  const screenshot = name => page.screenshot({ path: fileURLToPath(new URL(name, output)), fullPage: true, caret: 'initial' });
  const choose = async format => {
    await field().selectOption(format);
    await section.getByRole('button', { name: 'Apply reference display', exact: true }).click();
  };
  await editor.getByText('Recovered paste', { exact: true }).click(); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  const bold = toolbar.getByRole('button', { name: 'Bold', exact: true });
  if (await bold.getAttribute('aria-pressed') === 'true') await bold.click();
  await page.evaluate(value => navigator.clipboard.writeText(value), source);
  const rendering = page.waitForResponse(response => {
    if (response.request().method() !== 'POST' || !response.ok()) return false;
    try { return response.request().postDataJSON()?.text === source; } catch { return false; }
  });
  await toolbar.getByRole('button', { name: 'Paste Markdown', exact: true }).click();
  report.nativeReferenceRendering = (await (await rendering).json()).body;
  await expect(reference(issue)).toBeVisible(); const authorURL = page.url();
  await reference(issue).click(); await expect(section).toBeVisible(); expect(page.url()).toBe(authorURL);
  await expect(field()).toHaveValue('id');
  await choose('title'); await expect(reference(issue + '+')).toContainText('Fountain reference controls fixture: & <review>');
  await expect(editor.locator('review')).toHaveCount(0); await screenshot('reference-title.png');
  await choose('summary'); await expect(reference(issue + '+s')).toContainText('Unassigned');
  await toolbar.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(reference(issue + '+')).toBeVisible();
  await toolbar.getByRole('button', { name: 'Redo', exact: true }).click(); await expect(reference(issue + '+s')).toBeVisible();
  report.checks.push('Real issue references select without navigating; ID/title/summary changes use the live renderer, retain literal title text and participate in one-step undo/redo');
  await reference(issue + '+s').click(); await field().selectOption('id');
  await context.setOffline(true);
  try {
    await section.getByRole('button', { name: 'Apply reference display', exact: true }).click();
    await expect(section.getByRole('alert')).toContainText('display choice are retained');
    await expect(reference(issue + '+s')).toBeVisible(); await expect(field()).toHaveValue('id');
    await screenshot('reference-offline-draft.png');
  } finally { await context.setOffline(false); }
  await editor.getByText('Recovered paste', { exact: true }).click(); await page.keyboard.press('End');
  await page.keyboard.type(' Reference retry cursor.');
  await section.getByRole('button', { name: 'Apply reference display', exact: true }).click();
  await expect(reference(issue)).toBeVisible();
  await page.keyboard.type(' Continued after retry.');
  await expect(editor.getByText(/Reference retry cursor\. Continued after retry\./u)).toBeVisible();
  await reference(issue).click(); await choose('summary'); await expect(reference(issue + '+s')).toBeVisible();
  report.checks.push('Actual offline reference resolution retains the draft and source; after typing elsewhere, online retry updates the captured reference and subsequent typing stays at the moved cursor');
  await reference(mr).click(); await expect(field()).toHaveValue('id');
  await choose('title'); await expect(reference(mr + '+')).toContainText('Fountain reference controls fixture: & <review>');
  await choose('summary'); await expect(reference(mr + '+s')).toContainText('Unassigned');
  await reference(qualified, qualifiedParagraph).click(); await choose('title');
  await expect(reference(qualified + '+', qualifiedParagraph)).toBeVisible();
  report.checks.push('An actual merge request supports title/summary display; a project-qualified issue reference retains its qualified source while changing display');
  await reference(issue + '+s').click();
  const href = await reference(issue + '+s').getAttribute('href');
  const address = new URL(href, page.url()).href; expect(new URL(address).origin).toBe(origin);
  await section.getByRole('button', { name: 'Copy reference URL', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(address);
  const opened = page.waitForEvent('popup');
  await section.getByRole('link', { name: 'Open reference', exact: true }).click();
  const popup = await opened;
  try {
    await popup.waitForLoadState('domcontentloaded'); expect(popup.url()).toBe(address);
    await expect(popup.getByTestId('work-item-title')).toBeVisible();
    await expect(popup.getByTestId('work-item-title')).toContainText('Fountain reference controls fixture: & <review>');
  } finally { await popup.close(); }
  expect(page.url()).toBe(authorURL);
  report.checks.push('Copy writes the actual absolute reference URL to the system clipboard; Open navigates an authenticated new tab to the real issue without losing the author draft');
  await reference('@root').click(); await expect(field()).toHaveCount(0);
  await section.getByRole('button', { name: 'Copy reference URL', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(origin + '/root');
  await section.getByRole('button', { name: 'Remove reference', exact: true }).click(); await expect(reference('@root')).toHaveCount(0);
  await page.keyboard.type('replacement text'); await expect(paragraph).toContainText('replacement text');
  await toolbar.getByRole('button', { name: 'Undo', exact: true }).click();
  await toolbar.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(reference('@root')).toBeVisible();
  await reference(label).click(); await expect(field()).toHaveCount(0);
  await section.getByRole('button', { name: 'Remove reference', exact: true }).click(); await expect(reference(label)).toHaveCount(0);
  await toolbar.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(reference(label)).toBeVisible();
  await expect(paragraph).toHaveCount(1); await screenshot('references-native-controls.png');
  report.checks.push('Real user/colored-label references offer copy/navigation/removal without unsupported display choices; removal, native typing and undo preserve their paragraph and restore the original source');
  report.nativeReferences = { records, labelSource: label, paragraphSource: `Reference controls: ${issue}+s ${mr}+s @root ${label}`,
    expected: [
      { original: issue + '+s', type: 'issue', href, text: 'Unassigned' },
      { original: mr + '+s', type: 'merge_request', href: await reference(mr + '+s').getAttribute('href'), text: 'Unassigned' },
      { original: qualified + '+', type: 'issue', href: await reference(qualified + '+', qualifiedParagraph).getAttribute('href'), text: 'Fountain reference controls fixture: & <review>' },
    ], authorURL, copiedURL: address };
  if (boundaries) {
    const boundaryParagraph = editor.locator(':scope > p').filter({ hasText: 'Context boundaries:' });
    const expected = [];
    for (const original of [issue, mr, '@root', label]) {
      const atom = reference(original, boundaryParagraph);
      const type = await atom.getAttribute('data-fountain-gitlab-reference');
      const href = await atom.getAttribute('href'), text = await atom.textContent();
      await atom.click(); await page.keyboard.press('ArrowLeft'); await page.keyboard.type('prefix');
      await atom.click(); await page.keyboard.press('ArrowRight'); await page.keyboard.type('suffix');
      await expect(boundaryParagraph).toContainText(`prefix${text}suffix`);
      await expect(atom).toHaveCount(1);
      expected.push({ original, type, href, text });
    }
    report.nativeReferences.boundaries = expected;
    await screenshot('reference-context-native-edits.png');
    report.checks.push('Native keyboard typing immediately before and after issue/MR/user/label atoms preserves each reference without inserting visible separators');
  }
}

export async function assertSavedNativeReferences({ page, description, report, output, phase }) {
  const data = report.nativeReferences;
  expect(description).toContain(data.paragraphSource);
  expect(description).toContain(`Qualified reference: ${data.expected[2].original}`);
  const reader = page.getByTestId('work-item-description');
  const expand = page.getByTestId('show-all-btn'); if (await expand.isVisible()) await expand.click();
  for (const expected of data.expected) {
    const anchor = reader.locator(`a[data-reference-type=${JSON.stringify(expected.type)}][data-original=${JSON.stringify(expected.original)}]`);
    await expect(anchor).toHaveCount(1); await expect(anchor).toContainText(expected.text);
    await expect(anchor).toHaveAttribute('href', expected.href);
  }
  await expect(reader.locator('p').filter({ hasText: 'Reference controls:' }).locator('a[data-reference-type="label"]').filter({ hasText: data.records.label })).toHaveCount(1);
  if (data.boundaries) {
    const paragraph = reader.locator('p').filter({ hasText: 'Context boundaries:' });
    for (const expected of data.boundaries) {
      const escaped = expected.original.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      expect(description).toContain(`prefix<span>${escaped}</span>suffix`);
      const anchor = paragraph.locator(`a[data-reference-type=${JSON.stringify(expected.type)}]`);
      await expect(anchor).toHaveCount(1); await expect(anchor).toHaveText(expected.text);
      await expect(anchor).toHaveAttribute('href', expected.href);
      await expect(paragraph).toContainText(`prefix${expected.text}suffix`);
    }
    await paragraph.scrollIntoViewIfNeeded();
    await page.screenshot({ path: fileURLToPath(new URL(`reference-context-reader-${phase}.png`, output)), fullPage: true });
    (report.nativeReferenceContextReaderPhases ??= []).push(phase);
  }
  await reader.locator(`a[data-original=${JSON.stringify(data.expected[2].original)}]`).scrollIntoViewIfNeeded();
  await page.screenshot({ path: fileURLToPath(new URL(`references-reader-${phase}.png`, output)), fullPage: true });
  (report.nativeReferenceReaderPhases ??= []).push(phase);
}
