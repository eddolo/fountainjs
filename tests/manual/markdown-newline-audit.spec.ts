import { test } from '@playwright/test';
import { markdownNewlineJourney } from '../browser/markdown-newline-journey';

test('incident narrative: literal lines survive edits, history and draft handoff', async ({ page }, info) => {
  await markdownNewlineJourney(page, info);
});
