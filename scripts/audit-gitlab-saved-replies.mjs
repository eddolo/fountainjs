import { expect } from '@playwright/test';
import { join } from 'node:path';
import { prepareGitLabAuditMember } from './gitlab-audit-member.mjs';

const createReply = `mutation($name:String!, $content:String!){
  savedReplyCreate(input:{name:$name, content:$content}){errors savedReply{id}}
}`;
const deleteReply = `mutation($id:UsersSavedReplyID!){
  savedReplyDestroy(input:{id:$id}){errors}
}`;

async function mutate(request, query, variables, name) {
  const response = await request('/api/graphql', { query, variables });
  const payload = response.data?.[name];
  if (response.errors?.length || !payload || payload.errors.length) throw new Error('Fixture mutation failed: ' + name);
  return payload;
}

async function observePage(actor, result) {
  actor.on('pageerror', error => result.pageErrors.push(error.message));
  const notice = actor.locator('#security-patch-upgrade-alert-modal[role="dialog"]');
  await actor.addLocatorHandler(notice, async () => {
    const title = await notice.getByTestId('alert-modal-title').innerText();
    await notice.getByRole('button', { name: 'Close', exact: true }).click();
    (result.dismissedPatchNotices ??= []).push(title);
  });
}

async function openRich(form, side) {
  const editor = form.locator(side === 'fountain' ? '.fountain-editor[contenteditable=true]' : '.ProseMirror[contenteditable=true]');
  const toggle = form.getByRole('button', { name: 'Switch to rich text editing', exact: true });
  await expect(editor.or(toggle).first()).toBeVisible({ timeout: 30000 });
  if (!(await editor.isVisible())) await toggle.click();
  await expect(editor).toBeVisible({ timeout: 30000 });
  return editor;
}

const proof = editor => editor.evaluate(el => ({ native: Boolean(el.closest('[data-fountain-integration="native"]')), className: el.className }));

export async function runGitLabSavedReplyCompatibility(options) {
  const results = [];
  for (const input of options.fixture.cases) {
    if (input.scope === 'saved-reply-accounts') results.push(await compareAccounts(options, input));
    else if (input.scope === 'saved-replies') results.push(await insertReply(options, input));
    else throw new Error('Unknown saved-reply fixture.');
  }
  return results;
}

async function insertReply({ page, request, project, side, runId, output, onProgress }, input) {
  const result = { id: input.id, input, status: 'incomplete', facts: {}, pageErrors: [] };
  const facts = result.facts;
  const replyName = 'Release verification ' + runId;
  const templateDraft = input.prefix + input.selected + input.suffix;
  const context = await page.context().browser().newContext({
    storageState: await page.context().storageState(), viewport: { width: 1280, height: 900 }, recordVideo: { dir: output },
  });
  const actor = await context.newPage();
  await observePage(actor, result);
  function stage(name) {
    result.stage = name;
    onProgress({ side, case: input.id, stage: name });
  }
  let replyId;
  try {
    stage('create-personal-reply');
    replyId = (await mutate(request, createReply, { name: replyName, content: input.reply }, 'savedReplyCreate')).savedReply.id;
    const issue = await request('/api/v4/projects/' + project.id + '/issues', { title: input.title + ' ' + runId, description: input.description });
    const api = '/api/v4/projects/' + project.id + '/issues/' + issue.iid;
    result.iid = issue.iid;
    await actor.goto(issue.web_url);
    await actor.getByTestId('work-item-edit-form-button').click();
    const description = await openRich(actor.getByTestId('work-item-description-wrapper'), side);
    const discussion = actor.getByTestId('detail-layout-activity');
    const comment = await openRich(discussion, side);
    result.editorProof = await proof(comment);
    result.descriptionEditorProof = await proof(description);
    await description.locator('p').click();
    await actor.keyboard.press('End');
    await actor.keyboard.insertText(input.draftSuffix);
    await comment.click();
    await actor.keyboard.insertText(templateDraft);
    async function selectPlaceholder() {
      await comment.locator('p').click();
      await expect(comment).toBeFocused();
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
      if (replyId) await mutate(request, deleteReply, { id: replyId }, 'savedReplyDestroy');
    } finally {
      await context.close();
    }
  }
  return result;
}

