import { test } from '@playwright/test';
import { webComponentFormJourney } from '../browser/web-component-form-journey';
test('submits resets and disables a native form-associated Web Component', async ({ page }, info) => {
  await webComponentFormJourney(page, info);
});
