import { chromium, firefox, webkit, expect } from '@playwright/test';

// Independent diagnostic, NOT a passing Fountain clipboard certification.
// Compare native textarea and contenteditable behavior independently. Observe
// both paste and beforeinput, plus the resulting DOM: missing event HTML alone
// does not establish that the browser's native rich insertion also lost it.
// Windows Playwright WebKit has transferred native default copies but
// returns empty payloads after copy-event setData/preventDefault, even with
// text/plain alone. Keep this separate from real Safari production evidence.
const headless = process.env.FOUNTAIN_CLIPBOARD_HEADED !== '1';
const selectedEngine = process.env.FOUNTAIN_CLIPBOARD_ENGINE;
if (selectedEngine && !['chromium', 'firefox', 'webkit'].includes(selectedEngine)) throw new Error('Unknown clipboard diagnostic engine.');
for (const [engine, type] of Object.entries({ chromium, firefox, webkit })) {
  if (selectedEngine && engine !== selectedEngine) continue;
  for (const formats of [null, ['text/plain'], ['text/plain', 'text/html', 'application/x-fountainjs+json']]) {
    for (const replaceSource of [false, true]) {
      for (const surface of ['text', 'rich']) {
        // Unique per case: a previous clipboard value cannot masquerade as a
        // successful copy when a browser ignores an event-authored payload.
        const baseline = `Native clipboard baseline ${engine}/${formats?.length ?? 0}/${replaceSource}/${surface}/${headless ? 'headless' : 'headed'}`;
        const browser = await type.launch({ headless });
        try {
          const page = await browser.newPage();
          const control = (label, content) => surface === 'rich'
            ? `<div contenteditable="true" role="textbox" aria-multiline="true" aria-label="${label}">${content}</div>`
            : `<textarea aria-label="${label}">${content}</textarea>`;
          await page.setContent(control('Native source', surface === 'rich' ? `<strong>${baseline}</strong>` : baseline) + control('Native destination', ''));
          if (formats) await page.evaluate(({ types, baseline }) => {
            document.querySelector('[aria-label="Native source"]').addEventListener('copy', event => {
              types.forEach(format => event.clipboardData.setData(format, format === 'text/plain'
                ? baseline : format === 'text/html' ? `<strong>${baseline}</strong>` : JSON.stringify({ version: 1, baseline })));
              event.preventDefault();
            });
          }, { types: formats, baseline });
          await page.evaluate(() => {
            const destination = document.querySelector('[aria-label="Native destination"]');
            destination.addEventListener('paste', event => {
              const data = event.clipboardData;
              globalThis.__nativeClipboardDelivery = { trusted: event.isTrusted, types: [...data.types], plain: data.getData('text/plain'), html: data.getData('text/html'), json: data.getData('application/x-fountainjs+json') };
            });
            destination.addEventListener('beforeinput', event => {
              if (event.inputType !== 'insertFromPaste') return;
              const data = event.dataTransfer;
              globalThis.__nativeClipboardBeforeInput = { trusted: event.isTrusted, inputType: event.inputType, types: data ? [...data.types] : [], plain: data?.getData('text/plain') ?? '', html: data?.getData('text/html') ?? '', json: data?.getData('application/x-fountainjs+json') ?? '' };
            });
          });
          await page.getByLabel('Native source').focus();
          await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.press('ControlOrMeta+c');
          if (replaceSource) await page.keyboard.insertText('Temporary replacement');
          await page.getByLabel('Native destination').focus(); await page.keyboard.press('ControlOrMeta+v');
          let transferred = true;
          const destination = page.getByLabel('Native destination');
          try {
            if (surface === 'rich') await expect(destination).toHaveText(baseline, { timeout: 1500 });
            else await expect(destination).toHaveValue(baseline, { timeout: 1500 });
          }
          catch { transferred = false; }
          console.log(JSON.stringify({ engine, platform: process.platform, headless, surface, formats: formats ?? 'native-default', replaceSource, baseline, transferred,
            delivered: await page.evaluate(() => globalThis.__nativeClipboardDelivery ?? null),
            beforeInput: await page.evaluate(() => globalThis.__nativeClipboardBeforeInput ?? null),
            actual: surface === 'rich' ? await destination.textContent() : await destination.inputValue(),
            richDOM: surface === 'rich' ? await destination.innerHTML() : null,
            nativeRichFormatting: surface === 'rich' ? await destination.evaluate(element => {
              const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
              const first = walker.nextNode();
              return first ? Number(getComputedStyle(first.parentElement).fontWeight) >= 600 : false;
            }) : null,
          }));
        } finally { await browser.close(); }
      }
    }
  }
}
