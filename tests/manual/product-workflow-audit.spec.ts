import { test } from '@playwright/test';
import { productWorkflowJourney } from '../browser/product-workflow-journey';

test('discover and use issue and task product workflows', async ({ page }, info) => {
  await productWorkflowJourney(page, info);
});
