import { expect, type Page, type TestInfo } from '@playwright/test';

export async function nativeFormPolicyContracts(page: Page) {
  await page.goto('/browser-tests.html');
  const probe = (mode: string, value: unknown, disabled = false) => page.evaluate(
    ({ mode, value, disabled }) => (globalThis as any).fountainBrowserTest.nativeFormValidation(mode, value, disabled),
    { mode, value, disabled },
  );
  const doc = (content: unknown[]) => ({ type: 'doc', attrs: { owner: 'Ada' }, content });
  for (const content of [[{ type: 'paragraph' }], [{ type: 'paragraph', content: [{ type: 'text', text: ' \t\n\u00a0' }] }],
    [{ type: 'paragraph', content: [{ type: 'hard_break' }] }], [{ type: 'code_block' }]]) {
    const result = await probe('default', doc(content));
    expect(result.validity).toEqual({ valid: false, valueMissing: true, customError: false });
    expect(result.checks).toEqual({ element: false, report: false, form: false });
    expect(result.invalidEvents).toBe(3);
    expect(result.unchanged).toBe(true);
    expect(result.errors).toEqual([]);
    expect(JSON.parse(result.submitted)).toEqual(result.value);
  }
  const divider = doc([{ type: 'horizontal_rule' }]);
  for (const [mode, valid] of [['default', true], ['text-only', false]] as const) {
    const result = await probe(mode, divider);
    expect(result.validity).toEqual({ valid, valueMissing: !valid, customError: false });
    expect(result.unchanged).toBe(true);
    expect(result.errors).toEqual([]);
    if (!valid) expect(result.message).toBe('Write an explanation.');
  }
  const prose = doc([{ type: 'paragraph', content: [{ type: 'text', text: 'Literal \u200b data.' }] }]);
  const valid = await probe('text-only', prose);
  expect(valid.validity).toEqual({ valid: true, valueMissing: false, customError: false });
  expect(valid.checks).toEqual({ element: true, report: true, form: true });
  expect(valid.invalidEvents).toBe(0);
  expect(valid.value.content[0].content[0].text).toBe('Literal \u200b data.');
  for (const mode of ['throws', 'invalid-return']) {
    const failure = await probe(mode, prose);
    expect(failure.validity).toEqual({ valid: false, valueMissing: false, customError: true });
    expect(failure.checks).toEqual({ element: false, report: false, form: false });
    expect(failure.message).toBe('This document could not be validated.');
    expect(failure.errors.length).toBeGreaterThan(0);
    expect(failure.unchanged).toBe(true);
  }
  const disabled = await probe('throws', prose, true);
  expect(disabled.willValidate).toBe(false);
  expect(disabled.checks).toEqual({ element: true, report: true, form: true });
  expect(disabled.submitted).toBeNull();
}

export async function nativeFormLabelContracts(page: Page) {
  await page.goto('/demos/java-approval-workflow.html#native-form');
  const workshop = page.getByRole('region', { name: 'Native HTML form workshop' });
  const field = workshop.locator('fountain-native-form-editor');
  const editor = field.locator('[role=textbox]');
  const label = workshop.locator('label[for="native-approval-document"]');
  await label.evaluate(node => { node.textContent = 'Revised request document'; });
  await expect(editor).toHaveAccessibleName('Revised request document');
  await label.click(); await expect(editor).toBeFocused();
  await field.evaluate(node => node.setAttribute('aria-label', 'Explicit document name'));
  await expect(editor).toHaveAccessibleName('Explicit document name');
  await field.evaluate(node => {
    node.removeAttribute('aria-label'); node.id = 'renamed-native-document';
    const wrapper = document.createElement('label'); wrapper.dataset.wrappingLabelProbe = '';
    wrapper.append('Wrapped document name'); node.before(wrapper); wrapper.append(node);
  });
  await expect(editor).toHaveAccessibleName('Wrapped document name');
  await workshop.locator('[data-wrapping-label-probe]').click({ position: { x: 6, y: 6 } });
  await expect(editor).toBeFocused();
  const lifecycle = await field.evaluate((node: any) => {
    const before = JSON.stringify(node.value), parent = node.parentNode;
    node.remove(); parent.append(node);
    return { before, after: JSON.stringify(node.value), anchors: node.querySelectorAll('[data-fountain-form-validation-anchor]').length,
      labels: node.labels.length, hostTabIndex: node.tabIndex };
  });
  expect(lifecycle.after).toBe(lifecycle.before);
  expect(lifecycle).toMatchObject({ anchors: 1, labels: 1, hostTabIndex: -1 });
  await expect(editor).toHaveAccessibleName('Wrapped document name');
}

export async function childlessBlockClickJourney(page: Page, info: TestInfo) {
  await page.goto('/browser-tests.html');
  const surface = page.getByRole('textbox', { name: 'Browser contract editor', exact: true });
  for (const type of ['paragraph', 'heading', 'code_block']) {
    const before = await page.evaluate(type => {
      const { editor, view } = (globalThis as any).fountainBrowserTest;
      const attrs = type === 'heading' ? { level: 3, align: 'center' }
        : type === 'code_block' ? { language: 'python', lineNumbers: false } : { align: 'right' };
      const replacement = editor.state.schema.nodeFromJSON({ type: 'doc', content: [{ type, attrs }] });
      editor.dispatch(editor.createTransaction().replaceDocument(replacement).setMeta('addToHistory', false));
      view.focus(); return editor.getJSON();
    }, type);
    await surface.locator('[data-fountain-empty-text-block]').click();
    await page.keyboard.type('Fill this block');
    const after = await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.getJSON());
    expect(after.content).toHaveLength(1);
    expect(after.content[0].type).toBe(type);
    expect(after.content[0].attrs).toEqual(before.content[0].attrs);
    await expect(surface).toContainText('Fill this block');
    await page.keyboard.press('Control+z');
    expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.getJSON())).toEqual(before);
    await page.keyboard.press('Control+Shift+z');
    expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.getJSON())).toEqual(after);
  }
  await surface.screenshot({ path: info.outputPath('childless-code-click-filled.png') });
}
