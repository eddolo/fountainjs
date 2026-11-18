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
  await page.keyboard.type(' Include the instrument ID. Study: ');
  const prose = page.locator('section').filter({ has: instructions });
  await prose.getByRole('combobox', { name: 'Field to insert' }).selectOption('study');
  await prose.getByRole('button', { name: 'Insert field', exact: true }).click();
  await expect(instructions.locator('[data-template-field="study"]')).toHaveCount(1);
  await prose.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(instructions.locator('[data-template-field]')).toHaveCount(0);
  await prose.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(instructions.locator('[data-template-field="study"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Add field', exact: true }).click();
  await page.getByLabel('Field label', { exact: true }).last().fill('Instrument');
  await page.getByLabel('Field key', { exact: true }).last().fill('instrument');
  await page.getByRole('button', { name: 'Repeat an answer', exact: true }).click();
  await page.getByRole('combobox', { name: 'Repeat field', exact: true }).selectOption('findings');
  await page.getByRole('button', { name: 'Save template', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Template saved.');
  await page.screenshot({ path: info.outputPath('author.png'), fullPage: true });
  await page.getByLabel('Invitation label (optional)').fill('Optics lab');
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
    await expect(other.getByRole('textbox', { name: 'Fixed instructions' })).toContainText('Study: Run 17');
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
    expect(json.content[1].content.map((run: { text: string }) => run.text).join('')).toContain(
      'Study: Run 17',
    );
    expect(JSON.stringify(json)).not.toContain('template_field');
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
    await page.reload();
    await expect(page.getByText('Optics lab · revision 2')).toBeVisible();
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name: 'Revoke access' }).click();
    await expect(page.getByRole('button', { name: 'Revoke access' })).toBeVisible();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Revoke access' }).click();
    await expect(page.getByRole('status')).toHaveText('Access revoked for Optics lab.');
    await other.reload();
    await expect(other.getByRole('status')).toHaveText('This link cannot open a document.');
    await expect(other.getByRole('textbox', { name: 'Completed document' })).toHaveCount(0);
    await page.getByRole('button', { name: /Read submission 1/ }).click();
    await expect(page.getByRole('textbox', { name: 'Completed document' })).toContainText('Scope B');
    await page.getByRole('button', { name: 'Back to template' }).click();
    const templateDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download template JSON' }).click();
    const templateFile = await (await templateDownload).path();
    expect(templateFile).toBeTruthy();
    const priorAddress = page.url();
    await page.goto('http://127.0.0.1:4203/');
    await page.getByLabel('Open template file').setInputFiles(templateFile!);
    await expect(page.getByLabel('Template title')).toHaveValue('Template for next week');
    await expect(
      page.getByRole('textbox', { name: 'Instructions 1' }).locator('[data-template-field="study"]'),
    ).toHaveCount(1);
    expect(page.url()).not.toBe(priorAddress);
    await expect(page.getByText('No submissions yet.')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await respondent.close();
  }
});

test('revoking an open draft blocks further writes while a separate invitation still works', async ({
  page,
  browser,
}, info) => {
  await page.goto('http://127.0.0.1:4203/');
  await page.getByRole('button', { name: 'Create template', exact: true }).click();
  async function invite(label: string) {
    await page.getByLabel('Invitation label (optional)').fill(label);
    await page.getByRole('button', { name: 'Create respondent link' }).click();
    await expect(page.getByText(label + ' · revision 1', { exact: true })).toBeVisible();
    return (await page.getByRole('link', { name: 'Open response' }).getAttribute('href'))!;
  }
  const first = await invite('Morning shift');
  const second = await invite('Evening shift');
  const respondent = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const draft = await respondent.newPage();
    await draft.goto(first);
    await draft.getByLabel('Study title (required)', { exact: true }).fill('Original notes');
    await draft.getByRole('button', { name: 'Save draft' }).click();
    await expect(draft.getByRole('status')).toHaveText('Draft saved.');
    await page.reload();
    const morning = page
      .locator('.row')
      .filter({ has: page.getByText('Morning shift · revision 1', { exact: true }) });
    page.once('dialog', (dialog) => dialog.accept());
    await morning.getByRole('button', { name: 'Revoke access' }).click();
    await expect(morning.getByText('Access revoked')).toBeVisible();
    await morning.locator('..').screenshot({ path: info.outputPath('invitation-access.png') });
    await draft.getByLabel('Study title (required)', { exact: true }).fill('Edited after revocation');
    await draft.getByRole('button', { name: 'Save draft' }).click();
    await expect(draft.getByRole('status')).toHaveText('This link cannot open a document.');
    await draft.reload();
    await expect(draft.getByRole('status')).toHaveText('This link cannot open a document.');
    await draft.goto(second);
    await draft.getByLabel('Study title (required)', { exact: true }).fill('Evening shift notes');
    await draft.getByRole('button', { name: 'Save draft' }).click();
    await expect(draft.getByRole('status')).toHaveText('Draft saved.');
    await draft.reload();
    await expect(draft.getByLabel('Study title (required)', { exact: true })).toHaveValue(
      'Evening shift notes',
    );
  } finally {
    await respondent.close();
  }
});

