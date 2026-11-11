import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

for (const virtual of [false, true]) test(`host export click survives a measurement frame: virtual=${virtual}`, async ({ page }, info) => {
  await page.goto(`/artifacts/virtual-measurement-frame-20261111.html?virtual=${Number(virtual)}`);
  await page.waitForFunction(() => Boolean((window as any).virtualFrameAudit), { polling: 50 });
  const before = await page.evaluate(() => (window as any).virtualFrameAudit.snapshot());
  await page.screenshot({ path: info.outputPath('before.png') });
  await page.mouse.move(before.left + before.width / 2, before.top + before.height / 2);
  await page.mouse.down();
  const frame = await page.evaluate(() => (window as any).virtualFrameAudit.flushFrame());
  await page.mouse.up();
  const after = await page.evaluate(() => (window as any).virtualFrameAudit.snapshot());
  await writeFile(info.outputPath('measurement-frame.json'), JSON.stringify({ before, frame, after }, null, 2));
  await page.screenshot({ path: info.outputPath('after.png') });
  expect(after.blocks).toBe(300);
  expect(after.clicks, 'A pending virtual measurement must not move the host button out from under an ordinary pointer click').toBe(1);
  expect(Math.abs(after.top - before.top)).toBeLessThan(1);
  await page.evaluate(() => (window as any).virtualFrameAudit.close());
});
