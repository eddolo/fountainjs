import { expect, test } from '@playwright/test';

for (const [title, mixed] of [
  ['refuses incomplete room definitions and reopens both offline field edits', false],
  ['preserves unowned fields when a directly connected editor writes', true],
] as const) test(title, async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/fixtures/yjs-structured-room.html' + (mixed ? '?mixed' : ''));
  const status = page.getByRole('status');
  await expect(status).toHaveText('Saved room ready.');
  await page.getByRole('button', { name: 'Open with incomplete definitions' }).click();
  await expect(status).toHaveText('Structured attribute definitions do not cover the saved room map.');
  await expect(page.getByRole('textbox')).toHaveCount(0);

  await page.getByRole('button', { name: 'Open both authors' }).click();
  await expect(status).toHaveText(mixed ? 'Grace opened a compatibility copy with fewer field definitions.' : 'Both authors opened the saved room.');
  const ada = page.getByRole('region', { name: 'Ada' });
  const grace = page.getByRole('region', { name: 'Grace' });
  await ada.getByRole('button', { name: 'Add a column' }).click();
  await grace.getByRole('button', { name: 'Use compact layout' }).click();
  await expect(ada.getByRole('textbox')).toContainText('3 columns · Comfortable · light theme');
  await expect(grace.getByRole('textbox')).toContainText('2 columns · Compact · light theme');

  await page.getByRole('button', { name: 'Try an invalid field update' }).click();
  await expect(status).toHaveText('Invalid field rejected. Saved room unchanged at revision 0.');
  await expect(ada.getByRole('textbox')).toContainText('3 columns · Comfortable · light theme');
  await expect(grace.getByRole('textbox')).toContainText('2 columns · Compact · light theme');
  await page.screenshot({ path: info.outputPath('rejected-field.png'), fullPage: true });

  await page.getByRole('button', { name: 'Save both copies and reopen' }).click();
  await expect(status).toHaveText('Saved and reopened at revision 1.');
  await expect(page.getByRole('region', { name: 'Reopened room' }).getByRole('textbox'))
    .toContainText('3 columns · Compact · light theme');
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('reopened-settings.png'), fullPage: true });
});
