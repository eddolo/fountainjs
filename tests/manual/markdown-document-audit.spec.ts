import { test } from '@playwright/test';
import { markdownDocumentJourney } from '../browser/markdown-document-journey';
test('converts document-wide HTML scopes with source edit undo and explicit layout differences', async ({ page }, info) => {
  await markdownDocumentJourney(page, info);
});
