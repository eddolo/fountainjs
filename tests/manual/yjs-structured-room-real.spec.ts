import { expect, test } from '@playwright/test';

for (const [title, query] of [
  ['refuses incomplete room definitions and reopens both offline field edits', ''],
  ['preserves unowned fields when a directly connected editor writes', '?mixed'],
  ['requires definitions for a custom named saved room map', '?custom'],
] as const) test(title, async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/fixtures/yjs-structured-room.html' + query);
  const status = page.getByRole('status');
  await expect(status).toHaveText('Saved room ready.');
  await page.getByRole('button', { name: 'Restart host without field definitions' }).click();
  await expect(status).toHaveText('Room admission requires definitions for the saved structured attribute map.');
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('host-missing-fields.png'), fullPage: true });
  await page.getByRole('button', { name: 'Open without field definitions' }).click();
  await expect(status).toHaveText('Room opening requires definitions for the saved structured attribute map.');
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open with incomplete definitions' }).click();
  await expect(status).toHaveText('Structured attribute definitions do not cover the saved room map.');
  await expect(page.getByRole('textbox')).toHaveCount(0);

  await page.getByRole('button', { name: 'Open both authors' }).click();
  await expect(status).toHaveText(query === '?mixed' ? 'Grace opened a compatibility copy with fewer field definitions.' : 'Both authors opened the saved room.');
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
  const mounted = await ada.getByRole('textbox').elementHandle();
  await page.getByRole('button', { name: 'Load the saved revision in Ada’s editor' }).click();
  await expect(status).toHaveText('Ada loaded saved revision 1 in the same editor.');
  await expect(ada.getByRole('textbox')).toContainText('3 columns · Compact · light theme');
  expect(await mounted.evaluate(element => element === document.querySelector('#ada [role="textbox"]'))).toBe(true);
  await mounted.dispose();
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('reopened-settings.png'), fullPage: true });
});
