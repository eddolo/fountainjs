import { expect, type Page, type TestInfo } from '@playwright/test';

export const styledBriefHTML = `<!doctype html><html><head><title>Styled brief</title></head><body>
<h1>Release brief</h1>
<section style="font-weight:bold;color:#123456"><p>Approved scope</p><p><em>Review the handoff</em></p></section>
<p>Unformatted closing note</p>
<ul><li style="color:#654321">Owner confirmed</li></ul>
<table><thead><tr><th>Name</th><th>Status</th></tr></thead><tbody style="font-weight:bold"><tr><td style="color:#123456">Ada</td><td style="color:#654321">Ready</td></tr></tbody></table>
</body></html>`;

export async function htmlBlockFormatJourney(page: Page, info: TestInfo): Promise<void> {
  const capture = async (name: string) => {
    await page.evaluate(async () => {
      await document.fonts.ready;
      window.scrollTo({ top: 0, behavior: 'instant' });
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    await page.screenshot({ path: info.outputPath(name), fullPage: true });
  };
  await page.setContent(styledBriefHTML);
  await expect(page.getByText('Approved scope', { exact: true })).toHaveCSS('font-weight', '700');
  await capture('original-styled-brief.png');
  await page.goto('/demos/node-markdown.html');
  await page.getByRole('button', { name: 'Server HTML', exact: true }).click();
  await page.getByLabel('Server HTML input', { exact: true }).fill(styledBriefHTML);
  await expect(async () => {
    const doc = JSON.parse(await page.locator('.demo-output pre').innerText());
    expect(doc.content[1].content[0].marks).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'strong' }), expect.objectContaining({ type: 'text_color', attrs: { color: '#123456' } }),
    ]));
  }).toPass();
  const details = page.getByRole('list', { name: 'Server HTML conversion details' });
  await expect(details).toContainText('Unmapped HTML block wrappers were removed.');
  await expect(page.getByText('HTML is converted into the supported document schema.', { exact: false }))
    .toContainText('not a guarantee of lossless conversion');
  const resultPanel = page.getByRole('region', { name: 'Document output', exact: true });
  await expect.poll(() => resultPanel.evaluate(element => element.scrollHeight > element.clientHeight && element.clientHeight <= 680)).toBe(true);
  await resultPanel.focus();
  await page.keyboard.press('PageDown');
  await expect.poll(() => resultPanel.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await resultPanel.evaluate(element => { element.scrollTop = 0; });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: info.outputPath('section-conversion-warning.png'), fullPage: true });
  await page.goto('/issue-editor.html');
  const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  // Exercise the standard HTML paste handler directly, not a private model setter.
  // This is clipboard-payload coverage, not OS clipboard permission certification.
  await editor.evaluate((element, html) => {
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { files: [], getData: (type: string) => type === 'text/html' ? html : '' } });
    element.dispatchEvent(paste);
  }, styledBriefHTML);
  const verify = async (surface: typeof editor) => {
    await expect(surface.locator('h1')).toHaveText('Release brief');
    await expect(surface.getByText('Approved scope', { exact: true })).toHaveCSS('font-weight', '700');
    await expect(surface.getByText('Approved scope', { exact: true })).toHaveCSS('color', 'rgb(18, 52, 86)');
    await expect(surface.getByText('Review the handoff', { exact: true })).toHaveCSS('font-style', 'italic');
    await expect(surface.getByText('Unformatted closing note', { exact: true })).toHaveCSS('font-weight', '400');
    await expect(surface.getByText('Owner confirmed', { exact: true })).toHaveCSS('color', 'rgb(101, 67, 33)');
    await expect(surface.getByText('Ready', { exact: true })).toHaveCSS('font-weight', '700');
    await expect(surface.getByText('Ready', { exact: true })).toHaveCSS('color', 'rgb(101, 67, 33)');
  };
  await verify(editor);
  await editor.getByText('Unformatted closing note', { exact: true }).click();
  await page.keyboard.press('End');
  // Keep this typing group on keyboard events; Playwright inserts unsupported
  // Unicode keys through a separate input path on Firefox.
  await page.keyboard.type(' - checked');
  await expect(editor).toContainText('Unformatted closing note - checked');
  await page.keyboard.press('ControlOrMeta+z');
  await verify(editor);
  await capture('pasted-styled-brief.png');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Markdown draft', exact: true }).click();
  const path = info.outputPath('styled-brief.md');
  await (await downloading).saveAs(path);
  await page.getByLabel('Open Markdown draft file', { exact: true }).setInputFiles(path);
  await verify(editor);
  await page.getByRole('button', { name: 'Reader preview', exact: true }).click();
  const reader = page.getByRole('textbox', { name: 'Issue preview', exact: true });
  await verify(reader);
  await capture('reopened-styled-reader.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await verify(reader);
  await capture('reopened-styled-reader-mobile.png');
}
