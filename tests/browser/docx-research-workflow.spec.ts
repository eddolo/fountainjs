import { test } from '@playwright/test';
import { docxResearchWorkflowJourney } from './docx-research-workflow-journey';

// The original manual audit uses a 90-second budget. Preserve its interactions
// and assertions; record each attempt separately, including CI retries.
test.use({ video: 'on', trace: 'on' });
test.setTimeout(90_000);

test('a researcher edits the actual Word paper and retains spacing through HTML and native export/reopen', async ({ page }, info) => {
  await docxResearchWorkflowJourney(page, info);
});
