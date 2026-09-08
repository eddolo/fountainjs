import { devices, test } from '@playwright/test';
import { markdownParagraphRecoveryJourney } from '../browser/markdown-paragraph-recovery-journey';

test.use({ ...devices['Desktop Firefox'], browserName: 'firefox' });

test('records Firefox selection, paste and Markdown recovery without page replacement', async ({ page }, info) => {
  await markdownParagraphRecoveryJourney(page, info);
});
