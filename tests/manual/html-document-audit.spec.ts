import { test } from '@playwright/test';
import { htmlDocumentJourney } from '../browser/html-document-journey';

test('opens a full HTML report through server conversion and edits its retained body', async ({ page }, info) => {
  await htmlDocumentJourney(page, info);
});