async function compareAccounts({ page, request, project, fixture, side, runId, output, onProgress }, input) {
  const result = { id: input.id, input, status: 'incomplete', facts: {}, pageErrors: [] };
  const member = await prepareGitLabAuditMember({ request, project, fixture });
  const membersPath = '/api/v4/projects/' + project.id + '/members';
  const initial = (await request(membersPath + '?query=' + encodeURIComponent(fixture.username)))
    .find(entry => entry.id === member.account.id);
  const browser = page.context().browser();
  const login = await browser.newContext();
  const contexts = [], templates = [];
  const search = 'Review ' + runId;
  let roleChanged = false;
  function stage(name) {
    result.stage = name;
    onProgress({ side, case: input.id, stage: name });
  }
  try {
    stage('prepare-two-accounts');
    result.membership = await member.setRole(input.reporterAccess);
    roleChanged = initial?.access_level !== result.membership.accessLevel;
    await member.signInMember(await login.newPage(), result);
    const issue = await request('/api/v4/projects/' + project.id + '/issues', { title: input.title + ' ' + runId });
    result.iid = issue.iid;
    const actors = [];
    for (const [index, author] of input.authors.entries()) {
      const source = index === 0 ? page.context() : login;
      const context = await browser.newContext({ storageState: await source.storageState(),
        viewport: { width: 1280, height: 900 }, recordVideo: { dir: output } });
      contexts.push(context);
      const actor = await context.newPage();
      await observePage(actor, result);
      await actor.goto(issue.web_url);
      const user = await actor.request.get(new URL('/api/v4/user', issue.web_url).href);
      expect(user.ok()).toBe(true);
      const identity = await user.json();
      expect(identity.username).toBe(author.username);
      if (index === 1) expect(identity.id).toBe(result.membership.id);
      const csrf = await actor.locator('meta[name="csrf-token"]').getAttribute('content');
      const actorRequest = async (path, data) => {
        const response = await actor.request.post(new URL(path, issue.web_url).href, { headers: { 'X-CSRF-Token': csrf }, data });
        if (!response.ok()) throw new Error('Saved-reply fixture request failed: ' + response.status());
        return response.json();
      };
      const name = search + ' ' + author.label;
      const reply = await mutate(actorRequest, createReply, { name, content: author.markdown }, 'savedReplyCreate');
      templates.push({ id: reply.savedReply.id, request: actorRequest });
      actors.push({ actor, author, name });
    }
    const notesPath = '/api/v4/projects/' + project.id + '/issues/' + issue.iid + '/notes';
    const notes = async () => (await request(notesPath)).filter(note => !note.system)
      .sort((a, b) => a.id - b.id).map(note => ({ username: note.author.username, body: note.body }));
    for (const [index, { actor, author, name }] of actors.entries()) {
      stage('pick-and-post-' + author.label);
      const discussion = actor.getByTestId('detail-layout-activity');
      const editor = await openRich(discussion, side);
      result[index === 0 ? 'editorProof' : 'reporterEditorProof'] = await proof(editor);
      await editor.click();
      await discussion.getByRole('button', { name: 'Insert comment template', exact: true }).click();
      const dialog = actor.getByRole('dialog', { name: 'Select a comment template' });
      await dialog.getByPlaceholder('Search comment templates').fill(search);
      const list = dialog.getByTestId('comment-templates-list');
      const own = list.getByText(name, { exact: true });
      await expect(own).toBeVisible({ timeout: 20000 });
      const other = actors[1 - index];
      result.facts[author.label + 'Picker'] = {
        ownVisible: await own.isVisible(),
        otherTitleCount: await list.getByText(other.name, { exact: true }).count(),
        otherContentVisible: (await list.innerText()).includes(other.author.text),
      };
      await dialog.screenshot({ path: join(output, author.label + '-templates.png'), animations: 'disabled' });
      await own.click();
      await expect(editor.locator(author.selector)).toHaveText(author.text);
      await discussion.getByRole('button', { name: 'Comment', exact: true }).click();
      await expect.poll(async () => (await notes()).length, { timeout: 30000 }).toBe(index + 1);
    }
    result.facts.notes = await notes();
    for (const { actor, author } of actors) {
      await actor.reload();
      const discussion = actor.getByTestId('detail-layout-activity');
      const visible = [];
      for (const writer of input.authors) {
        const rendered = discussion.locator('.note-text').locator(writer.selector).filter({ hasText: writer.text });
        await expect(rendered).toHaveText(writer.text, { timeout: 30000 });
        visible.push(await rendered.innerText());
      }
      result.facts[author.label + 'Reader'] = visible;
    }
    result.status = 'observed';
  } catch (error) {
    result.failure = String(error);
  } finally {
    const cleanup = await Promise.allSettled(templates.map(reply =>
      mutate(reply.request, deleteReply, { id: reply.id }, 'savedReplyDestroy')));
    try {
      if (roleChanged) {
        if (initial) await member.setRole(initial.access_level);
        else await request(membersPath + '/' + member.account.id, {}, 'DELETE');
      }
    } finally {
      await Promise.all([...contexts, login].map(context => context.close()));
    }
    if (cleanup.some(entry => entry.status === 'rejected')) throw new Error('Personal template cleanup failed.');
  }
  return result;
}
