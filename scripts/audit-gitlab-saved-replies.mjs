import { expect } from '@playwright/test';
import { join } from 'node:path';

const createReply = `mutation($name:String!, $content:String!){
  savedReplyCreate(input:{name:$name, content:$content}){errors savedReply{id}}
}`;
const deleteReply = `mutation($id:UsersSavedReplyID!){
  savedReplyDestroy(input:{id:$id}){errors}
}`;

export async function runGitLabSavedReplyCompatibility({ page, request, project, side, fixture, runId, output, onProgress }) {
  const [input] = fixture.cases;
  const result = { id: input.id, input, status: 'incomplete', facts: {}, pageErrors: [] };
  const facts = result.facts;
  const replyName = 'Release verification ' + runId;
  const templateDraft = input.prefix + input.selected + input.suffix;
  const context = await page.context().browser().newContext({
    storageState: await page.context().storageState(), viewport: { width: 1280, height: 900 }, recordVideo: { dir: output },
  });
  const actor = await context.newPage();
  actor.on('pageerror', error => result.pageErrors.push(error.message));
  function stage(name) {
    result.stage = name;
    onProgress({ side, case: input.id, stage: name });
  }
  async function mutate(query, variables, name) {
    const response = await request('/api/graphql', { query, variables });
    const payload = response.data?.[name];
    if (response.errors?.length || !payload || payload.errors.length) throw new Error('Fixture mutation failed: ' + name);
    return payload;
  }
  let replyId;
  try {
    stage('create-personal-reply');
    replyId = (await mutate(createReply, { name: replyName, content: input.reply }, 'savedReplyCreate')).savedReply.id;
    const issue = await request('/api/v4/projects/' + project.id + '/issues', { title: input.title + ' ' + runId, description: input.description });
    const api = '/api/v4/projects/' + project.id + '/issues/' + issue.iid;
    result.iid = issue.iid;
    await actor.goto(issue.web_url);
    await actor.getByTestId('work-item-edit-form-button').click();
    async function openRich(form) {
      const editor = form.locator(side === 'fountain' ? '.fountain-editor[contenteditable=true]' : '.ProseMirror[contenteditable=true]');
      const toggle = form.getByRole('button', { name: 'Switch to rich text editing', exact: true });
      await expect(editor.or(toggle).first()).toBeVisible({ timeout: 30000 });
      if (!(await editor.isVisible())) await toggle.click();
      await expect(editor).toBeVisible({ timeout: 30000 });
      return editor;
    }
    const description = await openRich(actor.getByTestId('work-item-description-wrapper'));
    const discussion = actor.getByTestId('detail-layout-activity');
    const comment = await openRich(discussion);
    const proof = editor => editor.evaluate(el => ({ native: Boolean(el.closest('[data-fountain-integration="native"]')), className: el.className }));
    result.editorProof = await proof(comment);
    result.descriptionEditorProof = await proof(description);
    await description.locator('p').click();
    await actor.keyboard.press('End');
    await actor.keyboard.insertText(input.draftSuffix);
    await comment.click();
    await actor.keyboard.insertText(templateDraft);
    async function selectPlaceholder() {
      await comment.focus();
      await actor.keyboard.press('Home');
      for (const character of input.prefix) await actor.keyboard.press('ArrowRight');
      for (const character of input.selected) await actor.keyboard.press('Shift+ArrowRight');
      await expect.poll(() => actor.evaluate(() => window.getSelection().toString())).toBe(input.selected);
    }
    const dialog = actor.getByRole('dialog', { name: 'Select a comment template' });
    async function openPicker() {
      await discussion.getByRole('button', { name: 'Insert comment template', exact: true }).click();
      await dialog.getByPlaceholder('Search comment templates').fill(replyName);
      const choice = dialog.getByTestId('comment-templates-list').getByText(replyName, { exact: true });
      await expect(choice).toBeVisible({ timeout: 20000 });
      return choice;
    }
    stage('cancel-template');
    await selectPlaceholder();
    await openPicker();
    await actor.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    facts.cancelledDraft = await comment.innerText();
    stage('replace-selection');
    await selectPlaceholder();
    const choice = await openPicker();
    await dialog.screenshot({ path: join(output, 'saved-reply-picker.png') });
    await choice.click();
    await expect(dialog).toBeHidden();
    await expect(comment).toContainText(input.rendered, { timeout: 15000 });
    const snapshot = async () => ({ text: await comment.innerText(), bold: await comment.locator('strong,b').allTextContents() });
    facts.inserted = await snapshot();
    facts.descriptionDraft = await description.innerText();
    facts.ownsFocus = await comment.evaluate(el => el.contains(document.activeElement));
    await comment.focus();
    await actor.keyboard.press('Control+z');
    facts.undo = await snapshot();
    await actor.keyboard.press('Control+Shift+z');
    facts.redo = await snapshot();
    await actor.screenshot({ path: join(output, 'saved-reply-drafts.png') });
    stage('post-and-reload');
    await discussion.getByRole('button', { name: 'Comment', exact: true }).click();
    const notes = async () => (await request(api + '/notes')).filter(note => !note.system).map(note => note.body);
    await expect.poll(notes, { timeout: 30000 }).not.toEqual([]);
    facts.savedNotes = await notes();
    facts.afterPostDraft = await description.innerText();
    facts.savedDescription = (await request(api)).description;
    await actor.reload();
    const reader = discussion.locator('.note-text').filter({ hasText: input.rendered });
    await expect(reader).toBeVisible({ timeout: 30000 });
    facts.reopened = { text: await reader.innerText(), bold: await reader.locator('strong,b').allTextContents() };
    await reader.screenshot({ path: join(output, 'saved-reply-reader.png') });
    result.status = 'observed';
  } catch (error) {
    result.failure = String(error);
    await actor.screenshot({ path: join(output, 'saved-reply-interrupted.png'), timeout: 5000 }).catch(() => {});
  } finally {
    try {
      if (replyId) await mutate(deleteReply, { id: replyId }, 'savedReplyDestroy');
    } finally {
      await context.close();
    }
  }
  return [result];
}
