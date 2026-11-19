import { expect } from '@playwright/test';
import { join } from 'node:path';

export async function runGitLabComposerCompatibility(options) {
  const results = [];
  for (const input of options.fixture.cases) results.push(await runCase(options, input));
  return results;
}

async function runCase({ side, runId, page, project, request, output, onProgress }, input) {
  const result = { id: input.id, input, status: 'incomplete', stage: 'setup', facts: {} };
  const context = await page.context().browser().newContext({
    storageState: await page.context().storageState(), viewport: { width: 1280, height: 900 },
    locale: 'en-US', timezoneId: 'UTC', recordVideo: { dir: output },
  });
  const actor = await context.newPage();
  const screenshot = name => join(output, input.id + '-' + name + '.png');
  async function paragraphs(editor, stage) {
    const receipt = await editor.evaluate(root => ({ html: root.innerHTML, paragraphs: [...root.querySelectorAll('p')].map(p => p.textContent) }));
    (result.richSnapshots ??= {})[stage] = receipt;
    return receipt.paragraphs;
  }
  actor.on('pageerror', error => (result.pageErrors ??= []).push(error.message));
  function stage(name) {
    result.stage = name;
    onProgress({ side, case: input.id, stage: name });
  }
  try {
    const issue = await request('/api/v4/projects/' + project.id + '/issues', { title: input.title + ' ' + runId, description: input.description });
    result.iid = issue.iid;
    const api = '/api/v4/projects/' + project.id + '/issues/' + issue.iid;
    const savedNotes = async () => (await request(api + '/notes')).filter(note => !note.system).map(note => note.body);
    await actor.goto(issue.web_url);
    const descForm = actor.getByTestId('work-item-description-wrapper');
    const activity = actor.getByTestId('detail-layout-activity');
    const selector = side === 'original' ? '.ProseMirror[contenteditable="true"]' : '.fountain-editor[contenteditable="true"]';
    const desc = descForm.locator(selector);
    const comment = activity.locator(selector);
    const richToggle = form => form.getByRole('button', { name: 'Switch to rich text editing', exact: true });
    async function openRich(form, editor) {
      const toggle = richToggle(form);
      await expect(editor.or(toggle).first()).toBeVisible({ timeout: 30000 });
      if (!(await editor.isVisible())) await toggle.click();
      await expect(editor).toBeVisible({ timeout: 30000 });
    }
    const proof = editor => editor.evaluate(el => ({ native: !!el.closest('[data-fountain-integration="native"]'), className: el.className }));
    stage('open-both-editors');
    await expect(actor.locator('.js-work-item-description')).toHaveText(input.description, { timeout: 30000 });
    await actor.getByTestId('work-item-edit-form-button').click();
    await openRich(descForm, desc);
    await expect(desc).toHaveText(input.description);
    await openRich(activity, comment);
    result.editorProof = await proof(desc);
    result.commentEditorProof = await proof(comment);
    stage('alternate-editors');
    await desc.locator('p').click();
    await actor.keyboard.press('End');
    await actor.keyboard.insertText(input.suffix);
    await comment.click();
    await activity.getByRole('button', { name: /^Bold\b/i }).click();
    await actor.keyboard.insertText(input.comment);
    await actor.keyboard.press('Control+b');
    await expect(comment).toContainText(input.comment);
    result.facts.boldComment = await comment.locator('strong,b').allTextContents();
    result.facts.plainDescription = await desc.locator('strong,b').allTextContents();
    await actor.keyboard.press('Control+z');
    result.facts.commentUndo = await paragraphs(comment, 'commentUndo');
    result.facts.descriptionAfterCommentUndo = await paragraphs(desc, 'descriptionAfterCommentUndo');
    await actor.keyboard.press('Control+Shift+z');
    result.facts.commentRedo = await paragraphs(comment, 'commentRedo');
    stage('description-history-and-toolbar');
    await desc.locator('p').click();
    await actor.keyboard.press('Control+z');
    result.facts.descriptionUndo = await paragraphs(desc, 'descriptionUndo');
    result.facts.commentAfterDescriptionUndo = await comment.locator('strong,b').allTextContents();
    await actor.keyboard.press('Control+Shift+z');
    result.facts.descriptionRedo = await paragraphs(desc, 'descriptionRedo');
    await actor.keyboard.press('End');
    await actor.keyboard.press('Shift+Home');
    await descForm.getByRole('button', { name: /^Italic\b/i }).click();
    result.facts.italicDescription = await desc.locator('em,i').allTextContents();
    result.facts.commentAfterDescriptionFormat = {
      bold: await comment.locator('strong,b').allTextContents(), italic: await comment.locator('em,i').allTextContents(),
    };
    await desc.focus();
    await actor.keyboard.press('Control+z');
    result.facts.descriptionAfterFormatUndo = {
      paragraphs: await paragraphs(desc, 'formatUndo'), italic: await desc.locator('em,i').allTextContents(),
    };
    await descForm.getByRole('button', { name: 'Switch to plain text editing', exact: true }).click();
    const field = descForm.getByTestId('markdown-editor-form-field');
    await expect(field).toBeVisible();
    result.facts.descriptionSource = await field.inputValue();
    result.facts.otherRichStillOpen = await comment.isVisible();
    await openRich(descForm, desc);
    await expect(desc).toContainText(input.suffix.trim());
    result.facts.commentAfterModeSwitch = await paragraphs(comment, 'commentAfterModeSwitch');
    result.facts.initialServer = { description: (await request(api)).description, notes: await savedNotes() };
    await desc.screenshot({ path: screenshot('description-draft'), animations: 'disabled' });
    await comment.screenshot({ path: screenshot('comment-draft'), animations: 'disabled' });
    const serverState = async () => ({ description: (await request(api)).description, notes: await savedNotes() });
    async function post() {
      await activity.getByRole('button', { name: 'Comment', exact: true }).click();
      await expect.poll(savedNotes, { timeout: 30000 }).not.toEqual([]);
      await expect(comment).toHaveText('');
      result.facts.commentCleared = await paragraphs(comment, 'afterPost');
    }
    async function saveDescription() {
      await descForm.getByRole('button', { name: 'Save changes', exact: true }).click();
      await expect(desc).toBeHidden({ timeout: 30000 });
    }
    stage('save-' + input.firstSave + '-first');
    if (input.firstSave === 'comment') {
      await post();
      result.facts.afterFirstSave = await serverState();
      result.facts.pendingDraft = await paragraphs(desc, 'pendingDescription');
      await saveDescription();
    } else {
      await saveDescription();
      result.facts.afterFirstSave = await serverState();
      result.facts.pendingDraft = await paragraphs(comment, 'pendingComment');
      await post();
    }
    stage('reopen-both-records');
    result.facts.afterSave = await serverState();
    await actor.reload();
    const reader = actor.locator('.js-work-item-description');
    await expect(reader).toBeVisible({ timeout: 30000 });
    await expect(activity.getByText(input.comment, { exact: true })).toBeVisible({ timeout: 30000 });
    result.facts.reopenedDescription = await reader.innerText();
    result.facts.reopenedComment = await activity.locator('strong,b').filter({ hasText: input.comment }).allTextContents();
    await actor.screenshot({ path: screenshot('reopened'), animations: 'disabled' });
    result.status = 'observed';
  } catch (error) {
    result.failure = String(error);
    await actor.screenshot({ path: screenshot('interrupted'), timeout: 5000 }).catch(() => {});
  } finally {
    await context.close();
  }
  return result;
}
