import { test } from '@playwright/test';
import { tableColumnSideCases, tableColumnSideJourney } from '../browser/table-column-side-journey';

for (const sample of tableColumnSideCases) {
  test(`inserts table columns on the physical left and right: ${sample.name}`, async ({ page }, info) => {
    await tableColumnSideJourney(page, info, sample);
  });
}
