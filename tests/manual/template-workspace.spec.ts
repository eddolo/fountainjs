import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('an author issues a template and reads a separate respondent’s completed document', async ({
  page,
  browser,
}, info) => {
  await page.goto('http://127.0.0.1:4203/');
  await page.getByRole('button', { name: 'Create template', exact: true }).click();
  await page.getByLabel('Template title').fill('Telescope calibration');
  const instructions = page.getByRole('textbox', { name: 'Instructions 1' });
  await instructions.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Include the instrument ID.');
  await page.getByRole('button', { name: 'Add field', exact: true }).click();
  await page.getByLabel('Field label', { exact: true }).last().fill('Instrument');
  await page.getByLabel('Field key', { exact: true }).last().fill('instrument');
  await page.getByRole('button', { name: 'Repeat an answer', exact: true }).click();
  await page.getByRole('combobox', { name: 'Repeat field', exact: true }).selectOption('findings');
  await page.getByRole('button', { name: 'Save template', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Template saved.');
  await page.screenshot({ path: info.outputPath('author.png'), fullPage: true });
  await page.getByRole('button', { name: 'Create respondent link' }).click();
  const address = await page.getByRole('link', { name: 'Open response' }).getAttribute('href');
  expect(address).toBeTruthy();
  await page.getByLabel('Template title').fill('Template for next week');
  await page.getByRole('button', { name: 'Save template' }).click();
  await expect(page.getByRole('status')).toHaveText('Template saved.');
  const respondent = await browser.newContext({
    viewport: { width: 390, height: 844 },
    recordVideo: { dir: info.outputPath('respondent-video') },
  });
  const other = await respondent.newPage(),
    errors: string[] = [];
  other.on('pageerror', (error) => errors.push(error.message));
  try {
    await other.goto(address!);
    await expect(other.getByRole('heading', { name: 'Telescope calibration' })).toBeVisible();
    await expect(other.getByRole('button', { name: 'Save template' })).toHaveCount(0);
    await expect(other.getByRole('textbox', { name: 'Fixed instructions' })).not.toBeEditable();
    await other.getByRole('button', { name: 'Submit response' }).click();
    await expect(other.getByRole('status')).toContainText('Study title');
    await other.getByLabel('Study title (required)', { exact: true }).fill('Run 17');
    await other.getByLabel('Instrument', { exact: true }).fill('Scope B');
    const findings = other.getByRole('textbox', { name: 'Findings (required)' });
    await findings.click();
    await other.keyboard.type('Stable result');
    for (let i = 0; i < 6; i++) await other.keyboard.press('Shift+ArrowLeft');
    await other.getByRole('button', { name: 'Bold', exact: true }).click();
    await expect(findings.locator('strong')).toHaveText('result');
    const repeated = other.getByRole('heading', { name: 'Repeated answer · Findings' }).locator('..');
    await expect(repeated.locator('strong')).toHaveText('result');
    await other.getByRole('button', { name: 'Save draft' }).click();
    await expect(other.getByRole('status')).toHaveText('Draft saved.');
    await other.reload();
    await expect(findings).toHaveText('Stable result');
    await expect(other.getByLabel('Instrument', { exact: true })).toHaveValue('Scope B');
    expect(await other.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await other.screenshot({ path: info.outputPath('respondent.png'), fullPage: true });
    await other.getByRole('button', { name: 'Submit response' }).click();
    const reader = other.getByRole('textbox', { name: 'Completed document' });
    await expect(reader).not.toBeEditable();
    await expect(reader.locator('strong')).toHaveText(['result', 'result']);
    const download = other.waitForEvent('download');
    await other.getByRole('button', { name: 'Download Fountain JSON' }).click();
    const file = await download,
      json = JSON.parse(await readFile((await file.path())!, 'utf8'));
    expect(json.content[0]).toMatchObject({ type: 'heading', content: [{ text: 'Telescope calibration' }] });
    expect(
      json.content.filter((p: { content?: { text?: string }[] }) =>
        p.content?.some((run) => run.text === 'result'),
      ),
    ).toHaveLength(2);
    await page.getByRole('button', { name: 'Refresh submissions' }).click();
    await page.getByRole('button', { name: /Read submission 1/ }).click();
    await expect(page.getByRole('textbox', { name: 'Completed document' })).toContainText('Scope B');
    await page.screenshot({ path: info.outputPath('completed.png'), fullPage: true });
    await page.getByRole('button', { name: 'Back to template' }).click();
    await expect(page.getByLabel('Template title')).toHaveValue('Template for next week');
    const templateDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download template JSON' }).click();
    const templateFile = await (await templateDownload).path();
    expect(templateFile).toBeTruthy();
    const priorAddress = page.url();
    await page.goto('http://127.0.0.1:4203/');
    await page.getByLabel('Open template file').setInputFiles(templateFile!);
    await expect(page.getByLabel('Template title')).toHaveValue('Template for next week');
    expect(page.url()).not.toBe(priorAddress);
    await expect(page.getByText('No submissions yet.')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await respondent.close();
  }
});
