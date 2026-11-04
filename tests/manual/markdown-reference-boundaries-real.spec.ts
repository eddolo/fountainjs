import { test } from '@playwright/test';
import { runMarkdownReferenceBoundariesJourney } from '../browser/markdown-reference-boundaries-journey';

test('a writer inserts text before a referenced terminal fence and reopens actual exports', async ({ page }, info) => {
  await runMarkdownReferenceBoundariesJourney(page, info);
});
