import { test } from '@playwright/test';
import { definitionListJourney } from '../browser/definition-list-journey';

test('edits definition lists and reopens a glossary in a reader', async ({ page }, info) => {
  await definitionListJourney(page, info);
});
