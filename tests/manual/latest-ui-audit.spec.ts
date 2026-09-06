import { expect, test, type Page, type TestInfo } from '@playwright/test';

const pause = (page: Page, milliseconds = 350) => page.waitForTimeout(milliseconds);

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: false }),
    contentType: 'image/png',
  });
}

test('human release journey: writing, AI review, conversation, structured tools, and undo', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await test.step('write a real multi-paragraph release note', async () => {
    await page.goto('/');
    const editor = page.getByRole('textbox', { name: 'Rich text editor' });
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Release audit');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Human-style editing is working.');
    await expect(editor).toContainText('Release audit');
    await expect(editor).toContainText('Human-style editing is working.');
    await editor.getByText('Release audit', { exact: true }).scrollIntoViewIfNeeded();
    await capture(page, testInfo, '01-real-writing');
    await pause(page, 700);
  });

  await test.step('review a streamed text proposal without premature mutation', async () => {
    await page.reload();
    const editor = page.getByRole('textbox', { name: 'Rich text editor' });
    const original = await editor.textContent();
    const firstParagraph = editor.locator(':scope > p').first();
    await firstParagraph.click({ position: { x: 80, y: 12 } });

    const panel = page.locator('.optional-ai');
    await panel.locator(':scope > summary').click();
    await panel.getByRole('button', { name: 'Improve' }).click();
    await expect(panel.locator('.fountain-ai-review__status')).toHaveText('Generating…');
    await expect(panel.getByRole('button', { name: 'Accept change' })).toHaveCount(0);
    expect(await editor.textContent()).toBe(original);
    await capture(page, testInfo, '02-streaming-is-read-only');

    await expect(panel.locator('.fountain-ai-review__status')).toHaveText('Review needed');
    await capture(page, testInfo, '03-review-before-accept');
    await panel.getByRole('button', { name: 'Accept change' }).click();
    await expect(editor).toContainText('Make it unmistakably clear:');
    await expect(editor).toContainText('This is the real npm package');
    await expect(editor).not.toContainText('This is thereal npm package');
    await expect(page.locator('.studio__export pre')).toContainText('the **real npm package**');
    await capture(page, testInfo, '04-accepted-text-proposal');
    await pause(page);
  });

  await test.step('preview a schema-aware structural change, accept it, then undo it', async () => {
    const editor = page.getByRole('textbox', { name: 'Rich text editor' });
    const afterTextProposal = await editor.textContent();
    const tools = page.getByRole('region', { name: 'Schema-aware agent document tools' });

    await tools.getByRole('button', { name: 'Plan structured section' }).click();
    await expect(tools.getByRole('status')).toHaveText('Preview ready. The live document is still unchanged.');
    expect(await editor.textContent()).toBe(afterTextProposal);
    await tools.scrollIntoViewIfNeeded();
    await capture(page, testInfo, '05-structured-preview-is-read-only');
    await pause(page, 700);

    await tools.getByRole('button', { name: 'Accept structured change' }).click();
    await expect(editor).toContainText('Agent-proposed next step');
    await expect(editor).toContainText('This structured section stays outside the document until you accept it.');
    await tools.scrollIntoViewIfNeeded();
    await capture(page, testInfo, '06-structured-change-accepted');
    await pause(page, 700);

    await page.getByRole('button', { name: 'Undo' }).first().click();
    await expect(editor).not.toContainText('Agent-proposed next step');
    expect(await editor.textContent()).toBe(afterTextProposal);
    await tools.scrollIntoViewIfNeeded();
    await capture(page, testInfo, '07-structured-change-undone');
    await pause(page, 700);
  });

  await test.step('use a reusable prompt and continue a real multi-turn conversation', async () => {
    const conversation = page.getByRole('region', { name: 'Multi-turn conversation' });
    await conversation.getByRole('button', { name: 'Use prompt' }).click();
    await conversation.getByRole('button', { name: 'Send' }).click();
    await expect(conversation.getByText('I can keep this discussion across turns.', { exact: false })).toBeVisible();
    await expect(conversation.getByText('Ready', { exact: true })).toBeVisible();
    await conversation.scrollIntoViewIfNeeded();
    await capture(page, testInfo, '08-conversation-first-turn');
    await pause(page, 500);

    await conversation.getByRole('textbox', { name: 'Message' }).fill('What context did you keep?');
    await conversation.getByRole('button', { name: 'Send' }).click();
    await expect(conversation.getByText('This is follow-up 2.', { exact: false })).toBeVisible();
    await expect(conversation.locator('.fountain-ai-conversation__messages article')).toHaveCount(4);
    await conversation.scrollIntoViewIfNeeded();
    await capture(page, testInfo, '09-conversation-follow-up');
    await pause(page, 500);
  });

  await test.step('generate, visually review, upload, insert, and undo a real image candidate', async () => {
    const editor = page.getByRole('textbox', { name: 'Rich text editor' });
    const workflow = page.getByRole('region', { name: 'Generated asset review' });
    const before = await editor.textContent();
    await workflow.getByRole('button', { name: 'Generate preview' }).click();
    await expect(workflow.locator('.fountain-ai-media__status')).toHaveText('Review required');
    expect(await editor.textContent()).toBe(before);
    await workflow.scrollIntoViewIfNeeded();
    await capture(page, testInfo, '10-generated-media-review');
    await pause(page, 700);

    await workflow.getByRole('button', { name: 'Upload and insert' }).click();
    await expect(workflow.getByText('Inserted', { exact: true })).toBeVisible();
    await expect(editor.locator(':scope > figure.fountain-image')).toHaveCount(1);
    await editor.locator(':scope > figure.fountain-image').scrollIntoViewIfNeeded();
    await capture(page, testInfo, '11-generated-media-inserted');
    await pause(page, 700);

    await page.getByRole('button', { name: 'Undo' }).first().click();
    await expect(editor.locator(':scope > figure.fountain-image')).toHaveCount(0);
    expect(await editor.textContent()).toBe(before);
  });

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('human document-conversion journey: edit, download Word, re-import, and inspect output', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  await page.goto('/demos/node-markdown.html');
  const source = page.getByLabel('Markdown input');
  await source.fill('# Customer handoff\n\nThe **release candidate** is ready.\n\n- Verify the package\n- Send the report\n\n| Owner | State |\n| :--- | :---: |\n| Paolo | Ready |');
  await expect(page.getByText('Valid document · 4 top-level blocks · no reported Markdown losses')).toBeVisible();
  await capture(page, testInfo, '01-edited-source-before-word-export');
  await pause(page, 600);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download as Word DOCX' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0x50, 0x4b]));

  await page.getByRole('button', { name: 'Word DOCX', exact: true }).click();
  await capture(page, testInfo, '02-word-import-state-before-file');
  await page.getByLabel('Import Word DOCX').setInputFiles({
    name: 'customer-handoff.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: bytes,
  });
  await expect(page.getByText('customer-handoff.docx')).toBeVisible();
  await expect(page.getByText(/Valid document · 4 top-level blocks · bounded DOCX import/)).toBeVisible();
  const output = page.locator('.demo-output pre');
  await expect(output).toContainText('Customer handoff');
  await expect(output).toContainText('release candidate');
  await expect(output).toContainText('bullet_list');
  await expect(output).toContainText('table');
  await capture(page, testInfo, '03-word-round-trip-inspected');
  await pause(page, 800);

  const imageDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download embedded-image sample' }).click();
  const imageDownload = await imageDownloadPromise;
  const imageStream = await imageDownload.createReadStream();
  const imageChunks: Buffer[] = [];
  for await (const chunk of imageStream) imageChunks.push(Buffer.from(chunk));
  await page.getByLabel('Import Word DOCX').setInputFiles({
    name: 'embedded-image-proof.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.concat(imageChunks),
  });
  await expect(page.getByText('Valid document · 3 top-level blocks · bounded DOCX import')).toBeVisible();
  await expect(page.getByRole('img', { name: 'FountainJS violet sample' })).toBeVisible();
  await expect(page.locator('.headless-image-previews figcaption')).toHaveText('A verified raster image packaged inside the Word document.');
  await capture(page, testInfo, '04-embedded-word-image-reimported');
  await pause(page, 800);

  expect(errors).toEqual([]);
});

