import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, firefox, webkit, expect } from '@playwright/test';

// Independent browser/driver diagnostic, not Fountain editing certification.
// Distinguish sandboxed srcDoc navigation/capture from the public workshop's
// real input journey. Never change sandbox/CSP or hide an unresolved capture.
const output = path.resolve(process.argv[2] ?? 'artifacts/reader-frame-lifecycle-diagnostic');
await mkdir(output, { recursive: true });
const report = [];
const source = text => `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{font:16px/1.6 Arial;padding:20px}</style><p>Release <strong>notes</strong> <!-- provenance --> remain editable.</p><p>${text}</p>`;
for (const [engine, browserType] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await browserType.launch();
  try {
    for (const policy of ['reuse', 'replace']) {
      const directory = path.join(output, `${engine}-${policy}`);
      await mkdir(directory, { recursive: true });
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: directory } });
      await context.tracing.start({ screenshots: true, snapshots: true });
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      const events = [];
      const errors = [];
      for (const event of ['frameattached', 'framenavigated', 'framedetached']) {
        page.on(event, frame => events.push({ event, name: frame.name(), url: frame.url() }));
      }
      page.on('pageerror', error => errors.push(error.message));
      let failure;
      try {
        await page.setContent('<style>body{margin:0}header{position:sticky;top:0;height:70px;background:#eee}section{margin-top:1500px;padding:24px;max-width:900px}iframe{display:block;width:100%;height:220px;box-sizing:border-box}textarea{width:100%;box-sizing:border-box}</style><header>Reader lifecycle diagnostic</header><section aria-label="Reader workshop"><h2>Saved reader snapshot</h2><textarea aria-label="Comment data">provenance</textarea><div id="reader"></div></section>');
        const workshop = page.getByRole('region', { name: 'Reader workshop' });
        const reader = workshop.frameLocator('iframe[title="Reader snapshot"]');
        for (const [index, text] of ['Review the rollout.', 'Review the rollout. Reviewed.', 'Review the rollout.', 'Review the rollout.'].entries()) {
          const frameSource = source(text);
          await page.evaluate(({ frameSource, policy }) => {
            const container = document.querySelector('#reader');
            let frame = container.querySelector('iframe');
            if (!frame || (policy === 'replace' && frame.getAttribute('srcdoc') !== frameSource)) {
              frame = document.createElement('iframe');
              frame.title = 'Reader snapshot';
              frame.setAttribute('sandbox', '');
              frame.srcdoc = frameSource;
              container.replaceChildren(frame);
            } else if (frame.getAttribute('srcdoc') !== frameSource) frame.srcdoc = frameSource;
          }, { frameSource, policy });
          await expect(reader.locator('body')).toContainText(text);
          assert.equal(await workshop.locator('iframe').getAttribute('sandbox'), '');
          await workshop.locator('iframe').scrollIntoViewIfNeeded();
          await reader.locator('body').screenshot({ path: path.join(directory, `saved-${index}.png`) });
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await workshop.getByLabel('Comment data').scrollIntoViewIfNeeded();
        await workshop.screenshot({ path: path.join(directory, 'author-mobile.png') });
        await workshop.locator('iframe').scrollIntoViewIfNeeded();
        await expect(reader.locator('body')).toContainText('Review the rollout.');
        await reader.locator('body').screenshot({ path: path.join(directory, 'reader-mobile.png') });
        assert.deepEqual(errors, []);
      } catch (error) {
        failure = String(error.stack ?? error);
        await page.screenshot({ path: path.join(directory, 'failure.png') }).catch(() => {});
      } finally {
        const frames = page.frames().map(frame => ({ name: frame.name(), url: frame.url(), detached: frame.isDetached() }));
        await context.tracing.stop({ path: path.join(directory, 'trace.zip') });
        await context.close();
        const result = { engine, policy, platform: process.platform, passed: !failure, failure, errors, events, frames };
        report.push(result);
        console.log(JSON.stringify(result));
        await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
      }
    }
  } finally { await browser.close(); }
}
if (report.some(result => !result.passed)) process.exitCode = 1;
