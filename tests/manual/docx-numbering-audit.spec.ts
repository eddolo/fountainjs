import { test } from '@playwright/test';
import { docxNumberingJourney } from '../browser/docx-numbering-journey';

test('compare list numbering in the editor and independent DOCX viewer', async ({ page }, info) => {
  await docxNumberingJourney(page, info);
});
