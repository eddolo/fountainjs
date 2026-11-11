import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
const records = [];
try {
  for (const trace of [false, true]) {
    const context = await browser.newContext();
    if (trace) await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const page = await context.newPage();
    let phase = 'setup';
    const errors = [];
    page.on('console', message => {
      if (message.type() === 'error') errors.push({ phase, text: message.text(), location: message.location() });
    });
    phase = 'mount static sandboxed frames';
    await page.setContent('<main><iframe title="Empty static frame" sandbox=""></iframe><iframe title="Static reader" sandbox=""></iframe></main>');
    await page.waitForTimeout(200);
    phase = 'assign script-free srcdoc';
    await page.locator('iframe').nth(1).evaluate(frame => {
      frame.srcdoc = '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"></head><body><p>Static reader text.</p></body></html>';
    });
    await page.frameLocator('iframe[title="Static reader"]').getByText('Static reader text.').waitFor();
    await page.waitForTimeout(200);
    phase = 'capture';
    await page.screenshot({ path: `artifacts/sandbox-static-trace-${trace}-20261111.png` });
    const frames = await page.locator('iframe').evaluateAll(frames => frames.map(frame => ({
      sandbox: frame.getAttribute('sandbox'), srcdoc: frame.getAttribute('srcdoc'),
    })));
    records.push({ trace, errors, frames });
    if (trace) await context.tracing.stop({ path: 'artifacts/sandbox-static-trace-20261111.zip' });
    await context.close();
  }
} finally { await browser.close(); }
await writeFile('artifacts/sandbox-tracing-control-20261111.json', `${JSON.stringify(records, null, 2)}\n`);
console.log(JSON.stringify(records, null, 2));
