import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test.use({ video: 'on', trace: 'on' });
test('explains refused homepage paste and recovers using the native clipboard', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await expect(editor).toBeVisible();
  await page.locator('.studio__export').getByRole('button', { name: 'html', exact: true }).click();
  const output = page.locator('.studio__export pre');
  const originalOutput = await output.textContent(), originalText = await editor.textContent();
  await expect(page.locator('.fountain-character-count')).toContainText('/ 5000');
  const copyHTML = async (html: string) => {
    await page.evaluate(value => {
      const source = document.createElement('div');
      source.contentEditable = 'true'; source.setAttribute('role', 'textbox');
      source.setAttribute('aria-label', 'External clipboard test source'); source.innerHTML = value;
      document.body.append(source); source.focus();
    }, html);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+c');
    await page.getByRole('textbox', { name: 'External clipboard test source' }).evaluate(element => element.remove());
  };
  const paste = async () => {
    await editor.locator(':scope > p').first().click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+v');
  };
  await copyHTML(`<p>${'x'.repeat(5001)}</p>`);
  await paste();
  const notice = page.getByRole('alert').filter({ hasText: 'Paste was not inserted' });
  await expect(notice).toBeVisible();
  expect(await editor.textContent()).toBe(originalText);
  expect(await output.textContent()).toBe(originalOutput);
  await page.locator('.studio__canvas').screenshot({ path: info.outputPath('paste-refused.png') });
  await copyHTML('<h2>Pasted note</h2><p><strong>Kept</strong> emphasis.</p>');
  await paste();
  await expect(editor.getByRole('heading', { name: 'Pasted note', exact: true })).toBeVisible();
  await expect(editor.locator('strong')).toHaveText('Kept');
  await expect.poll(() => output.evaluate(element => new DOMParser().parseFromString(element.textContent!, 'text/html')
    .querySelector('strong')?.textContent)).toBe('Kept');
  await expect(notice).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => output.textContent()).toBe(originalOutput);
  expect(await editor.textContent()).toBe(originalText);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(editor.locator('strong')).toHaveText('Kept');
  await page.locator('.studio__canvas').screenshot({ path: info.outputPath('paste-recovered.png') });
  await writeFile(info.outputPath('homepage-paste.json'), JSON.stringify({ engine: info.project.name,
    clipboard: 'Native keyboard copy from a separate controlled contenteditable and native keyboard paste into Fountain; no clipboard API stubs or permissions override.',
    rejectedCharacters: 5001, originalPreserved: true, richPasteAccepted: true, undoRedo: true, errors }, null, 2));
  expect(errors).toEqual([]);
});
