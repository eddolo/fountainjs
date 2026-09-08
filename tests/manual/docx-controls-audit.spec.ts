import { test } from '@playwright/test';
import { docxControlsJourney } from '../browser/docx-controls-journey';

test('imports and edits Word content controls without losing visible content', async ({ page }, info) => {
  await docxControlsJourney(page, info);
});
