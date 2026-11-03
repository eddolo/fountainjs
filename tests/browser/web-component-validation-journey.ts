import { expect, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

export async function webComponentValidationJourney(page: Page, info: TestInfo) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (/invalid form control.*not focusable/iu.test(message.text())) errors.push(message.text()); });
  await page.goto('/demos/java-approval-workflow.html#native-form');
  const workshop = page.getByRole('region', { name: 'Native HTML form workshop' });
  const field = workshop.locator('fountain-native-form-editor');
  const editor = workshop.getByRole('textbox', { name: 'Approval request document', exact: true });
  const payload = workshop.getByLabel('Native form payload');
  const submit = workshop.getByRole('button', { name: 'Preview form submission', exact: true });
  const flags = () => field.evaluate((node: any) => ({ required: node.required, willValidate: node.willValidate,
    valueMissing: node.validity.valueMissing, customError: node.validity.customError, valid: node.validity.valid,
    message: node.validationMessage, labelCount: node.labels.length }));
  await workshop.locator('label[for="native-approval-document"]').click();
  await expect(editor).toBeFocused();
  expect(await flags()).toMatchObject({ required: true, willValidate: true, valid: true, labelCount: 1 });
  await workshop.getByRole('button', { name: 'Clear document', exact: true }).click();
  await expect(editor).toHaveText('');
  const initialPayload = await payload.textContent();
  for (const display of ['inline', 'block', 'inline-block']) {
    await field.evaluate((node, display) => { (node as HTMLElement).style.display = display; (node as HTMLElement).style.width = '100%'; }, display);
    await submit.click();
    await expect(editor, `Native validation focus with display:${display}`).toBeFocused();
    // Validate real layout, not just model text or simulated input events.
    await expect.poll(() => editor.locator('p').first().evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
  }
  await expect(payload).toHaveText(initialPayload!);
  await expect(workshop.getByRole('alert')).toHaveText('Please enter content.');
  await expect(editor).toBeFocused();
  await expect(editor).toHaveAttribute('aria-invalid', 'true');
  expect(await flags()).toMatchObject({ valueMissing: true, customError: false, valid: false });
  const layout = await editor.evaluate(element => {
    const paragraph = element.querySelector('p')!;
    const rect = paragraph.getBoundingClientRect(), style = getComputedStyle(paragraph);
    const ancestors = [];
    for (let node: Element | null = paragraph; node; node = node.parentElement) {
      const box = node.getBoundingClientRect(), css = getComputedStyle(node);
      ancestors.push({ tag: node.tagName, connected: node.isConnected, display: css.display, visibility: css.visibility,
        contentVisibility: css.contentVisibility, width: box.width, height: box.height, clientRects: node.getClientRects().length });
    }
    return { html: paragraph.outerHTML, rect: { width: rect.width, height: rect.height, x: rect.x, y: rect.y },
      style: { display: style.display, visibility: style.visibility, minHeight: style.minHeight, lineHeight: style.lineHeight },
      editor: element.outerHTML, active: element.ownerDocument.activeElement?.outerHTML, ancestors,
    };
  });
  await writeFile(info.outputPath('empty-required-layout.json'), JSON.stringify(layout, null, 2));
  expect(layout.rect.height).toBeGreaterThan(0);
  await workshop.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('native-form-required.png') });
  // After Clear and native invalid submission, type immediately. The host's
  // explicit start focus must fill the original childless paragraph.
  await page.keyboard.type('Approval owner: Ada.');
  await expect(workshop.getByRole('alert')).toBeHidden();
  expect(await flags()).toMatchObject({ valueMissing: false, valid: true });
  await submit.click();
  const submitted = JSON.parse((await payload.textContent())!);
  expect(JSON.parse(submitted.document).attrs.workflow).toBe('approval');
  expect(JSON.parse(submitted.document)).toEqual(await field.evaluate((node: any) => node.value));
  expect(JSON.parse(submitted.document).content).toHaveLength(1);
  await expect(editor).toHaveText('Approval owner: Ada.');
  await workshop.getByRole('button', { name: 'Set approval-rule error', exact: true }).click();
  await submit.click();
  await expect(workshop.getByRole('alert')).toHaveText('Approval owner confirmation is required by this example.');
  expect(await flags()).toMatchObject({ valueMissing: false, customError: true, valid: false });
  await expect(payload).toHaveText(JSON.stringify(submitted, null, 2));
  await page.screenshot({ path: info.outputPath('native-form-custom-error.png') });
  await workshop.getByRole('button', { name: 'Reset form', exact: true }).click();
  await expect(editor).toHaveText('Explain the requested exception.');
  expect(await flags()).toMatchObject({ customError: true, valid: false });
  await workshop.getByRole('button', { name: 'Clear approval-rule error', exact: true }).click();
  expect(await flags()).toMatchObject({ customError: false, valid: true });
  await workshop.getByRole('button', { name: 'Clear document', exact: true }).click();
  await workshop.getByRole('checkbox', { name: 'Disable the form fields', exact: true }).check();
  expect(await flags()).toMatchObject({ willValidate: false, valueMissing: false, valid: true });
  await submit.click(); await expect(payload).toHaveText('{}');
  await workshop.getByRole('checkbox', { name: 'Disable the form fields', exact: true }).uncheck();
  expect(await flags()).toMatchObject({ willValidate: true, valueMissing: true });
  await workshop.getByRole('checkbox', { name: 'Require document content', exact: true }).uncheck();
  expect(await flags()).toMatchObject({ required: false, valid: true });
  await workshop.getByRole('checkbox', { name: 'Require document content', exact: true }).check();
  await workshop.locator('label[for="native-approval-document"]').click();
  await page.keyboard.type('Ready for review.');
  await submit.click();
  expect(await flags()).toMatchObject({ required: true, valid: true });
  expect(JSON.parse(JSON.parse((await payload.textContent())!).document).content).toHaveLength(1);
  await page.screenshot({ path: info.outputPath('native-form-valid-submission.png') });
  expect(errors).toEqual([]);
}
