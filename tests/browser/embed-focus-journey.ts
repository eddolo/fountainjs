import { expect, type Page, type TestInfo, type Locator } from '@playwright/test';

/** Provider scripts load only after native activation and unload when prose resumes. */
export async function embedFocusJourney(page: Page, info: TestInfo) {
  let providerRequests = 0;
  await page.route('https://www.youtube-nocookie.com/**', route => {
    providerRequests++;
    return route.fulfill({
      contentType: 'text/html',
      body: `<label>Provider search<input id="search"></label><script>
      addEventListener('message', event => {
        if (event.data !== 'fountain-fixture-request-focus') return;
        document.querySelector('input').focus();
        parent.postMessage('fountain-fixture-attempted-focus', '*');
      });
      </script>`,
    });
  });
  const choose = (target: Locator) => info.project.name.startsWith('mobile-') ? target.tap() : target.click();
  await page.goto('/demos/angular-media.html');
  const editor = page.getByRole('textbox', { name: 'Angular campaign editor', exact: true });
  const frame = editor.locator('iframe.fountain-embed');
  await expect(frame).toHaveCount(1);
  await expect(frame).toHaveAttribute('srcdoc', '');
  expect(providerRequests).toBe(0);
  await page.evaluate(() => {
    (window as any).__embedFocusAttempts = 0;
    addEventListener('message', event => {
      const frame = document.querySelector<HTMLIFrameElement>('iframe.fountain-embed');
      if (event.source === frame?.contentWindow && event.data === 'fountain-fixture-attempted-focus') {
        (window as any).__embedFocusAttempts++;
      }
    });
  });
  const requestFocus = async (attempt: number) => {
    await frame.evaluate((element: HTMLIFrameElement) => element.contentWindow!.postMessage('fountain-fixture-request-focus', '*'));
    await expect.poll(() => page.evaluate(() => (window as any).__embedFocusAttempts)).toBe(attempt);
  };
  await choose(editor.locator(':scope > p').last());
  await page.keyboard.press('Control+End'); await page.keyboard.press('Enter');
  await page.keyboard.type('Mobile');
  await expect(editor).toBeFocused();
  expect(providerRequests).toBe(0);
  await page.keyboard.type(' campaign note.');
  await expect(editor.locator(':scope > p').last()).toHaveText('Mobile campaign note.');
  await editor.screenshot({ caret: 'initial', path: info.outputPath('embed-protected-typing.png') });

  // Keyboard activation must make the actual provider control usable.
  const activate = editor.getByRole('button', { name: 'Interact with Approved campaign embed', exact: true });
  await activate.focus(); await page.keyboard.press('Enter');
  await expect(activate).toBeHidden();
  await expect(frame).not.toHaveAttribute('srcdoc');
  const search = page.frameLocator('iframe.fountain-embed').getByRole('textbox', { name: 'Provider search', exact: true });
  await expect(search).toBeVisible();
  await requestFocus(1);
  await expect(search).toBeFocused();
  await page.keyboard.type('Preview query');
  await expect(search).toHaveValue('Preview query');
  await frame.screenshot({ caret: 'initial', path: info.outputPath('embed-activated-provider.png') });

  // Returning to prose re-arms the guard; it never rewrites stored content.
  await choose(editor.locator(':scope > p').last()); await page.keyboard.press('End');
  await page.keyboard.type(' Returned.');
  await expect(activate).toBeVisible();
  await expect(frame).toHaveAttribute('srcdoc', '');
  await expect(page.frameLocator('iframe.fountain-embed').locator('input')).toHaveCount(0);
  await expect(editor).toBeFocused();
  await expect(editor.locator(':scope > p').last()).toHaveText('Mobile campaign note. Returned.');
  await expect(page.locator('[data-angular-campaign] .demo-output pre')).toContainText('Mobile campaign note. Returned.');
  expect(providerRequests).toBe(1);
  await expect(frame).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  await editor.screenshot({ caret: 'initial', path: info.outputPath('embed-returned-to-authoring.png') });
}
