import { test, expect } from '@playwright/test';
import { footnoteClipboardJourney } from '../browser/footnote-clipboard-journey';

// This exercises the OS clipboard, including another application's plain-text
// field. Run through playwright.clipboard-audit.config.ts. WebKit's installed
// ports currently lose custom copy-event formats even in a minimal plain page;
// retain those failing runs rather than substituting injected paste events.
test('keeps copied footnote graphs self-contained through native clipboard input', async ({ page, browserName }, info) => {
  await page.goto('/browser-tests.html');
  await page.waitForFunction(() => Boolean((globalThis as any).fountainBrowserTest?.editor));
  await expect(page.getByRole('textbox', { name: 'Page intent contract editor', exact: true })).toBeVisible();
  await footnoteClipboardJourney(page, info, browserName);
});
