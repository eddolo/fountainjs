import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test.describe('production issue startup observation', () => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    test(`fresh document ${attempt}`, async ({ page }, info) => {
      const externalFontControl = process.env.FJS_STARTUP_FONT_CONTROL === '1';
      if (externalFontControl) await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
      await page.addInitScript(() => {
        const record = { readyAt: 0, paints: [] as { name: string; startTime: number }[], longTasks: [] as { startTime: number; duration: number }[] };
        (window as any).__startupAudit = record;
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) record.paints.push({ name: entry.name, startTime: entry.startTime });
        }).observe({ type: 'paint', buffered: true });
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) record.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
        }).observe({ type: 'longtask', buffered: true });
        const observer = new MutationObserver(() => {
          if (document.querySelector('[aria-label="Issue description editor"]')) { record.readyAt = performance.now(); observer.disconnect(); }
        });
        observer.observe(document, { childList: true, subtree: true });
      });
      const start = performance.now();
      await page.goto('/issue-editor.html');
      const gotoMs = performance.now() - start;
      const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
      await expect(editor).toBeVisible();
      await editor.locator('p').first().click();
      await page.keyboard.press('End');
      await page.keyboard.type(' Startup check.');
      await expect(editor).toContainText('Startup check.');
      const observation = await page.evaluate(() => ({
        ...((window as any).__startupAudit),
        navigation: performance.getEntriesByType('navigation').map(entry => entry.toJSON()),
        scripts: performance.getEntriesByType('resource').filter(entry => (entry as PerformanceResourceTiming).initiatorType === 'script')
          .map(entry => entry.toJSON()),
      }));
      await page.screenshot({ path: info.outputPath('ready-and-edited.png') });
      await writeFile(info.outputPath('startup.json'), JSON.stringify({ attempt, externalFontControl, gotoMs, observation }, null, 2));
      console.log(JSON.stringify({ attempt, externalFontControl, gotoMs, readyAt: observation.readyAt,
        navigation: observation.navigation.map((row: any) => ({ requestStart: row.requestStart, responseStart: row.responseStart, domInteractive: row.domInteractive, loadEventEnd: row.loadEventEnd })),
        paints: observation.paints, longTasks: observation.longTasks }));
    });
  }
});
