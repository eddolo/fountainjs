import { expect, type Page, type TestInfo } from '@playwright/test';

export async function webComponentFormJourney(page: Page, info: TestInfo) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/demos/java-approval-workflow.html#native-form');
  const workshop = page.getByRole('region', { name: 'Native HTML form workshop' });
  const editor = workshop.getByRole('textbox', { name: 'Approval request document' });
  const payload = workshop.getByLabel('Native form payload');
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Approved for staging.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Review owner: Ada.');
  await workshop.getByRole('textbox', { name: 'Request title' }).fill('Staging exception');
  await workshop.getByRole('button', { name: 'Preview form submission' }).click();
  const values = JSON.parse(await payload.innerText());
  expect(values.title).toBe('Staging exception');
  expect(JSON.parse(values.document).attrs.workflow).toBe('approval');
  expect(JSON.parse(values.document).content[0].content[0].text).toContain('Approved for staging.');
  expect(JSON.parse(values.document).content[1].content[0].text).toBe('Review owner: Ada.');
  expect((await editor.boundingBox())!.height).toBeLessThan(350);
  await workshop.evaluate(element => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: info.outputPath('native-form-submission.png') });
  await workshop.getByRole('checkbox', { name: 'Disable the form fields' }).check();
  await expect(editor).toHaveAttribute('contenteditable', 'false');
  await expect(editor).toHaveAttribute('aria-disabled', 'true');
  await workshop.getByRole('button', { name: 'Preview form submission' }).click();
  await expect(payload).toHaveText('{}');
  await workshop.getByRole('checkbox', { name: 'Disable the form fields' }).uncheck();
  await workshop.getByRole('button', { name: 'Reset form', exact: true }).click();
  await expect(editor).toHaveText('Explain the requested exception.');
  await expect(workshop.getByRole('textbox', { name: 'Request title' })).toHaveValue('Security exception');
  // Native association can target a different form by ID; no manual submit listener.
  const association = await workshop.locator('fountain-native-form-editor').evaluate((node: any) => {
    const other = document.createElement('form'); other.id = 'external-form'; document.body.append(other);
    node.setAttribute('form', other.id);
    const result = { associated: node.form === other, submitted: new FormData(other).has('document') };
    node.name = 'renamed';
    Object.assign(result, { renamed: new FormData(other).has('renamed'), oldName: new FormData(other).has('document') });
    node.setAttribute('disabled', '');
    Object.assign(result, { disabled: new FormData(other).has('renamed') });
    node.removeAttribute('disabled'); node.removeAttribute('form'); node.name = 'document'; other.remove();
    return result;
  });
  expect(association).toEqual({ associated: true, submitted: true, renamed: true, oldName: false, disabled: false });
  await workshop.getByRole('button', { name: 'Preview form submission' }).click();
  await expect(payload).toContainText('Security exception');
  await workshop.evaluate(element => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: info.outputPath('native-form-reset.png') });
  expect(errors).toEqual([]);
}
