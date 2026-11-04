import { test } from '@playwright/test';
import { runVirtualSelectionJourney } from '../browser/virtual-selection-journey';

test('replaces and restores selections across offscreen document content', async ({ page }, info) => {
  await runVirtualSelectionJourney(page, info);
});
