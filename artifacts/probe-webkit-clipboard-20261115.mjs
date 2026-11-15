import { webkit } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser = await webkit.launch({ headless: !process.argv.includes('--desktop') });
try {
  const page = await browser.newPage();
  await page.setContent('<textarea aria-label="source">Native plain text</textarea><textarea aria-label="destination"></textarea>');
  await page.evaluate(() => {
    globalThis.clipboardProbe = [];
    for (const type of ['copy', 'paste']) document.addEventListener(type, event => {
      if (type === 'copy' && globalThis.projection) {
        event.preventDefault();
        event.clipboardData.setData('text/plain', 'Projected plain text');
        if (globalThis.projection !== 'plain') event.clipboardData.setData('text/html', '<p><strong>Projected plain text</strong></p>');
        if (globalThis.projection === 'native') event.clipboardData.setData('application/x-fountainjs+json', '{"version":1}');
      }
      globalThis.clipboardProbe.push({ type, mode: globalThis.projection || 'browser', trusted: event.isTrusted,
        types: [...event.clipboardData.types], plain: event.clipboardData.getData('text/plain'),
        html: event.clipboardData.getData('text/html'), native: event.clipboardData.getData('application/x-fountainjs+json') });
    });
  });
  const results = [];
  for (const mode of [null, 'plain', 'html', 'native']) {
    await page.evaluate(mode => { globalThis.projection = mode; }, mode);
    const source = page.getByRole('textbox', { name: 'source', exact: true });
    const destination = page.getByRole('textbox', { name: 'destination', exact: true });
    await destination.fill(''); await source.selectText(); await page.keyboard.press('Control+c');
    await destination.click(); await page.keyboard.press('Control+v');
    results.push({ mode: mode || 'browser', value: await destination.inputValue() });
  }
  const evidence = { platform: process.platform, desktop: process.argv.includes('--desktop'), version: browser.version(), results,
    events: await page.evaluate(() => globalThis.clipboardProbe) };
  await writeFile(new URL(`./webkit-clipboard-platform-probe-${process.platform}${evidence.desktop ? '-desktop' : ''}-20261115.json`, import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence));
} finally { await browser.close(); }
