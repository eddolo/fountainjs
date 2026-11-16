import { expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

async function editorIn(form, report, phase) {
  const switcher = form.getByRole('button', { name: 'Switch to rich text editing', exact: true });
  await expect(async () => expect(await switcher.count() > 0 || await form.locator('[data-fountain-integration="native"]').count() > 0).toBe(true)).toPass();
  if (await switcher.isVisible()) await switcher.click();
  const native = form.locator('[data-fountain-integration="native"]');
  await expect(native).toBeVisible();
  await expect(async () => expect(await native.locator('[contenteditable="true"]').count() > 0 || await native.getByTestId('content-editor-error').count() > 0).toBe(true)).toPass();
  const state = await native.evaluate(element => {
    const component = element.__vue__ ?? element.__vueParentComponent?.proxy;
    return { error: element.getAttribute('data-fountain-error'), suggestions: component?.codeSuggestionsConfig };
  });
  (report.reviewContexts ??= []).push({ phase, ...state });
  await expect(native.getByTestId('content-editor-error')).toHaveCount(0);
  const editor = native.locator('.fountain-editor[contenteditable="true"]');
  await expect(editor).toBeVisible();
  return { native, editor };
}

export async function auditNativeReview({ page, api, project, report, output }) {
  const mr = report.workflows.mergeRequest;
  const base = `/projects/${project.id}/merge_requests/${mr.iid}`;
  await page.goto(mr.url);
  const composer = page.getByTestId('comment-form');
  const { native, editor } = await editorIn(composer, report, 'new-thread');
  const initial = 'Fountain review: verify migration before release.';
  await editor.click(); await page.keyboard.insertText(initial);
  await page.keyboard.press('Home'); await page.keyboard.press('Shift+End');
  await native.getByTestId('formatting-toolbar').getByRole('button', { name: 'Bold', exact: true }).click();
  await composer.getByTestId('comment-button').locator('button[aria-haspopup="listbox"]').click();
  await page.getByRole('option', { name: /^Start thread/ }).click();
  await composer.getByRole('button', { name: 'Start thread', exact: true }).click();
  await expect(editor).toHaveText('');
  let discussion;
  await expect.poll(async () => {
    discussion = (await api('GET', `${base}/discussions`)).find(value => value.notes.some(note => note.body.includes(initial)));
    return Boolean(discussion);
  }).toBe(true);
  const first = discussion.notes.find(note => note.body.includes(initial));
  expect(first.body).toBe(`**${initial}**`); expect(first.resolvable).toBe(true);
  report.review = { discussionId: discussion.id, noteId: first.id, initial: first.body, phases: [] };
  const thread = page.locator(`[data-discussion-id="${discussion.id}"]`);
  await expect(thread.getByText(initial, { exact: true })).toBeVisible();
  await thread.getByRole('button', { name: /^Edit comment, @root(?::|$)/ }).click();
  const editForm = thread.locator('form.edit-note');
  const edit = await editorIn(editForm, report, 'edit-thread');
  await editForm.screenshot({ path: fileURLToPath(new URL('review-edit-form.png', output)) });
  const edited = 'Fountain review: migration verified; please check rollback.';
  await edit.editor.click(); await page.keyboard.press('Control+a'); await page.keyboard.insertText(edited);
  await editForm.getByTestId('reply-comment-button').click();
  await expect(editForm).toHaveCount(0);
  const savedNote = await api('GET', `${base}/notes/${first.id}`);
  expect(savedNote.body).toContain(edited); expect(savedNote.body).not.toContain(initial);
  report.review.edited = savedNote.body;
  await expect(thread.getByText(edited, { exact: true })).toBeVisible();
  await thread.getByTestId('discussion-reply-tab').click();
  const replyForm = thread.locator('form.edit-note');
  const reply = await editorIn(replyForm, report, 'reply-thread');
  await replyForm.screenshot({ path: fileURLToPath(new URL('review-reply-form.png', output)) });
  const response = 'Fountain reply: rollback checked against the release plan.';
  await reply.editor.click(); await page.keyboard.insertText(response);
  const directReply = replyForm.getByTestId('comment-now-button');
  if (await directReply.isVisible()) await directReply.click();
  else await replyForm.getByTestId('reply-comment-button').click();
  // GitLab briefly shows the optimistic reader note beside the submitting form.
  await expect(replyForm).toHaveCount(0);
  await expect(thread.getByText(response, { exact: true })).toBeVisible();
  const saved = await api('GET', `${base}/discussions/${discussion.id}`);
  expect(saved.notes).toHaveLength(2);
  report.review.replyId = saved.notes.find(note => note.body.includes(response)).id;
  report.review.reply = response;
  await thread.getByTestId('resolve-discussion-button').click();
  await expect.poll(async () => (await api('GET', `${base}/discussions/${discussion.id}`)).notes.every(note => note.resolved)).toBe(true);
  await page.screenshot({ path: fileURLToPath(new URL('review-thread-resolved.png', output)), fullPage: true });
  report.checks.push('Real MR thread creation, immediate rich edit, reply and resolution persist through normal GitLab controls and authenticated API verification');
  await assertSavedNativeReview({ page, api, project, report, output, phase: 'reopened' });
}

export async function assertSavedNativeReview({ page, api, project, report, output, phase }) {
  const { review, workflows } = report;
  const base = `/projects/${project.id}/merge_requests/${workflows.mergeRequest.iid}`;
  const thread = await api('GET', `${base}/discussions/${review.discussionId}`);
  expect(thread.notes).toHaveLength(2);
  expect(thread.notes.find(note => note.id === review.noteId).body).toBe(review.edited);
  expect(thread.notes.find(note => note.id === review.replyId).body).toBe(review.reply);
  expect(thread.notes.every(note => note.resolved)).toBe(true);
  await page.goto(workflows.mergeRequest.url);
  const readerThread = page.locator(`[data-discussion-id="${review.discussionId}"]`);
  await expect(readerThread).toHaveAttribute('data-discussion-resolved', 'true');
  await readerThread.scrollIntoViewIfNeeded();
  await expect(readerThread.getByText(review.edited, { exact: true })).toBeVisible();
  await readerThread.screenshot({ path: fileURLToPath(new URL(`review-thread-${phase}.png`, output)) });
  review.phases.push(phase);
  report.checks.push(`Actual MR thread retains edited text, reply and resolved state (${phase})`);
}