test('a respondent can edit either repeated field with one saved answer and one rich-text history', async ({page,browser},info)=>{
  await page.goto('http://127.0.0.1:4203/');
  await page.getByRole('button',{name:'Create template',exact:true}).click();
  async function repeat(key:string,editable:boolean) {
    await page.getByRole('button',{name:'Repeat an answer',exact:true}).click();
    const card=page.locator('section.card').filter({has:page.getByRole('heading',{name:'Repeated answer',exact:true})}).last();
    await card.getByRole('combobox',{name:'Repeat field',exact:true}).selectOption(key);
    if(editable) await card.getByLabel('Allow editing here').check();
    return card;
  }
  const first=await repeat('findings',true);
  await first.getByRole('button',{name:'Move up'}).click();
  await repeat('findings',false);
  await repeat('study',true);
  await page.getByRole('button',{name:'Save template',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Template saved.');
  await page.getByRole('button',{name:'Create respondent link'}).click();
  const link=await page.getByRole('link',{name:'Open response'}).getAttribute('href');
  const context=await browser.newContext({viewport:{width:390,height:844},recordVideo:{dir:info.outputPath('peer-videos')}});
  try {
    const response=await context.newPage(); await response.goto(link!);
    const study=response.getByRole('textbox',{name:'Study title (required)',exact:true});
    const otherStudy=response.getByRole('textbox',{name:'Repeated Study title (required)',exact:true});
    await response.getByRole('button', { name: 'Submit response' }).click();
    await expect(study).toBeFocused();
    await expect(otherStudy).toHaveAccessibleDescription('Complete the required field “Study title”.');
    await otherStudy.fill('Trial 9');
    await expect(study).toHaveValue('Trial 9');
    await expect(study).not.toHaveAttribute('aria-invalid');
    await expect(otherStudy).not.toHaveAttribute('aria-invalid');
    await study.fill('Trial 10');await expect(otherStudy).toHaveValue('Trial 10');
    const source=response.getByRole('textbox',{name:'Findings (required)',exact:true});
    const peer=response.getByRole('textbox',{name:'Repeated Findings (required)',exact:true});
    const sourceCard=response.locator('section.card').filter({has:source});
    const peerCard=response.locator('section.card').filter({has:peer});
    await response.getByRole('button', { name: 'Submit response' }).click();
    await expect(source).toBeFocused();
    await expect(source).toHaveAttribute('aria-required', 'true');
    await expect(source).toHaveAccessibleDescription('Complete the required field “Findings”.');
    await expect(peer).toHaveAccessibleDescription('Complete the required field “Findings”.');
    await sourceCard.screenshot({ path: info.outputPath('missing-required-findings.png') });
    await peer.click();await response.keyboard.type('Sample ready');
    await expect(source).not.toHaveAttribute('aria-invalid');
    await expect(peer).not.toHaveAttribute('aria-invalid');
    await expect(source).toHaveText('Sample ready');await expect(peer).toBeFocused();
    await source.click();await response.keyboard.press('End');
    for(let i=0;i<5;i++)await response.keyboard.press('Shift+ArrowLeft');
    await sourceCard.getByRole('button',{name:'Bold',exact:true}).click();
    await expect(peer.locator('strong')).toHaveText('ready');
    const fixed=response.locator('section.card').filter({has:response.getByRole('heading',{name:'Repeated answer · Findings'})}).filter({has:response.locator('.reader')});
    await expect(fixed.locator('strong')).toHaveText('ready');
    await expect(fixed.locator('[contenteditable=true]')).toHaveCount(0);
    await peerCard.getByRole('button',{name:'Undo',exact:true}).click();
    await expect(source.locator('strong')).toHaveCount(0);
    await peerCard.getByRole('button',{name:'Redo',exact:true}).click();
    await expect(source.locator('strong')).toHaveText('ready');
    await peer.click();await response.keyboard.press('End');await response.keyboard.type('!');
    await expect(source).toHaveText('Sample ready!');
    await response.getByRole('button',{name:'Save draft'}).click();
    await expect(response.getByRole('status')).toHaveText('Draft saved.');await response.reload();
    await expect(peer).toHaveText('Sample ready!');await expect(otherStudy).toHaveValue('Trial 10');
    await response.screenshot({path:info.outputPath('editable-peers.png'),fullPage:true});
    await response.getByRole('button',{name:'Submit response'}).click();
    const doc=response.getByRole('textbox',{name:'Completed document'});
    await expect(doc).not.toBeEditable();
    await expect(doc.locator('p').filter({hasText:'Sample ready!'})).toHaveCount(3);
    await expect(doc.locator('p').filter({hasText:'Trial 10'})).toHaveCount(2);
  } finally {await context.close();}
});

test('a researcher saves an inconsistent draft, corrects its dates and submits under the issued rules', async ({ page, browser }, info) => {
  await page.goto('http://127.0.0.1:4203/');
  await page.getByRole('button', { name: 'Create template', exact: true }).click();
  await page.getByLabel('Field label', { exact: true }).first().fill('Study start');
  await page.getByRole('button', { name: 'Add field', exact: true }).click();
  const endField = page.locator('section.card').filter({ has: page.locator('input') })
    .filter({ has: page.getByRole('combobox', { name: 'Answer type' }) }).last();
  await endField.getByLabel('Field label', { exact: true }).fill('Study end');
  await page.getByRole('button', { name: 'Add answer rule' }).click();
  const rules = page.getByRole('heading', { name: 'Answer rules' }).locator('..');
  await rules.getByRole('combobox', { name: 'Comparison', exact: true }).selectOption('onOrAfter');
  await endField.getByLabel('Field key').fill('end_date');
  await endField.getByLabel('Field key').press('Tab');
  await expect(rules.getByRole('combobox', { name: 'Answer to check' })).toHaveValue('end_date');
  await page.getByRole('button', { name: 'Repeat an answer' }).click();
  const repeat = page.getByRole('heading', { name: 'Repeated answer', exact: true }).locator('..');
  await repeat.getByRole('combobox', { name: 'Repeat field' }).selectOption('end_date');
  await repeat.getByLabel('Allow editing here').check();
  await endField.getByRole('button', { name: 'Remove block' }).click();
  await expect(page.getByRole('status')).toHaveText('Remove its answer rules first.');
  await page.getByRole('button', { name: 'Save template', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Template saved.');
  await page.getByRole('button', { name: 'Create respondent link' }).click();
  const link = await page.getByRole('link', { name: 'Open response' }).getAttribute('href');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download template JSON' }).click();
  const file = await (await download).path();
  expect(file).toBeTruthy();
  expect(JSON.parse(await readFile(file!, 'utf8')).rules).toEqual([
    { field: 'end_date', other: 'study', operator: 'onOrAfter' },
  ]);
  await rules.getByRole('button', { name: 'Remove rule' }).click();
  await page.getByRole('button', { name: 'Save template', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Template saved.');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: info.outputPath('date-rule-video') } });
  try {
    const draft = await context.newPage();
    await draft.goto(link!);
    const start = draft.getByRole('textbox', { name: 'Study start (required)', exact: true });
    const end = draft.getByRole('textbox', { name: 'Study end', exact: true });
    await start.fill('2024-02-29');
    await draft.getByRole('textbox', { name: 'Findings (required)' }).fill('Samples collected.');
    const copy = draft.getByRole('textbox', { name: 'Repeated Study end', exact: true });
    await copy.fill('2024-02-28');
    await expect(end).toHaveValue('2024-02-28');
    await draft.getByRole('button', { name: 'Save draft' }).click();
    await expect(draft.getByRole('status')).toHaveText('Draft saved.');
    await draft.reload();
    await expect(end).toHaveValue('2024-02-28');
    const rejected = draft.waitForResponse(res => res.url().endsWith('/submit'));
    await draft.getByRole('button', { name: 'Submit response' }).click();
    expect((await rejected).status()).toBe(422);
    await expect(end).toBeFocused();
    await expect(end).toHaveAttribute('aria-invalid', 'true');
    await expect(end).toHaveAccessibleDescription(/must be on or after.*Study start/);
    await end.locator('xpath=../..').screenshot({ path: info.outputPath('date-rule-error.png') });
    await expect(copy).toHaveAttribute('aria-invalid', 'true');
    await copy.fill('2024-03-01');
    await expect(end).toHaveValue('2024-03-01');
    await expect(copy).not.toHaveAttribute('aria-invalid');
    await expect(end).not.toHaveAttribute('aria-invalid');
    await draft.getByRole('button', { name: 'Submit response' }).click();
    const completed = draft.getByRole('textbox', { name: 'Completed document' });
    await expect(completed).toContainText('2024-03-01');
    await draft.reload();
    await expect(completed).toContainText('Samples collected.');
    const original = page.url();
    await page.goto('http://127.0.0.1:4203/');
    await page.getByLabel('Open template file').setInputFiles(file!);
    await expect(rules.getByRole('combobox', { name: 'Comparison', exact: true })).toHaveValue('onOrAfter');
    await expect(rules.getByRole('combobox', { name: 'Answer to check' })).toHaveValue('end_date');
    await expect(rules.getByRole('combobox', { name: 'Compare with' })).toHaveValue('study');
    expect(page.url()).not.toBe(original);
  } finally {
    await context.close();
  }
});
