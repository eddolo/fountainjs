import { expect, type Page, type TestInfo } from '@playwright/test';

export async function htmlContainerAuthoringJourney(page: Page, info: TestInfo) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/demos/node-markdown.html');
  const workshop = page.getByRole('region', { name: 'Section authoring workshop' });
  await workshop.scrollIntoViewIfNeeded();
  const editor = workshop.getByRole('textbox', { name: 'Section authoring editor', exact: true });
  await expect(editor.locator('section#next > p')).toHaveCount(0);
  await workshop.getByLabel('Section to configure').selectOption('1');
  await workshop.getByRole('button', { name: 'Add paragraph to section', exact: true }).click();
  await page.keyboard.type('Plan review.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Confirm owners.');
  await expect(editor.locator('section#next > p')).toHaveCount(2);
  await workshop.getByLabel('Section title', { exact: true }).fill('Follow-up notes');
  await workshop.getByRole('combobox', { name: 'Element', exact: true }).selectOption('aside');
  await workshop.getByRole('button', { name: 'Apply section properties', exact: true }).click();
  await expect(editor.locator('aside#next')).toHaveAttribute('title', 'Follow-up notes');
  await expect(editor.locator('aside#next')).toContainText('Confirm owners.');
  await workshop.getByRole('button', { name: 'Insert new section', exact: true }).click();
  await page.keyboard.type('Additional notes.');
  await expect(editor.locator(':scope > section')).toHaveCount(2);
  await workshop.getByRole('button', { name: 'Remove wrapper, keep content', exact: true }).click();
  // StarterKit also retains its trailing caret paragraph outside the sections.
  await expect(editor.locator(':scope > p')).toHaveText(['Additional notes.', '']);
  await workshop.getByRole('button', { name: 'Undo section edit', exact: true }).click();
  await expect(editor.locator(':scope > section')).toHaveCount(2);
  await expect(editor.locator(':scope > section').last()).toContainText('Additional notes.');
  await workshop.getByRole('button', { name: 'Redo section edit', exact: true }).click();
  await expect(editor.locator(':scope > p')).toHaveText(['Additional notes.', '']);
  // Observe the actual native keyboard copy event after the editor populates
  // its formats; no model mutation or fabricated clipboard payload.
  await page.evaluate(() => {
    document.addEventListener('copy', event => {
      (globalThis as any).__sectionCopy = { plain: event.clipboardData?.getData('text/plain'), html: event.clipboardData?.getData('text/html') };
    }, { once: true });
  });
  await editor.locator(':scope > p').first().click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('ControlOrMeta+c');
  await expect.poll(() => page.evaluate(() => (globalThis as any).__sectionCopy?.plain)).toContain('Plan review.\nConfirm owners.');
  expect(await page.evaluate(() => (globalThis as any).__sectionCopy?.html)).toContain('<aside');
  await page.keyboard.press('ArrowRight');
  await workshop.getByRole('button', { name: 'Preview sections for readers', exact: true }).click();
  const reader = workshop.frameLocator('iframe[title="Section reader snapshot"]');
  await expect(reader.locator('aside#next')).toContainText('Plan review.');
  await expect(reader.locator('aside#next')).toHaveAttribute('title', 'Follow-up notes');
  await expect(reader.locator('body > p')).toHaveText(['Additional notes.', '']);
  await workshop.locator('iframe').scrollIntoViewIfNeeded();
  await expect(reader.getByRole('heading', { name: 'Release handover' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('section-reader-visible.png') });
  await editor.getByRole('heading', { name: 'Release handover' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('section-author-visible.png') });
  await workshop.screenshot({ path: info.outputPath('section-author-and-reader.png') });
  // The same controls remain usable at a narrow phone-sized viewport.
  await page.setViewportSize({ width: 390, height: 844 });
  await workshop.getByLabel('Section to configure').selectOption('1');
  await expect(workshop.getByLabel('Section title', { exact: true })).toHaveValue('Follow-up notes');
  await workshop.getByLabel('Section title', { exact: true }).scrollIntoViewIfNeeded();
  const bounds = await workshop.getByLabel('Section title', { exact: true }).boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath('section-mobile-properties.png') });
  expect(errors).toEqual([]);
}

export async function htmlContainerJourney(page: Page, info: TestInfo) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/demos/node-markdown.html');
  await page.getByRole('button', { name: 'Server HTML', exact: true }).click();
  await page.getByLabel('Server HTML input', { exact: true }).fill('<section id="handover"><h2>Release</h2><div class="checks"><p>Inspect logs.</p><p>Record outcome.</p></div></section>');
  const output = page.locator('.demo-output');
  await expect(output).toContainText('Inspect logs.');
  await expect(output).not.toContainText('html_container');
  await page.getByLabel('Preserve HTML section containers', { exact: true }).check();
  await expect(output).toContainText('html_container');
  await expect(output).toContainText('handover');
  await expect(output).toContainText('checks');
  await page.screenshot({ path: info.outputPath('public-container-option.png'), fullPage: true });
  await page.getByLabel('Server HTML input', { exact: true }).fill('<section data-private="private-value"><p>Still readable.</p></section>');
  await expect(output).toContainText('Still readable.');
  await expect(output).not.toContainText('html_container');
  await expect(page.getByText('Unmapped HTML block wrappers were removed.', { exact: false })).toBeVisible();
  await page.goto('/browser-tests.html');
  const result = await page.evaluate(() => (globalThis as any).fountainBrowserTest.htmlContainers());
  expect(result.retained).toBe(result.source);
  const root = page.locator('#html-container-audit');
  const editor = root.getByRole('textbox', { name: 'Structured section editor', exact: true });
  await expect(editor.locator('section#handover .checks li')).toHaveCount(2);
  await expect(editor.locator('section#handover > p br')).toHaveCount(1);
  await editor.locator('section#handover > p').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' today');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Follow up tomorrow.');
  await expect(editor.locator('section#handover > p')).toHaveCount(2);
  await expect(editor).toContainText('Follow up tomorrow.');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor).not.toContainText('Follow up tomorrow.');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(editor).toContainText('Follow up tomorrow.');
  await root.getByRole('button', { name: 'Preview saved section' }).click();
  const reader = root.locator('[data-reader]');
  await expect(reader.locator('section#handover')).toHaveAttribute('lang', 'en');
  await expect(reader.locator('section#handover > p')).toHaveCount(2);
  await expect(reader.locator('.checks li')).toHaveCount(2);
  await expect(reader).toContainText('Follow up tomorrow.');
  await root.screenshot({ path: info.outputPath('edited-section-and-reader.png') });
  expect(errors).toEqual([]);
}
