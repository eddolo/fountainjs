import { test } from '@playwright/test';
import { docxGlossaryJourney } from '../browser/docx-glossary-journey';

test('edits and reopens a Word glossary with term and description roles', async ({ page }, info) => {
  await docxGlossaryJourney(page, info);
});
