import { expect, test } from '@playwright/test';

test('posts only the submitted comment while preserving a newer draft and target', async ({ page }, info) => {
  await page.goto('/comment-send-test.html');
  const panel = page.getByLabel('Shared review');
  await panel.getByRole('button', { name: 'New comment', exact: true }).click();
  const input = panel.getByRole('textbox', { name: 'New comment', exact: true });
  const target = panel.getByLabel('Comment target');
  const send = panel.getByRole('button', { name: /Create thread|Posting/ });
  const accept = page.getByRole('button', { name: 'Accept pending comment' });
  await target.selectOption('document');
  await input.fill('Original outgoing comment');
  await send.click();
  await expect(page.getByText('Requests: 1', { exact: true })).toBeVisible();
  await input.fill('Newer comment draft');
  await target.selectOption('block');
  await accept.click();
  const original = panel.getByRole('region', { name: 'Thread by Ada' }).filter({ hasText: 'Original outgoing comment' });
  await expect(original.getByRole('button', { name: 'document Whole document' })).toBeVisible();
  await expect(input).toHaveValue('Newer comment draft');
  await expect(target).toHaveValue('block');
  await expect(send).toBeEnabled();
  await panel.screenshot({ path: info.outputPath('newer-comment-draft-retained.png') });

  await send.click();
  await expect(send).toBeDisabled();
  await input.evaluate((element: HTMLTextAreaElement) => element.form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await expect(page.getByText('Requests: 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reject pending comment' }).click();
  await expect(panel.getByRole('alert')).toContainText('The provider declined this comment.');
  await expect(input).toHaveValue('Newer comment draft');
  await expect(target).toHaveValue('block');
  await send.click();
  await accept.click();
  const newer = panel.getByRole('region', { name: 'Thread by Ada' }).filter({ hasText: 'Newer comment draft' });
  await expect(newer.getByRole('button', { name: /block Review this paragraph/ })).toBeVisible();
  await expect(input).toHaveCount(0);
  await expect(page.getByText('Requests: 3', { exact: true })).toBeVisible();
});
