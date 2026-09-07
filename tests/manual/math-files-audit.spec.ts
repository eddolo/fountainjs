import { test } from '@playwright/test';
import { mathFilesJourney } from '../browser/math-files-journey';
test('save equations, reload, reopen, inspect references and download source', async ({ page }, info) => {
  await mathFilesJourney(page, info);
});
