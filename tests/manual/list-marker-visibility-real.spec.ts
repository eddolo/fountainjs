import { test } from '@playwright/test';
import { listMarkerVisibilityJourney } from '../browser/list-marker-visibility-journey';

test('an empty numbered item visibly paints its marker; independent controls detect missing paint', async ({ page }, info) => {
  await listMarkerVisibilityJourney(page, info);
});
