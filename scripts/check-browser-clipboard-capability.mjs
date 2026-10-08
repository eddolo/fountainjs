import { chromium, firefox, webkit, expect } from '@playwright/test';

// Independent diagnostic, NOT a passing Fountain clipboard certification.
// Windows Playwright WebKit has transferred native textarea copies but
// returns empty payloads after copy-event setData/preventDefault, even with
// text/plain alone. Keep this separate from real Safari production evidence.
for (const [engine, type] of Object.entries({ chromium, firefox, webkit })) {
  for (const formats of [null, ['text/plain'], ['text/plain', 'text/html', 'application/x-fountainjs+json']]) {
    for (const replaceSource of [false, true]) {
      // Unique per case: a previous clipboard value cannot masquerade as a
      // successful copy when a browser ignores an event-authored payload.
      const baseline = `Native clipboard baseline ${engine}/${formats?.length ?? 0}/${replaceSource}`;
      const browser = await type.launch();
      try {
        const page = await browser.newPage();
        await page.setContent(`<textarea aria-label="Native source">${baseline}</textarea><textarea aria-label="Native destination"></textarea>`);
        if (formats) await page.evaluate(({ types, baseline }) => {
          document.querySelector('textarea').addEventListener('copy', event => {
            types.forEach(format => event.clipboardData.setData(format, format === 'text/plain'
              ? baseline : format === 'text/html' ? `<strong>${baseline}</strong>` : JSON.stringify({ version: 1, baseline })));
            event.preventDefault();
          });
        }, { types: formats, baseline });
        await page.evaluate(() => document.querySelectorAll('textarea')[1].addEventListener('paste', event => {
          const data = event.clipboardData;
          globalThis.__nativeClipboardDelivery = { types: [...data.types], plain: data.getData('text/plain'), html: data.getData('text/html'), json: data.getData('application/x-fountainjs+json') };
        }));
        await page.getByLabel('Native source').focus();
        await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.press('ControlOrMeta+c');
        if (replaceSource) await page.keyboard.insertText('Temporary replacement');
        await page.getByLabel('Native destination').focus(); await page.keyboard.press('ControlOrMeta+v');
        let transferred = true;
        try { await expect(page.getByLabel('Native destination')).toHaveValue(baseline, { timeout: 1500 }); }
        catch { transferred = false; }
        console.log(JSON.stringify({ engine, platform: process.platform, formats: formats ?? 'native-default', replaceSource, baseline, transferred,
          delivered: await page.evaluate(() => globalThis.__nativeClipboardDelivery ?? null),
          actual: await page.getByLabel('Native destination').inputValue() }));
      } finally { await browser.close(); }
    }
  }
}
