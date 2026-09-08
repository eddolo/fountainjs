import { expect, type Page, type TestInfo } from '@playwright/test';
import { inStableDocument } from './stable-document';

export async function markdownStructuralRecoveryJourney(page: Page, info: TestInfo): Promise<void> {
  const capture = async (name: string) => {
    await page.evaluate(async () => {
      await document.fonts.ready;
      window.scrollTo({ top: 0, behavior: 'instant' });
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    await page.screenshot({ path: info.outputPath(name), fullPage: true });
  };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const body = '3. First step\n   - Inspect logs  \n     Check timestamps\n   - Retry request\n4. > Record outcome\n\n- [ ] Review incident\n  - [x] Notify team\n  - [ ] Follow up\n\nDiagram: [![Service diagram](/demo-media.svg "Service map")](/details) for the incident.';
  await page.goto('/demos/node-markdown.html');
  const input = page.getByLabel('Markdown input', { exact: true });
  const output = page.locator('.demo-output');
  await input.fill(`<blockquote>\n\n${body}\n\n</blockquote>`);
  await output.getByRole('button', { name: 'html', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Recover Markdown text across HTML blocks' }).check();
  await expect(output.locator('pre')).toContainText('<ol start="3">');
  await expect(page.getByRole('list', { name: 'Markdown HTML conversion details' })).toContainText('Block grouping/identity');
  const html = await output.locator('pre').innerText();
  await capture('nested-flow-conversion.png');
  await page.goto('/issue-editor.html');
  const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
  const reader = page.getByRole('textbox', { name: 'Issue preview', exact: true });
  await inStableDocument(page, 'Paste recovered nested list', async () => {
    await editor.click();
    await page.keyboard.press('ControlOrMeta+a');
    // Exercise the public paste handler, not an OS clipboard certification.
    await editor.evaluate((element, value) => {
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: { files: [], getData: (type: string) => type === 'text/html' ? value : '' } });
      element.dispatchEvent(event);
    }, html);
  });
  let taskCompleted = false;
  const verify = async (surface: typeof editor, edited = false, reviewed = false) => {
    const tasks = surface.locator('li[data-type="task-item"]');
    await expect(tasks).toHaveCount(3);
    await expect(tasks.nth(0)).toHaveAttribute('data-checked', String(taskCompleted));
    await expect(tasks.nth(1)).toHaveAttribute('data-checked', 'true');
    await expect(tasks.nth(2)).toHaveAttribute('data-checked', 'false');
    await expect(tasks.first().locator('ul[data-type="task-list"]')).toHaveCount(1);
    for (const [index, completed] of [taskCompleted, true, false].entries()) {
      await expect(tasks.nth(index).locator(':scope > .fountain-task-item__content > p').first())
        .toHaveCSS('text-decoration-line', completed ? 'line-through' : 'none');
      // No decorated ancestor may visually strike through an unfinished child.
      await expect(tasks.nth(index).locator(':scope > .fountain-task-item__content'))
        .toHaveCSS('text-decoration-line', 'none');
    }
    await expect(surface.locator('ol')).toHaveCount(1);
    await expect(surface.locator('ol')).toHaveAttribute('start', '3');
    await expect(surface.locator('ol > li')).toHaveCount(2);
    const items = surface.locator('ol > li').first().locator('ul > li');
    await expect(items).toHaveText([/Inspect logs\s*Check timestamps/u, 'Retry request']);
    await expect(items.first().locator('br')).toHaveCount(1);
    // A real line break must produce a second visible line, not just an atom
    // in JSON or a space. Verify again after download/reopen and in the reader.
    await expect.poll(() => items.first().evaluate(element => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const tops: number[] = [];
      const lefts: number[] = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const value = node.textContent ?? '';
        for (const word of ['Inspect', 'Check']) {
          const index = value.indexOf(word);
          if (index < 0) continue;
          const range = document.createRange();
          range.setStart(node, index); range.setEnd(node, index + word.length);
          tops.push(range.getBoundingClientRect().top);
          lefts.push(range.getBoundingClientRect().left);
        }
      }
      const lineHeight = Number.parseFloat(getComputedStyle(element.querySelector('p') ?? element).lineHeight);
      return tops.length === 2 && Number.isFinite(lineHeight)
        && Math.abs(tops[1] - tops[0] - lineHeight) < 2 && Math.abs(lefts[1] - lefts[0]) < 2;
    })).toBe(true);
    await expect(surface.locator('ol > li').last().locator('blockquote')).toHaveText('Record outcome');
    await expect(surface.getByText(edited ? 'First step updated' : 'First step', { exact: true })).toBeVisible();
    const imageName = reviewed ? 'Service diagram reviewed' : 'Service diagram';
    const image = surface.getByRole('img', { name: imageName, exact: true });
    await expect(image).toHaveCount(1);
    await expect(image).toHaveAttribute('data-fountain-inline-image', 'true');
    await expect(image).toHaveAttribute('src', '/demo-media.svg');
    await expect(image).toHaveAttribute('title', reviewed ? 'Service map verified' : 'Service map');
    await expect(surface.locator('a[href="/details"]').getByRole('img', { name: imageName, exact: true })).toHaveCount(1);
    await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth > 0)).toBe(true);
    expect(errors).toEqual([]);
  };
  await verify(editor);
  const taskToggle = editor.locator('input[data-fountain-task-toggle]').first();
  await taskToggle.click();
  taskCompleted = true;
  await verify(editor);
  await page.keyboard.press('ControlOrMeta+z');
  taskCompleted = false;
  await verify(editor);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  taskCompleted = true;
  await verify(editor);
  await editor.getByText('First step', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' updated');
  await verify(editor, true);
  await page.keyboard.press('ControlOrMeta+z');
  await verify(editor);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await verify(editor, true);
  await editor.getByRole('img', { name: 'Service diagram', exact: true }).click();
  await page.getByRole('button', { name: 'Edit selected image', exact: true }).click();
  const imageForm = page.locator('form.is-image');
  await expect(imageForm.getByText('Image URL', { exact: true })).toBeVisible();
  await expect(imageForm.getByText('Alternative text', { exact: true })).toBeVisible();
  await expect(imageForm.getByText('Title (optional)', { exact: true })).toBeVisible();
  await imageForm.getByLabel('Alternative text', { exact: true }).fill('Service diagram reviewed');
  await imageForm.getByLabel('Image title', { exact: true }).fill('Service map verified');
  await capture('nested-flow-image-controls.png');
  await imageForm.getByRole('button', { name: 'Save image', exact: true }).click();
  await verify(editor, true, true);
  await page.keyboard.press('ControlOrMeta+z');
  await verify(editor, true);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await verify(editor, true, true);
  await editor.getByRole('img', { name: 'Service diagram reviewed', exact: true }).click();
  await page.keyboard.press('Delete');
  await expect(editor.getByRole('img')).toHaveCount(0);
  await expect(editor).toContainText('for the incident.');
  await page.keyboard.press('ControlOrMeta+z');
  await verify(editor, true, true);
  await capture('nested-flow-editor.png');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Markdown draft', exact: true }).click();
  const file = info.outputPath('nested-flow.md');
  await (await download).saveAs(file);
  await page.getByLabel('Open Markdown draft file', { exact: true }).setInputFiles(file);
  await verify(editor, true, true);
  await page.getByRole('button', { name: 'Reader preview', exact: true }).click();
  await verify(reader, true, true);
  await capture('nested-flow-reader.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await verify(reader, true, true);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture('nested-flow-mobile-reader.png');
}
