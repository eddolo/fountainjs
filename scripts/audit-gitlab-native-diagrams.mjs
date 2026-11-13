import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export async function auditNativeDiagrams({ page, context, editor, toolbar, output, report }) {
  const mermaidSource = 'graph LR\n  Draft-->Review';
  const plantumlSource = '@startuml\nAlice -> Bob: Review request\nBob --> Alice: Approved\n@enduml';
  const source = '```mermaid\n' + mermaidSource + '\n```\n\n```plantuml\n' + plantumlSource + '\n```\n\nAfter diagrams.';
  const mermaid = editor.locator('pre[data-language="mermaid"]');
  const plantuml = editor.locator('pre[data-language="plantuml"]');
  const controls = toolbar.getByRole('region', { name: 'Code block controls', exact: true });
  const preview = () => controls.getByRole('region', { name: 'Diagram preview', exact: true });
  const frame = () => preview().frameLocator('iframe[title="Mermaid diagram preview"]');
  const screenshot = name => page.screenshot({ path: fileURLToPath(new URL(name, output)), fullPage: true, caret: 'initial' });
  const created = [];
  const selectLastLine = async pre => {
    const code = pre.locator('code');
    await code.scrollIntoViewIfNeeded();
    const rect = await code.boundingBox();
    const measured = await code.evaluate(element => Number.parseFloat(getComputedStyle(element).lineHeight));
    const height = Number.isFinite(measured) && measured > 0 ? measured : rect.height / (await code.textContent()).trimEnd().split('\n').length;
    await page.mouse.click(rect.x + Math.min(70, rect.width - 4), rect.y + rect.height - height / 2);
    await page.keyboard.press('Home'); await page.keyboard.press('Shift+End');
    expect((await page.evaluate(() => getSelection().toString())).trim()).toBe((await code.textContent()).trimEnd().split('\n').at(-1).trim());
  };
  for (const [language, text] of [['mermaid', 'graph LR\n  Created-->Natively'],
    ['plantuml', '@startuml\nCreated -> Natively: Created through toolbar\n@enduml']]) {
    await editor.getByText('Recovered paste', { exact: true }).click();
    await page.keyboard.press('End'); await page.keyboard.press('Enter');
    await toolbar.getByRole('combobox', { name: 'Text style', exact: true }).selectOption(language);
    const block = editor.locator(`pre[data-language="${language}"]`);
    await expect(block).toHaveCount(1); await block.locator('code').click();
    await expect(toolbar.getByRole('button', { name: 'Bold', exact: true })).toBeDisabled();
    await page.keyboard.press('Control+b');
    for (const [index, line] of text.split('\n').entries()) {
      if (index) await page.keyboard.press('Enter');
      await page.keyboard.type(line);
    }
    expect((await block.textContent()).trimEnd()).toBe(text);
    await controls.getByRole('button', { name: 'Show diagram preview', exact: true }).click();
    if (language === 'mermaid') await expect(frame().locator('svg')).toContainText('Natively');
    else await expect.poll(() => preview().getByRole('img').evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
    await preview().scrollIntoViewIfNeeded(); await screenshot(`${language}-created-from-toolbar.png`);
    await controls.getByRole('button', { name: 'Delete code block', exact: true }).click(); await expect(block).toHaveCount(0);
    await toolbar.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(block).toHaveCount(1);
    expect((await block.textContent()).trimEnd()).toBe(text);
    await toolbar.getByRole('button', { name: 'Redo', exact: true }).click(); await expect(block).toHaveCount(0);
    created.push({ language, source: text });
    report.checks.push(`${language}: the actual block-type selector creates a new block; native multiline typing and real preview work, and delete/undo/redo retain every source character`);
  }
  await editor.getByText('Recovered paste', { exact: true }).click();
  await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await page.evaluate(value => navigator.clipboard.writeText(value), source);
  const rendered = page.waitForResponse(response => {
    if (!response.ok() || response.request().method() !== 'POST') return false;
    try { return response.request().postDataJSON()?.text === source; } catch { return false; }
  });
  await toolbar.getByRole('button', { name: 'Paste Markdown', exact: true }).click();
  report.nativeDiagramRendering = (await (await rendered).json()).body;
  await expect(mermaid).toBeVisible(); await expect(plantuml).toBeVisible();
  expect((await mermaid.textContent()).trimEnd()).toBe(mermaidSource);
  expect((await plantuml.textContent()).trimEnd()).toBe(plantumlSource);
  report.checks.push('Real GitLab Markdown imports Mermaid code and the enabled PlantUML image/source carrier into native editable source blocks without flattening the diagram');

  await mermaid.locator('code').click();
  await controls.getByRole('button', { name: 'Show diagram preview', exact: true }).click();
  await expect(frame().locator('svg')).toBeVisible(); await expect(frame().locator('svg')).toContainText('Review');
  await screenshot('mermaid-valid-preview.png');
  await selectLastLine(mermaid); await page.keyboard.type('! ! ! INVALID');
  await expect(preview().getByRole('alert')).toContainText('editable source is retained');
  await expect(mermaid).toContainText('! ! ! INVALID');
  await screenshot('mermaid-invalid-retained-source.png');
  await toolbar.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await mermaid.textContent()).trimEnd()).toBe(mermaidSource);
  await expect(frame().locator('svg')).toContainText('Review');
  report.checks.push('The script-only real Mermaid sandbox renders a diagram; actual invalid native typing produces a recoverable preview error, and Undo restores source and a working preview without page errors');

  await selectLastLine(mermaid); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await page.keyboard.type('Review-->Published');
  await expect(frame().locator('svg')).toContainText('Published');
  await controls.getByRole('button', { name: 'Copy code', exact: true }).click();
  const mermaidText = (await mermaid.locator('code').textContent()).trimEnd();
  expect((await page.evaluate(() => navigator.clipboard.readText())).trimEnd()).toBe(mermaidText);
  await screenshot('mermaid-native-edit-preview.png');
  report.checks.push('Native multiline editing updates the actual Mermaid preview, and Copy code writes the complete updated source to the real browser clipboard');

  await plantuml.locator('code').click();
  await expect(controls.getByRole('button', { name: 'Show diagram preview', exact: true })).toBeVisible();
  await context.setOffline(true);
  try {
    await controls.getByRole('button', { name: 'Show diagram preview', exact: true }).click();
    await expect(preview().getByRole('alert')).toContainText('editable source is retained');
    expect((await plantuml.textContent()).trimEnd()).toBe(plantumlSource);
    await screenshot('plantuml-offline-retained-source.png');
  } finally { await context.setOffline(false); }
  await preview().getByRole('button', { name: 'Retry diagram preview', exact: true }).click();
  const image = () => preview().getByRole('img');
  await expect(image()).toHaveAttribute('src', /^http:\/\/127\.0\.0\.1:5081\/png\//u);
  await expect.poll(() => image().evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
  await expect(preview()).toHaveAttribute('aria-busy', 'false');
  const initialProviderImage = await image().getAttribute('src');
  await screenshot('plantuml-live-provider-preview.png');
  report.checks.push('Actual offline PlantUML preview failure retains the source; explicit online retry uses GitLab rendering and decodes the real isolated PlantUML server image');

  await selectLastLine(plantuml); expect(await page.evaluate(() => getSelection().toString())).toBe('@enduml');
  await page.keyboard.type('Bob --> Alice: Published'); await page.keyboard.press('Enter'); await page.keyboard.type('@enduml');
  await expect(preview()).toHaveAttribute('aria-busy', 'false');
  await expect(image()).not.toHaveAttribute('src', initialProviderImage);
  await expect.poll(() => image().evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
  const plantumlText = (await plantuml.locator('code').textContent()).trimEnd();
  const providerImage = await image().getAttribute('src');
  await preview().scrollIntoViewIfNeeded();
  await screenshot('plantuml-native-edited-preview.png');
  const language = controls.getByRole('combobox', { name: 'Code language', exact: true });
  await language.fill('text'); await controls.getByRole('button', { name: 'Apply language', exact: true }).click();
  await expect(editor.locator('pre[data-language="text"]').filter({ hasText: 'Bob --> Alice: Published' })).toBeVisible();
  await expect(controls.getByRole('button', { name: 'Show diagram preview', exact: true })).toHaveCount(0);
  await toolbar.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(plantuml).toBeVisible(); expect((await plantuml.textContent()).trimEnd()).toBe(plantumlText);
  report.checks.push('Actual PlantUML source editing updates a real image; conversion to ordinary code and one-step undo retain every source character');

  await mermaid.locator('code').click();
  await controls.getByRole('button', { name: 'Delete code block', exact: true }).click(); await expect(mermaid).toHaveCount(0);
  await toolbar.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(mermaid).toBeVisible();
  expect((await mermaid.textContent()).trimEnd()).toBe(mermaidText);
  await mermaid.locator('code').click();
  await controls.getByRole('button', { name: 'Show diagram preview', exact: true }).click();
  await expect(frame().locator('svg')).toContainText('Published');
  const installed = JSON.parse(await readFile(new URL('../artifacts/gitlab-native-browser-install/install.json', import.meta.url)));
  const require = createRequire(installed.source + '/storybook/package.json');
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const accessibility = await preview().evaluate(element => window.axe.run(element));
  expect(accessibility.violations).toEqual([]);
  await page.setViewportSize({ width: 360, height: 900 });
  await preview().scrollIntoViewIfNeeded();
  await expect(frame().locator('svg')).toContainText('Published');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await screenshot('mermaid-preview-mobile.png');
  await page.setViewportSize({ width: 1440, height: 1000 });
  report.checks.push('Diagram deletion/undo retains source; the restored real sandbox works at 360px without horizontal page overflow, and the preview region has no axe violations');
  report.nativeDiagrams = { mermaidText, plantumlText, providerImage, created, accessibilityViolations: accessibility.violations };
}

export async function assertSavedNativeDiagrams({ page, description, report, output, phase }) {
  const { mermaidText, plantumlText } = report.nativeDiagrams;
  expect(description).toContain('```mermaid\n' + mermaidText + '\n```');
  expect(description).toContain('```plantuml\n' + plantumlText + '\n```');
  const reader = page.getByTestId('work-item-description');
  const expand = page.getByTestId('show-all-btn'); if (await expand.isVisible()) await expand.click();
  const image = reader.locator('a[data-diagram="plantuml"] img');
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
  const encoded = await reader.locator('a[data-diagram="plantuml"]').getAttribute('data-diagram-src');
  expect(Buffer.from(encoded.replace('data:text/plain;base64,', ''), 'base64').toString('utf8')).toBe(plantumlText);
  await expect(reader.frameLocator('iframe').locator('svg')).toContainText('Published');
  await expect(page.locator('main .katex').first()).toBeVisible();
  await page.screenshot({ path: fileURLToPath(new URL(`diagrams-reader-${phase}.png`, output)), fullPage: true });
  (report.nativeDiagramReaderPhases ??= []).push(phase);
}
