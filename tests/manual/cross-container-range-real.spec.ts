import { test } from '@playwright/test';
import { runCrossContainerAttributesJourney, runCrossContainerRangeJourney } from '../browser/cross-container-range-journey';

test('replaces native selections across quote and list ancestors without leaving selected media', async ({ page }, info) => {
  await runCrossContainerRangeJourney(page, info);
});

test('retains different quote attributes through native replacement and JSON export', async ({ page }, info) => {
  await runCrossContainerAttributesJourney(page, info);
});
