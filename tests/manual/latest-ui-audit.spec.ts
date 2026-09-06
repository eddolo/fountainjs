import { expect, test, type Page, type TestInfo } from '@playwright/test';

const pause = (page: Page, milliseconds = 350) => page.waitForTimeout(milliseconds);

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: false }),
    contentType: 'image/png',
  });
}

test('human release journey: writing, AI review, conversation, structured tools, and undo', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await test.step('write a real multi-paragraph release note', async () => {
    await page.goto('/');
    const editor = page.getByRole('textbox', { name: 'Rich text editor' });
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Release audit');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Human-style editing is working.');
    await expect(editor).toContainText('Release audit');
    await expect(editor).toContainText('Human-style editing is working.');
    await editor.getByText('Release audit', { exact: true }).scrollIntoViewIfNeeded();
    await capture(page, testInfo, '01-real-writing');
    await pause(page, 700);
  });

  await test.step('review a streamed text proposal without premature mutation', async () => {
    await page.reload();
    const editor = page.getByRole('textbox', { name: 'Rich text editor' });
    const original = await editor.textContent();
    const firstParagraph = editor.locator(':scope > p').first();
    await firstParagraph.click({ position: { x: 80, y: 12 } });

    const panel = page.locator('.optional-ai');
    await panel.locator(':scope > summary').click();
    await panel.getByRole('button', { name: 'Improve' }).click();
    await expect(panel.locator('.fountain-ai-review__status')).toHaveText('Generating…');
    await expect(panel.getByRole('button', { name: 'Accept change' })).toHaveCount(0);
    expect(await editor.textContent()).toBe(original);
    await capture(page, testInfo, '02-streaming-is-read-only');

    await expect(panel.locator('.fountain-ai-review__status')).toHaveText('Review needed');
    await capture(page, testInfo, '03-review-before-accept');
    await panel.getByRole('button', { name: 'Accept change' }).click();
    await expect(editor).toContainText('Make it unmistakably clear:');
    await expect(editor).toContainText('This is the real npm package');
    await expect(editor).not.toContainText('This is thereal npm package');
    await expect(page.locator('.studio__export pre')).toContainText('the **real npm package**');
    await capture(page, testInfo, '04-accepted-text-proposal');
    await pause(page);
  });

  await test.step('preview a schema-aware structural change, accept it, then undo it', async () => {
    const editor = page.getByRole('textbox', { name: 'Rich text editor' });
    const afterTextProposal = await editor.textContent();
    const tools = page.getByRole('region', { name: 'Schema-aware agent document tools' });

    await tools.getByRole('button', { name: 'Plan structured section' }).click();
    await expect(tools.getByRole('status')).toHaveText('Preview ready. The live document is still unchanged.');
    expect(await editor.textContent()).toBe(afterTextProposal);
    await tools.scrollIntoViewIfNeeded();
    await capture(page, testInfo, '05-structured-preview-is-read-only');
    await pause(page, 700);

    await tools.getByRole('button', { name: 'Accept structured change' }).click();
    await expect(editor).toContainText('Agent-proposed next step');
    await expect(editor).toContainText('This structured section stays outside the document until you accept it.');
    await tools.scrollIntoViewIfNeeded();
    await capture(page, testInfo, '06-structured-change-accepted');
    await pause(page, 700);

    await page.getByRole('button', { name: 'Undo' }).first().click();
    await expect(editor).not.toContainText('Agent-proposed next step');
    expect(await editor.textContent()).toBe(afterTextProposal);
    await tools.scrollIntoViewIfNeeded();
    await capture(page, testInfo, '07-structured-change-undone');
    await pause(page, 700);
  });

  await test.step('use a reusable prompt and continue a real multi-turn conversation', async () => {
    const conversation = page.getByRole('region', { name: 'Multi-turn conversation' });
    await conversation.getByRole('button', { name: 'Use prompt' }).click();
    await conversation.getByRole('button', { name: 'Send' }).click();
    await expect(conversation.getByText('I can keep this discussion across turns.', { exact: false })).toBeVisible();
    await expect(conversation.getByText('Ready', { exact: true })).toBeVisible();
    await conversation.scrollIntoViewIfNeeded();
    await capture(page, testInfo, '08-conversation-first-turn');
    await pause(page, 500);

    await conversation.getByRole('textbox', { name: 'Message' }).fill('What context did you keep?');
    await conversation.getByRole('button', { name: 'Send' }).click();
    await expect(conversation.getByText('This is follow-up 2.', { exact: false })).toBeVisible();
    await expect(conversation.locator('.fountain-ai-conversation__messages article')).toHaveCount(4);
    await conversation.scrollIntoViewIfNeeded();
    await capture(page, testInfo, '09-conversation-follow-up');
    await pause(page, 500);
  });

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
