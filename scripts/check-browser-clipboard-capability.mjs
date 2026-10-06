import { chromium, firefox, webkit, expect } from '@playwright/test';

// Independent diagnostic, NOT a passing Fountain clipboard certification.
// Windows Playwright WebKit currently transfers native textarea copies but
// returns empty payloads after copy-event setData/preventDefault, even with
// text/plain alone. Keep this separate from real Safari production evidence.
for (const [engine, type] of Object.entries({ chromium, firefox, webkit })) {
  for (const formats of [null, ['text/plain'], ['text/plain', 'text/html', 'application/x-fountainjs+json']]) {
    const browser = await type.launch();
    try {
      const page = await browser.newPage();
      await page.setContent('<textarea aria-label="Native source">Native clipboard baseline</textarea><textarea aria-label="Native destination"></textarea>');
      if (formats) await page.evaluate(types => {
        document.querySelector('textarea').addEventListener('copy', event => {
          types.forEach(format => event.clipboardData.setData(format, format === 'text/plain'
            ? 'Native clipboard baseline' : format === 'text/html' ? '<strong>Native clipboard baseline</strong>' : '{"version":1}'));
          event.preventDefault();
        });
      }, formats);
      await page.getByLabel('Native source').focus();
      await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.press('ControlOrMeta+c');
      await page.getByLabel('Native destination').focus(); await page.keyboard.press('ControlOrMeta+v');
      let transferred = true;
      try { await expect(page.getByLabel('Native destination')).toHaveValue('Native clipboard baseline', { timeout: 1500 }); }
      catch { transferred = false; }
      console.log(JSON.stringify({ engine, platform: process.platform, formats: formats ?? 'native-default', transferred,
        actual: await page.getByLabel('Native destination').inputValue() }));
    } finally { await browser.close(); }
  }
}
