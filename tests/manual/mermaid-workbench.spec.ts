import { expect, test } from '@playwright/test';

test('draws editable Mermaid source, recovers from a syntax error and reopens Markdown', async ({ page }, info) => {
  await page.goto('index.html#playground');
  const demo = page.locator('#playground');
  await demo.getByRole('button', { name: 'Mermaid diagram' }).click();
  const source = demo.getByRole('region', { name: 'mermaid code' });
  const preview = demo.getByRole('figure', { name: 'Diagram preview' });
  const image = preview.getByRole('img');
  await preview.scrollIntoViewIfNeeded();
  const svgText = () => image.evaluate(element => {
    const url = (element as HTMLImageElement).src;
    const svg = new DOMParser().parseFromString(decodeURIComponent(url.slice(url.indexOf(',') + 1)), 'image/svg+xml');
    return [...svg.querySelectorAll('text')].map(node => node.textContent).join(' ');
  });
  await expect(image).toBeVisible({ timeout: 22000 });
  await expect.poll(svgText).toMatch(/Draft.*Review.*Publish/);
  await source.locator('code').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Home');
  await page.keyboard.insertText('bad ');
  await expect(preview).toContainText('Diagram preview unavailable.');
  await expect(image).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(image).toBeVisible();
  await expect.poll(svgText).toContain('Publish');
  await source.locator('code').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.insertText(' --> archive[Archive]');
  await expect.poll(svgText).toContain('Archive');
  await expect.poll(() => image.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await preview.screenshot({ path: info.outputPath('review-workflow.png') });
  await demo.getByRole('button', { name: 'markdown', exact: true }).click();
  const markdown = await demo.locator('.studio__export pre').innerText();
  const fenced = markdown.match(/^`{3,}mermaid\n[\s\S]*?\n`{3,}$/m)?.[0];
  expect(fenced).toContain(' --> archive[Archive]');
  await page.goto('conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles({ name: 'workflow.md', mimeType: 'text/markdown', buffer: Buffer.from(fenced!) });
  const imported = page.getByRole('textbox', { name: 'Imported document editor' });
  await expect(imported.locator('pre[data-language="mermaid"] code'))
    .toHaveText(fenced!.split('\n').slice(1, -1).join('\n'));
  const restored = imported.getByRole('figure', { name: 'Diagram preview' });
  await restored.scrollIntoViewIfNeeded();
  await expect(restored.getByRole('img')).toBeVisible({ timeout: 22000 });
  await page.getByRole('button', { name: 'Check round trip' }).click();
  const reader = page.getByLabel('Reopened export preview', { exact: true });
  const readOnlyDiagram = reader.getByRole('figure', { name: 'Diagram preview' });
  await readOnlyDiagram.scrollIntoViewIfNeeded();
  await expect(readOnlyDiagram.getByRole('img')).toBeVisible();
  await expect(reader).toHaveAttribute('contenteditable', 'false');
});

test('types a Mermaid fence and draws a diagram without leaving the document', async ({ page }, info) => {
  await page.goto('index.html#playground');
  const demo = page.locator('#playground');
  await demo.locator('[contenteditable=true] p').filter({ hasText: 'Integrity sample:' }).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('```mermaid ');
  const source = demo.getByRole('region', { name: 'mermaid code' }).locator('code');
  await expect(source).toHaveCount(1);
  await page.keyboard.type('flowchart TD');
  await page.keyboard.press('Enter');
  await page.keyboard.type('  Report --> Triage');
  await expect(source).toHaveJSProperty('textContent', 'flowchart TD\n  Report --> Triage');
  const diagram = demo.getByRole('figure', { name: 'Diagram preview' });
  await diagram.scrollIntoViewIfNeeded();
  const image = diagram.getByRole('img');
  await expect(image).toBeVisible({ timeout: 22000 });
  const svg = decodeURIComponent((await image.getAttribute('src'))!);
  expect(svg).toContain('Report');
  expect(svg).toContain('Triage');
  await expect.poll(() => image.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await diagram.screenshot({ path: info.outputPath('typed-diagram.png') });
});

test('reads two diagrams from one Markdown file with their own titles and labels', async ({ page }, info) => {
  const file = [
    '# Incident review', '',
    '```mermaid', 'sequenceDiagram', '    accTitle: Acknowledgement sequence',
    '    Reporter->>Maintainer: Send report', '    Maintainer-->>Reporter: Acknowledge', '```', '',
    '```mermaid', 'flowchart TD', '    accTitle: Resolution workflow',
    '    assess[Assess] --> repair[Repair]', '```', '',
  ].join('\n');
  await page.goto('conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles({ name: 'review.md', mimeType: 'text/markdown', buffer: Buffer.from(file) });
  await page.getByRole('button', { name: 'Check round trip' }).click();
  const reader = page.getByLabel('Reopened export preview', { exact: true });
  for (const [index, title, label] of [[0, 'Acknowledgement sequence', 'Acknowledge'], [1, 'Resolution workflow', 'Repair']] as const) {
    const figure = reader.getByRole('figure', { name: 'Diagram preview' }).nth(index);
    await figure.scrollIntoViewIfNeeded();
    const image = figure.getByRole('img', { name: title, exact: true });
    await expect(image).toBeVisible({ timeout: 22000 });
    expect(decodeURIComponent((await image.getAttribute('src'))!)).toContain(label);
    await expect.poll(() => image.evaluate(el => (el as HTMLImageElement).naturalHeight)).toBeGreaterThan(0);
    if (index === 0) await figure.screenshot({ path: info.outputPath('sequence-reader.png') });
  }
});
