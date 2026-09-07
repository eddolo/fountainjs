import { test } from '@playwright/test';
import { mathPagesJourney } from '../browser/math-pages-journey';

test('open a research document, build pages, follow equations, edit and rebuild', async ({ page }, info) => {
  await mathPagesJourney(page, info);
});
