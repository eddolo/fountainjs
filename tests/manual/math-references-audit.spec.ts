import { test } from '@playwright/test';
import { mathReferencesJourney } from '../browser/math-references-journey';

test('human labelled-equation journey: read links, reorder, edit, delete, recover and inspect source', async ({ page }, info) => {
  test.setTimeout(90_000);
  await mathReferencesJourney(page, info);
});
