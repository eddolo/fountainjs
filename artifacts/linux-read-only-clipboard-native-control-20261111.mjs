import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox, webkit } from '@playwright/test';

const expected = 'Independent read-only control.';
const html = `<!doctype html><title>Independent clipboard control</title>
<div id="source" contenteditable="false" tabindex="0">${expected}</div>
<label>Receiver<textarea id="receiver"></textarea></label><script>
const source = document.querySelector('#source'); window.observations = [];
source.addEventListener('pointerdown', () => source.focus());
source.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
    event.preventDefault(); const range = document.createRange(); range.selectNodeContents(source);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  }
});
source.addEventListener('copy', event => {
  event.clipboardData.setData('text/plain', source.textContent);
  event.clipboardData.setData('text/html', '<p>' + source.textContent + '</p>');
  event.preventDefault(); observations.push({ type:'copy', length:event.clipboardData.getData('text/plain').length });
});
document.querySelector('#receiver').addEventListener('paste', event => observations.push({
  type:'paste', length:event.clipboardData.getData('text/plain').length, types:[...event.clipboardData.types]
}));
</script>`;
const directory = new URL('./linux-read-only-clipboard-native-control-20261111/', import.meta.url);
await mkdir(directory, { recursive: true });
const server = createServer((_request, response) => { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
try {
  const results = [];
  for (const [engine, browserType] of Object.entries({ webkit })) {
    const browser = await browserType.launch({ headless: process.env.FOUNTAIN_CONTROL_HEADED !== '1' });
    try {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${address.port}`);
      await page.locator('#source').click();
      await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.press('ControlOrMeta+c');
      await page.locator('#receiver').focus(); await page.keyboard.press('ControlOrMeta+v');
      const value = await page.locator('#receiver').inputValue();
      results.push({ engine, matches: value === expected, expectedLength: expected.length, receivedLength: value.length,
        observations: await page.evaluate(() => window.observations) });
      if (value && value !== expected) await page.locator('#receiver').fill('[Unexpected content masked]');
      await page.screenshot({ path: new URL(`${engine}.png`, directory).pathname.replace(/^\/([A-Z]:)/, '$1') });
    } finally { await browser.close(); }
  }
  await writeFile(new URL('results.json', directory), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await new Promise(resolve => server.close(resolve)); }

