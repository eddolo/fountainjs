import { test } from '@playwright/test';
import { suggestionScrollJourney, suggestionTabJourney } from '../browser/suggestion-navigation-journey';

test('records the active slash option scrolling into view on keyboard wrap', async ({ page }, info) => {
  await suggestionScrollJourney(page, info);
});

test('records Tab leaving an open emoji query with its text intact', async ({ page }, info) => {
  await suggestionTabJourney(page, info);
});
