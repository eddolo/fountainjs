import { expect, type Page, type TestInfo } from '@playwright/test';

export async function autoContainerDirectionJourney(page: Page, info: TestInfo): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/demos/node-markdown.html');
  const workshop = page.getByRole('region', { name: 'Section authoring workshop' });
  await workshop.scrollIntoViewIfNeeded();
  const editor = workshop.getByRole('textbox', { name: 'Section authoring editor', exact: true });
  const section = editor.locator('section#handover');
  const heading = section.locator(':scope > h2');
  const paragraph = section.locator(':scope > p').first();
  const replaceHeading = async (text: string) => {
    await heading.click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    await page.keyboard.insertText(text);
    await expect(heading).toHaveText(text);
  };
  await replaceHeading('שלום');
  await workshop.getByRole('combobox', { name: 'Direction', exact: true }).selectOption('auto');
  await workshop.getByRole('button', { name: 'Apply section properties', exact: true }).click();
  await expect(section).toHaveAttribute('dir', 'auto');
  await expect(paragraph).not.toHaveAttribute('dir');
  await expect(paragraph).toHaveCSS('direction', 'rtl');
  await expect(paragraph).toHaveText('Inspect logs and record the outcome.');
  const geometry = () => paragraph.evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element);
    const block = element.getBoundingClientRect(), text = range.getBoundingClientRect();
    return { left: text.left - block.left, right: block.right - text.right };
  });
  expect((await geometry()).right).toBeLessThan(5);
  await editor.screenshot({ path: info.outputPath('auto-container-rtl-editor.png') });
  await workshop.getByRole('button', { name: 'Preview sections for readers', exact: true }).click();
  const reader = workshop.frameLocator('iframe[title="Section reader snapshot"]');
  await expect(reader.locator('section#handover')).toHaveAttribute('dir', 'auto');
  await expect(reader.locator('section#handover > p')).toHaveCSS('direction', 'rtl');
  await workshop.locator('iframe').screenshot({ path: info.outputPath('auto-container-rtl-reader.png') });

  // This edits only the first strong text, not direction attributes. Both the
  // heading and a separate English paragraph must follow one shared context.
  await replaceHeading('Release handover');
  await expect(section).toHaveAttribute('dir', 'auto');
  await expect(paragraph).toHaveCSS('direction', 'ltr');
  expect((await geometry()).left).toBeLessThan(5);
  await workshop.getByRole('button', { name: 'Undo section edit', exact: true }).click();
  await expect(heading).toHaveText('שלום');
  await expect(paragraph).toHaveCSS('direction', 'rtl');
  await workshop.getByRole('button', { name: 'Redo section edit', exact: true }).click();
  await expect(heading).toHaveText('Release handover');
  await expect(paragraph).toHaveCSS('direction', 'ltr');
  // Reader snapshots are deliberately independent until explicitly refreshed.
  await expect(reader.locator('section#handover > h2')).toHaveText('שלום');
  await expect(reader.locator('section#handover > p')).toHaveCSS('direction', 'rtl');
  await workshop.getByRole('button', { name: 'Preview sections for readers', exact: true }).click();
  await expect(reader.locator('section#handover > h2')).toHaveText('Release handover');
  await expect(reader.locator('section#handover > p')).toHaveCSS('direction', 'ltr');
  await editor.screenshot({ path: info.outputPath('auto-container-ltr-editor.png') });
  await workshop.locator('iframe').screenshot({ path: info.outputPath('auto-container-ltr-reader.png') });
  expect(errors).toEqual([]);
}
