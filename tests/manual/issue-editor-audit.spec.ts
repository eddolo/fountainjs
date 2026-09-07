import { test } from '@playwright/test';
import { issueEditorJourney } from '../browser/issue-editor-journey';

test('writes, previews, downloads and reopens an issue without rewriting untouched Markdown', async ({ page }, info) => {
  await issueEditorJourney(page, info);
});