test('human visual-export journey: compare Fountain with an independent DOCX render', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/browser-tests.html');
  const summary = await page.evaluate(() => (globalThis as any).fountainBrowserTest.docxVisual.render());
  expect(summary).toMatchObject({ fidelity: 'bounded', issues: [], fountainImages: 1, docxImages: 1, docxPages: 1 });
  const comparison = page.locator('#browser-docx-visual-comparison');
  await expect(comparison.locator('[data-visual-fountain]')).toContainText('Visual export parity');
  await expect(comparison.locator('[data-visual-docx]')).toContainText('Visual export parity');
  await expect(comparison.locator('img')).toHaveCount(2);
  await capture(page, testInfo, '01-fountain-and-independent-docx-render');
  await pause(page, 1000);
  expect(errors).toEqual([]);
});

test('human visual-export journey: render the paged editor as a real PDF', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/browser-tests.html?fixture=pages-preview');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.setHeader())).toBe(true);
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.insertPageNumber())).toBe(true);
  const preview = await page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.pages.previewPhysical('a4')
  ));
  expect(preview.pageCount).toBeGreaterThan(1);
  await page.locator('#browser-page-preview').scrollIntoViewIfNeeded();
  await capture(page, testInfo, '01-fountain-a4-page-preview');

  const pdfPath = testInfo.outputPath('fountain-a4-export.pdf');
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: pdfPath, printBackground: true, preferCSSPageSize: true });
  await page.emulateMedia({ media: 'screen' });
  await testInfo.attach('fountain-a4-export', {
    path: pdfPath,
    contentType: 'application/pdf',
  });
  expect(errors).toEqual([]);
});
