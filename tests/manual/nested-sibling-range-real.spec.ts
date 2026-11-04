import { test } from '@playwright/test';
import { runNestedSiblingRangeJourney } from '../browser/nested-sibling-range-journey';

test('replaces selected nested sibling blocks and media through native pointer input', async ({ page }, info) => {
  await runNestedSiblingRangeJourney(page, info);
});
