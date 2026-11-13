import { expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export async function prepareInvalidSavedDiagrams({ page, editor, toolbar, output, report }) {
  const controls = toolbar.getByRole('region', { name: 'Code block controls', exact: true });
  const cases = { mermaid: '! ! ! INVALID\n<img src=x onerror="alert(1)">',
    plantuml: '@startuml\nTHIS IS NOT A VALID PLANTUML DIAGRAM !!!\n@enduml' };
  report.nativeInvalidDiagrams = { valid: { ...report.nativeDiagrams }, source: cases, observations: [] };
  report.invalidDiagramImageResponses = [];
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin === 'http://127.0.0.1:5081' && url.pathname.startsWith('/png/'))
      report.invalidDiagramImageResponses.push({ status: response.status() });
  });
  for (const [language, source] of Object.entries(cases)) {
    await editor.locator(`pre[data-language="${language}"] code`).click();
    await controls.getByRole('button', { name: 'Edit diagram source', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Diagram source and preview', exact: true });
    await dialog.getByRole('textbox', { name: 'Diagram source', exact: true }).fill(source);
    await dialog.getByRole('button', { name: 'Apply diagram source', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect((await editor.locator(`pre[data-language="${language}"]`).textContent()).trimEnd()).toBe(source);
    await page.screenshot({ path: fileURLToPath(new URL(`${language}-invalid-native-source.png`, output)), fullPage: true });
  }
  report.checks.push('Actual native source dialogs preserve deliberately invalid Mermaid/PlantUML source for saving without pretending that it is a rendered diagram');
}

export async function assertInvalidSavedDiagrams({ page, description, report, output, phase }) {
  const { source } = report.nativeInvalidDiagrams;
  for (const [language, text] of Object.entries(source)) expect(description).toContain('```' + language + '\n' + text + '\n```');
  const reader = page.getByTestId('work-item-description');
  const expand = page.getByTestId('show-all-btn'); if (await expand.isVisible()) await expand.click();
  const frame = reader.frameLocator('iframe');
  const iframe = reader.locator('iframe');
  await iframe.locator('../..').scrollIntoViewIfNeeded();
  const mermaidNotice = reader.getByRole('alert').filter({ hasText: 'diagram could not be rendered' });
  let mermaidFailureVisible = true;
  try { await expect(mermaidNotice).toBeVisible({ timeout: 5000 }); } catch { mermaidFailureVisible = false; }
  const mermaid = { visibleFailure: mermaidFailureVisible,
    frameText: (await frame.locator('body').innerText()).slice(0, 800),
    retainedSourceVisible: await reader.locator('pre').filter({ hasText: source.mermaid }).evaluate(element => !element.classList.contains('gl-sr-only')),
    iframeHeight: (await iframe.boundingBox())?.height };
  await page.screenshot({ path: fileURLToPath(new URL(`invalid-mermaid-reader-${phase}.png`, output)), fullPage: true });
  const image = reader.locator('a[data-diagram="plantuml"] img');
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate(element => element.complete)).toBe(true);
  const plantuml = await image.evaluate(element => ({ complete: element.complete, naturalWidth: element.naturalWidth,
    naturalHeight: element.naturalHeight, hidden: !element.getBoundingClientRect().height }));
  const carrier = await reader.locator('a[data-diagram="plantuml"]').getAttribute('data-diagram-src');
  expect(Buffer.from(carrier.replace('data:text/plain;base64,', ''), 'base64').toString('utf8')).toBe(source.plantuml);
  await page.screenshot({ path: fileURLToPath(new URL(`invalid-plantuml-reader-${phase}.png`, output)), fullPage: true });
  report.nativeInvalidDiagrams.observations.push({ phase, mermaid, plantuml, browserErrors: [...report.browserErrors] });
  expect(mermaid.visibleFailure, 'A saved invalid Mermaid must have a visible reader error').toBe(true);
  expect(mermaid.retainedSourceVisible, 'The reader must expose the retained Mermaid source on failure').toBe(true);
  await expect(reader.locator('pre').filter({ hasText: source.mermaid })).toBeVisible();
  expect(await reader.locator('pre').filter({ hasText: source.mermaid }).locator('img').count()).toBe(0);
  expect(plantuml.naturalWidth > 0 || await reader.locator('[data-fountain-diagram-error="plantuml"]').isVisible(),
    'A saved invalid PlantUML must show its actual provider error image or a source-retaining reader fallback').toBe(true);
  await mermaidNotice.getByRole('button', { name: 'Retry diagram', exact: true }).click();
  await expect(mermaidNotice).toBeVisible();
  expect(await reader.locator('pre').filter({ hasText: source.mermaid }).textContent()).toBe(source.mermaid);
  if (phase === 'saved') {
    const accessibility = await mermaidNotice.locator('../..').evaluate(element => window.axe.run(element));
    expect(accessibility.violations).toEqual([]);
    report.nativeInvalidDiagrams.accessibilityViolations = accessibility.violations;
    await page.setViewportSize({ width: 360, height: 900 });
    await mermaidNotice.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: fileURLToPath(new URL('invalid-mermaid-reader-mobile.png', output)), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  (report.nativeDiagramReaderPhases ??= []).push(phase);
}

export async function repairInvalidSavedDiagrams({ page, report, output }) {
  await page.getByTestId('work-item-edit-form-button').click();
  const wrapper = page.getByTestId('work-item-description-wrapper');
  const editor = wrapper.locator('[contenteditable="true"]');
  await expect(editor).toBeVisible();
  const controls = wrapper.getByRole('region', { name: 'Code block controls', exact: true });
  for (const language of ['mermaid', 'plantuml']) {
    await editor.locator(`pre[data-language="${language}"] code`).click();
    await controls.getByRole('button', { name: 'Edit diagram source', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Diagram source and preview', exact: true });
    const input = dialog.getByRole('textbox', { name: 'Diagram source', exact: true });
    await expect(input).toHaveValue(report.nativeInvalidDiagrams.source[language]);
    await input.fill(report.nativeInvalidDiagrams.valid[language + 'Text']);
    const preview = dialog.getByRole('region', { name: 'Diagram preview', exact: true });
    if (language === 'mermaid') await expect(preview.frameLocator('iframe').locator('svg')).toContainText('Published');
    else await expect.poll(() => preview.getByRole('img').evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: fileURLToPath(new URL(`${language}-repair-native-source.png`, output)), fullPage: true });
    await dialog.getByRole('button', { name: 'Apply diagram source', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByTestId('work-item-edit-form-button')).toBeVisible();
}
