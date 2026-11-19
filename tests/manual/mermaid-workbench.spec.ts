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

test('pastes styled source into a Mermaid block and undoes the replacement', async ({ page }, info) => {
  const lines = ['flowchart TD', '  Report --> Triage', '  Triage --> Resolve'];
  const external = await page.context().newPage();
  await external.setContent('<pre contenteditable="true"><b>' + lines[0] + '</b>\n' + lines.slice(1).join('\n') + '</pre>');
  await external.locator('pre').click();
  await external.keyboard.press('ControlOrMeta+a');
  await external.keyboard.press('ControlOrMeta+c');
  await page.bringToFront();
  await page.goto('index.html#playground');
  const demo = page.locator('#playground');
  await demo.locator('[contenteditable=true] p').filter({ hasText: 'Integrity sample:' }).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('```mermaid draft');
  const code = demo.getByRole('region', { name: 'mermaid code' }).locator('code');
  await expect(code).toHaveText('draft');
  await page.keyboard.press('Shift+Home');
  const delivered = page.evaluate(() => new Promise<string>((resolve) => {
    document.addEventListener('paste', event => resolve(event.clipboardData!.getData('text/plain')), { once: true, capture: true });
  }));
  await page.keyboard.press('ControlOrMeta+v');
  const source = await delivered;
  expect(source.replace(/\r\n/g, '\n')).toBe(lines.join('\n'));
  await expect(code).toHaveJSProperty('textContent', source);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(code).toHaveText('draft');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(code).toHaveJSProperty('textContent', source);
  const preview = demo.getByRole('figure', { name: 'Diagram preview' });
  await preview.scrollIntoViewIfNeeded();
  const image = preview.getByRole('img');
  await expect(image).toBeVisible({ timeout: 22000 });
  expect(decodeURIComponent((await image.getAttribute('src'))!)).toContain('Resolve');
  await preview.screenshot({ path: info.outputPath('pasted-diagram.png') });
});

test('copies multiline Mermaid source to an external field and back into the same editor', async ({ page, browserName }) => {
  const external = await page.context().newPage();
  await external.setContent('<textarea aria-label="Destination"></textarea>');
  await page.bringToFront();
  await page.goto('index.html#playground');
  const demo = page.locator('#playground');
  await demo.getByRole('button', { name: 'Mermaid diagram' }).click();
  const code = demo.getByRole('region', { name: 'mermaid code' }).locator('code');
  const expected = (await code.textContent())!.split('\n').slice(0, 2).join('\n');
  await code.click({ position: { x: 3, y: 4 } });
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+End');
  expect(await page.evaluate(() => window.getSelection()?.toString().replace(/\r\n/g, '\n'))).toBe(expected);
  await page.keyboard.press('ControlOrMeta+c');
  await external.bringToFront();
  const field = external.getByRole('textbox', { name: 'Destination' });
  await field.click();
  await external.keyboard.press('ControlOrMeta+v');
  // On the Windows Playwright WebKit port, even a plain copy handler that sets only
  // text/plain loses its data on native paste. Keep exercising the real clipboard.
  test.fail(browserName === 'webkit' && process.platform === 'win32', 'Windows WebKit drops event-authored clipboard data.');
  await expect(field).toHaveValue(expected);

  await page.bringToFront();
  await code.click({ position: { x: 3, y: 4 } });
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('ControlOrMeta+v');
  await expect.poll(() => code.evaluate(el => el.textContent!.replace(/\r\n/g, '\n'))).toBe(expected + '\n' + expected);
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
