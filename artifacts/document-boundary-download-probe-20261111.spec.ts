import { test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { runDocumentBoundaryRangeJourney } from '../tests/browser/document-boundary-range-journey';

test('diagnoses the unchanged native boundary/download journey', async ({ page }, info) => {
  test.setTimeout(120_000);
  const quiet = process.env.FOUNTAIN_DOWNLOAD_QUIET === '1';
  if (quiet) page.setDefaultTimeout(10_000);
  const records: unknown[] = [];
  page.on('console', message => {
    if (message.text().startsWith('DOWNLOAD_PROBE ')) {
      records.push(JSON.parse(message.text().slice('DOWNLOAD_PROBE '.length)));
    } else if (message.type() === 'error') records.push({ error: message.text() });
  });
  page.on('download', download => records.push({ delivered: download.suggestedFilename(), time: Date.now() }));
  await page.addInitScript(quiet => {
    const data: unknown[] = [];
    Object.assign(globalThis, { downloadProbeInteractions: data });
    const record = (entry: unknown) => {
      data.push(entry);
      if (!quiet) console.debug('DOWNLOAD_PROBE ' + JSON.stringify(entry));
    };
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      const url = create(blob);
      record({ created: url, size: blob instanceof Blob ? blob.size : null, time: Date.now(), activation: navigator.userActivation.isActive });
      return url;
    };
    URL.revokeObjectURL = url => { record({ revoked: url, time: Date.now() }); revoke(url); };
    for (const type of ['pointerdown', 'pointerup', 'click']) document.addEventListener(type, event => {
      const element = event.target instanceof Element ? event.target : null;
      const button = [...document.querySelectorAll('button')].find(node => node.textContent === 'Download Markdown draft');
      // Avoid a forced layout or console round trip in the quiet timing probe.
      const rect = quiet ? undefined : button?.getBoundingClientRect();
      record({ type, target: element?.tagName, label: element?.textContent?.slice(0, 80),
        anchorDownload: element instanceof HTMLAnchorElement ? element.download : null,
        trusted: event.isTrusted, time: Date.now(), scrollY,
        x: event instanceof MouseEvent ? event.clientX : null, y: event instanceof MouseEvent ? event.clientY : null,
        downloadButton: rect && { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        activation: navigator.userActivation.isActive });
    }, true);
  }, quiet);
  try { await runDocumentBoundaryRangeJourney(page, info); }
  finally {
    if (quiet) {
      try {
        records.push(...await page.evaluate(() => (globalThis as unknown as { downloadProbeInteractions: unknown[] }).downloadProbeInteractions));
      } catch (error) { records.push({ diagnosticReadError: String(error) }); }
    }
    await writeFile(info.outputPath('download-interactions.json'), JSON.stringify(records, null, 2));
  }
});
