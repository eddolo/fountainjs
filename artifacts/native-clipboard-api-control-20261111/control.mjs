// Independent browser control: no Fountain imports. Run after installing Playwright.
import { createServer } from 'node:http';
import { chromium, firefox, webkit } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const sample = 'Independent clipboard control';
const html = `<!doctype html><button id="copy">Copy native</button><textarea id="target" aria-label="Native receiver"></textarea><pre id="status"></pre><script>
window.record={state:'ready'};document.querySelector('#copy').onclick=async()=>{
record={state:'pending',focus:document.hasFocus(),activation:navigator.userActivation?.isActive};
try{await navigator.clipboard.writeText('Independent clipboard control');record.state='success'}
catch(e){record.state='failed';record.error=e.name+': '+e.message}
document.querySelector('#status').textContent=JSON.stringify(record)};
</script>`;
const server = createServer((_request, response) => { response.writeHead(200, { 'content-type': 'text/html' }); response.end(html); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const results = [];
try {
  for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
    const browser = await engine.launch({ headless: process.env.FOUNTAIN_CONTROL_HEADED !== '1' });
    try {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.getByRole('button', { name: 'Copy native' }).click();
      await page.waitForFunction(() => window.record.state !== 'pending', undefined, { timeout: 3000 }).catch(() => {});
      const record = await page.evaluate(() => window.record);
      let received = '';
      if (record.state === 'success') {
        const receiver = page.getByRole('textbox', { name: 'Native receiver' });
        await receiver.focus(); await receiver.press('ControlOrMeta+v');
        await page.waitForFunction(() => document.querySelector('#target').value.length > 0, undefined, { timeout: 1500 }).catch(() => {});
        received = await receiver.inputValue();
        // Do not retain unrelated clipboard text if a platform did not write.
        if (received !== sample) await receiver.fill('');
      }
      results.push({ name, record, receivedMatchesControl: received === sample, receivedLength: received.length });
      await page.screenshot({ path: `${root}/${name}.png` });
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
await writeFile(`${root}/observations.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
