import { test } from '@playwright/test';
import { markdownParagraphRecoveryJourney } from '../browser/markdown-paragraph-recovery-journey';

test('recovers paragraph HTML into editable blocks and a reopened reader', async ({ page }, info) => {
  await markdownParagraphRecoveryJourney(page, info);
});
