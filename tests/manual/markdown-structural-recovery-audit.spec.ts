import { test } from '@playwright/test';
import { markdownStructuralRecoveryJourney } from '../browser/markdown-structural-recovery-journey';

test('recovers nested Markdown lists and quotes through an editor and reader', async ({ page }, info) => {
  await markdownStructuralRecoveryJourney(page, info);
});
