import { expect, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

export type VirtualHostControlMode = 'control' | 'release' | 'cancel' | 'blur';

interface FrameSnapshot {
  top: number; left: number; width: number; height: number; clicks: number;
  blocks: number; mounted: number; pendingFrames: number; pointerId?: number;
}
interface FrameAudit {
  snapshot(): FrameSnapshot;
  flushFrame(): { before: FrameSnapshot; after: FrameSnapshot; callbacks: number };
  close(): { pendingFrames: number };
}
declare global { interface Window { virtualFrameAudit: FrameAudit } }

/** Real geometry and pointer input; only application RAF delivery is controlled. */
export async function virtualHostControlJourney(page: Page, info: TestInfo, mode: VirtualHostControlMode) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const virtual = mode !== 'control';
  await page.goto(`/virtual-host-press.html?virtual=${Number(virtual)}`);
  await page.waitForFunction(() => Boolean(window.virtualFrameAudit), { polling: 50 });
  const before = await page.evaluate(() => window.virtualFrameAudit.snapshot());
  if (virtual) expect(before.mounted).toBeLessThan(40);
  else expect(before.mounted).toBe(300);
  await page.screenshot({ path: info.outputPath(`virtual-host-${mode}-before.png`) });
  await page.mouse.move(before.left + before.width / 2, before.top + before.height / 2);
  await page.mouse.down();
  const held = await page.evaluate(() => window.virtualFrameAudit.flushFrame());
  await writeFile(info.outputPath(`virtual-host-${mode}-held.json`), JSON.stringify({ before, held }, null, 2));
  expect(held.after.blocks).toBe(300);
  expect(Math.abs(held.after.top - before.top), 'Measurement must not move a pressed host target').toBeLessThan(1);
  expect(held.after.mounted).toBe(before.mounted);
  if (mode === 'cancel') {
    await page.locator('#export').dispatchEvent('pointercancel', { pointerId: held.after.pointerId, button: 0 });
  } else if (mode === 'blur') {
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  }
  await page.mouse.up();
  const after = await page.evaluate(() => window.virtualFrameAudit.snapshot());
  if (mode === 'release' || mode === 'control') expect(after.clicks, 'The native click must reach Export once').toBe(1);
  if (virtual) {
    const resumed = await page.evaluate(() => window.virtualFrameAudit.flushFrame());
    expect(resumed.callbacks, 'Virtual work must resume after release, cancellation or blur').toBeGreaterThan(0);
    expect(resumed.after.mounted).not.toBe(before.mounted);
    expect(resumed.after.blocks).toBe(300);
    await writeFile(info.outputPath(`virtual-host-${mode}-resumed.json`), JSON.stringify(resumed, null, 2));
  }
  await page.screenshot({ path: info.outputPath(`virtual-host-${mode}-after.png`) });
  expect(await page.evaluate(() => window.virtualFrameAudit.close())).toEqual({ pendingFrames: 0 });
  expect(errors).toEqual([]);
}
