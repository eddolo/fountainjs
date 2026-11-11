import { test } from '@playwright/test';
import { docxResearchWorkflowJourney } from '../browser/docx-research-workflow-journey';

test('a researcher edits the actual Word paper and retains spacing through HTML and native export/reopen', async ({ page }, info) => {
  await docxResearchWorkflowJourney(page, info);
});
