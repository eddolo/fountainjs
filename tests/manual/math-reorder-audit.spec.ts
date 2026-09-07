import { test } from '@playwright/test';
import { mathReorderJourney } from '../browser/math-reorder-journey';

test('human math journey: move the second formula, edit it in place, undo and export', async ({ page }, info) => {
  await mathReorderJourney(page, info);
});
