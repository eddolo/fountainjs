import { test } from '@playwright/test';
import { docxMathJourney } from '../browser/docx-math-journey';

test('inspect native DOCX equations beside editable source and record viewer disagreements', async ({ page }, info) => {
  await docxMathJourney(page, info);
});
