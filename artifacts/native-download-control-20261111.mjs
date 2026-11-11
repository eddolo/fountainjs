import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

// Independent native control: no Fountain code, same origin and Blob-link flow.
const interval = Number(process.argv.find(arg => arg.startsWith('--interval-ms='))?.split('=')[1] ?? 0);
if (!Number.isFinite(interval) || interval < 0) throw new Error('Invalid diagnostic interval');
const output = `artifacts/native-download-control-20261111${interval ? '-paced' : ''}`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const records = [];
try {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.route('http://127.0.0.1:4173/native-download-control.html', route => route.fulfill({
    contentType: 'text/html', body: `<!doctype html><button>Download</button><script>
      let count = 0;
      document.querySelector('button').onclick = () => {
        const url = URL.createObjectURL(new Blob(['Native download ' + (++count)], {type:'text/markdown;charset=utf-8'}));
        const link = document.createElement('a'); link.href = url; link.download = 'control.md'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
    </script>`,
  }));
  await page.goto('http://127.0.0.1:4173/native-download-control.html');
  for (let index = 1; index <= 24; index++) {
    if (index > 1 && interval) await new Promise(resolve => setTimeout(resolve, interval));
    const pending = page.waitForEvent('download', { timeout: 5000 });
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    const download = await pending;
    const path = `${output}/${String(index).padStart(2, '0')}.md`;
    await download.saveAs(path);
    assert.equal(await readFile(path, 'utf8'), `Native download ${index}`);
    records.push({ index, delivered: true, time: Date.now() });
  }
  console.log('24 independent native Blob-link downloads passed with 1-second revocation.');
} catch (error) {
  records.push({ failedAt: records.length + 1, error: String(error) });
  process.exitCode = 1;
} finally {
  await writeFile(`${output}/observations.json`, JSON.stringify(records, null, 2));
  await browser.close();
}
