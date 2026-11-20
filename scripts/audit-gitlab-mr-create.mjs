import { expect } from '@playwright/test';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { leavePendingReview, finishPendingReview } from './verify-gitlab-mr-handover.mjs';
import { editorProof, observePage, openRich } from './gitlab-audit-editor.mjs';
import { observeMergeRequestNavigation } from '../integrations/gitlab/testing/observe-mr-navigation.mjs';
import { prepareGitLabAuditMember } from './gitlab-audit-member.mjs';

export async function runGitLabMergeRequestCreation(options) {
  const {page, project, request, fixture} = options;
  const access = fixture.cases[0].authorAccess;
  if (access === undefined) return createMergeRequest(options);

  const member = await prepareGitLabAuditMember({project, request, fixture});
  const membershipPath = '/api/v4/projects/' + project.id + '/members';
  const prior = (await request(membershipPath + '?query=' + encodeURIComponent(fixture.username)))
    .find(item => item.id === member.account.id);
  // Authenticate before recording. Only the signed-in session is copied to the recorded browser.
  const login = await page.context().browser().newContext();
  let membership;
  try {
    membership = await member.setRole(access);
    const session = await login.newPage();
    await member.signInMember(session, {});
    return await createMergeRequest({...options, page: session}, membership);
  } finally {
    try {
      if (membership && prior?.access_level !== membership.accessLevel) {
        if (prior) await member.setRole(prior.access_level);
        else await request(membershipPath + '/' + member.account.id, {}, 'DELETE');
      }
    } finally {
      await login.close();
    }
  }
}

async function createMergeRequest({ page, project, request, fixture, runId, side, output, onProgress, mrHandoverFrom }, membership) {
  const [input] = fixture.cases;
  const result = { id: input.id, input, status: 'incomplete', facts: {}, pageErrors: [] };
  const { facts } = result;
  const context = await page.context().browser().newContext({
    storageState: await page.context().storageState(), viewport: { width: 1280, height: 900 },
    locale: 'en-US', timezoneId: 'UTC', recordVideo: { dir: output },
  });
  const actor = await context.newPage();
  const api = '/api/v4/projects/' + project.id;
  const branch = 'fountain-mr-' + runId + '-' + side;
  const list = project.web_url + '/-/merge_requests';
  const form = actor.locator('form.merge-request-form');
  const reader = actor.locator('.description .md').first();
  const mergeRequests = () => request(api + '/merge_requests?state=all&source_branch=' + encodeURIComponent(branch));
  const stage = name => { result.stage = name; onProgress({ side, case: input.id, stage: name }); };
  const read = async () => {
    await expect(reader).toBeVisible({timeout:30000});
    return { paragraphs: await reader.locator('p').allTextContents(), bold: await reader.locator('strong,b').allTextContents() };
  };
  let navigation;
  try {
    await observePage(actor, result);
    if (input.discussionControl && context.browser().browserType().name() === 'webkit') {
      navigation = await observeMergeRequestNavigation(actor, result, new URL(list).origin);
    }
    if (membership) {
      const identity = await actor.request.get(new URL('/api/v4/user', list).href);
      expect(identity.status()).toBe(200);
      const user = await identity.json();
      expect(user.id).toBe(membership.id);
      expect(user.username).toBe(fixture.username);
      expect(user.is_admin).not.toBe(true);
      const current = await request(api + '/members/all/' + user.id);
      expect(current.access_level).toBe(input.authorAccess);
      result.writer = {id:user.id, username:user.username, accessLevel:current.access_level};
    }
    if (mrHandoverFrom) {
      stage('finish-fountain-review-on-stock');
      await finishPendingReview({actor, request, project, input, result, candidate:mrHandoverFrom, output});
      result.status = 'observed';
      return [result];
    }
    stage('select-source-branch');
    const commit = await request(api + '/repository/commits', {
      start_branch: project.default_branch, branch, commit_message: input.commitMessage,
      actions: [{ action: 'create', file_path: input.filePath, content: input.fileContent }],
    });
    result.setup = { branch, sha: commit.id, target: project.default_branch };
    expect(await mergeRequests()).toHaveLength(0);
    await actor.goto(list);
    stage('open-new-request');
    await actor.getByRole('link', { name: 'New merge request', exact:true }).click();
    await actor.getByRole('button', { name:'Select source branch', exact:true }).click();
    const picker = actor.locator('[data-qa-compare-side="source"]');
    await picker.locator('input:not([type="hidden"]):visible').fill(branch);
    await actor.getByRole('option', {name:branch, exact:true}).click();
    stage('compare-branches');
    await actor.getByTestId('compare-branches-button').click();
    const create = actor.getByTestId('issuable-create-button');
    await expect(create).toBeVisible({timeout:30000});
    facts.branchSelection = await form.locator('input[name="merge_request[source_branch]"]').inputValue() === branch &&
      await form.locator('input[name="merge_request[target_branch]"]').inputValue() === project.default_branch;
    stage('author-and-submit');
    await form.locator('#merge_request_title').fill(input.title);
    const editor = await openRich(form, side);
    result.editorProof = await editorProof(editor);
    await editor.click();
    await actor.keyboard.press('Control+a');
    await actor.keyboard.insertText(input.prefix);
    await actor.keyboard.press('Control+b');
    await actor.keyboard.insertText(input.bold);
    await actor.keyboard.press('Control+b');
    await actor.keyboard.insertText('.');
    await expect(editor.locator('strong,b')).toHaveText(input.bold);
    await editor.screenshot({path:join(output,'create-description.png')});
    const post = actor.waitForResponse(response => response.request().method() === 'POST' && response.url() === list);
    stage('create-request');
    const [response] = await Promise.all([post, create.click()]);
    result.createStatus = response.status();
    await expect(actor).toHaveURL(url => url.href.startsWith(list + '/') && /^\d+$/.test(url.pathname.split('/').pop()), {timeout:30000});
    const iid = Number(new URL(actor.url()).pathname.split('/').pop());
    result.iid = iid;
    const created = await request(api + '/merge_requests/' + iid);
    facts.submission = response.status() >= 200 && response.status() < 400 &&
      created.state === 'opened' && created.title === input.title && created.source_branch === branch &&
      created.target_branch === project.default_branch && created.sha === commit.id;
    facts.createdSource = created.description;
    facts.reader = await read();
    await reader.screenshot({path:join(output,'created-reader.png')});
    // A separate existing note makes a missing or stale discussion visible after navigation.
    let controlNote, pendingReview;
    if (input.discussionControl) {
      controlNote = await request(api + '/merge_requests/' + iid + '/notes', {body:input.discussionControl});
      result.controlNoteId = controlNote.id;
      if (input.pendingReview) {
        const draftURL = new URL(api + '/merge_requests/' + iid + '/draft_notes', list).href;
        const csrf = await actor.locator('meta[name="csrf-token"]').getAttribute('content');
        const response = await actor.request.post(draftURL, {headers:{'X-CSRF-Token':csrf}, data:{note:input.pendingReview}});
        expect(response.status()).toBe(201);
        const draft = await response.json();
        expect(draft.note).toBe(input.pendingReview);
        expect(draft.author_id).toBe(membership.id);
        pendingReview = {url:draftURL, id:draft.id};
        result.pendingReviewId = draft.id;
      }
    }
    stage('open-edit-form');
    const editLink = actor.getByRole('link', {name:'Edit merge request', exact:true});
    await expect(editLink).toBeVisible({timeout:30000});
    expect(new URL(await editLink.getAttribute('href'), actor.url()).href).toBe(created.web_url + '/edit');
    await editLink.click();
    const reopened = await openRich(form, side);
    result.reopenedEditorProof = await editorProof(reopened);
    // GitLab mounts an empty editor before the saved description finishes loading.
    const firstParagraph = reopened.locator('p').first();
    await expect(firstParagraph).toBeVisible();
    await expect(firstParagraph).toHaveText(/\S/u, {timeout:30000});
    facts.reopened = { paragraphs: await reopened.locator('p').allTextContents(), bold: await reopened.locator('strong,b').allTextContents() };
    await reopened.locator('p').last().click();
    await actor.keyboard.press('Control+End');
    await actor.keyboard.press('Enter');
    await actor.keyboard.insertText(input.followup);
    // Read the live draft in one browser turn so the immediate Save remains representative.
    result.beforeSave = await reopened.evaluate(root => ({
      paragraphs: [...root.querySelectorAll('p')].map(node => node.textContent),
      bold: [...root.querySelectorAll('strong,b')].map(node => node.textContent),
    }));
    expect(result.beforeSave).toEqual({paragraphs: [input.prefix + input.bold + '.', input.followup], bold: [input.bold]});
    stage('save-description');
    await form.getByRole('button', {name:'Save changes', exact:true}).click();
    await expect(actor).toHaveURL(created.web_url, {timeout:30000});
    stage('reload-reader');
    await actor.reload();
    facts.finalReader = await read();
    if (controlNote) {
      const note = actor.locator('#note_' + controlNote.id).getByText(input.discussionControl, {exact:true});
      await expect(note).toBeVisible({timeout:30000});
      const savedNote = await request(api + '/merge_requests/' + iid + '/notes/' + controlNote.id);
      facts.discussionAfterReload = {idMatches:savedNote.id === controlNote.id, saved:savedNote.body, reader:await note.innerText()};
      await note.screenshot({path:join(output,'reloaded-discussion.png')});
      if (pendingReview) {
        stage('recover-pending-review');
        const readDrafts = async () => {
          const response = await actor.request.get(pendingReview.url);
          expect(response.status()).toBe(200);
          return response.json();
        };
        const savedDrafts = await readDrafts();
        await actor.getByRole('button', {name:/Your review/i}).click();
        const preview = actor.getByTestId('review-preview-item-content');
        await expect(preview).toBeVisible({timeout:30000});
        const notesPath = api + '/merge_requests/' + iid + '/notes';
        const published = async () => (await request(notesPath)).filter(note => !note.system && note.body === input.pendingReview);
        facts.pendingReview = {
          sameDraft:savedDrafts.length === 1 && savedDrafts[0].id === pendingReview.id && savedDrafts[0].author_id === membership.id,
          source:savedDrafts[0]?.note, preview:await preview.innerText(), publishedBefore:(await published()).length,
        };
        await preview.screenshot({path:join(output,'pending-review.png')});
        const reviewForm = actor.getByTestId('submit-gl-form');
        await expect(reviewForm.getByRole('radio', {name:/^Comment\b/i})).toBeChecked();
        await reviewForm.getByRole('button', {name:'Submit review',exact:true}).click();
        await expect.poll(async () => (await published()).length, {timeout:30000}).toBe(1);
        const [posted] = await published();
        await actor.reload();
        const publicNote = actor.locator('#note_' + posted.id).getByText(input.pendingReview, {exact:true});
        await expect(publicNote).toBeVisible({timeout:30000});
        const copies = await published();
        facts.submittedReview = {posted:copies.length, sameAuthor:copies[0]?.author.id === membership.id,
          remainingDrafts:(await readDrafts()).length, reader:await publicNote.innerText()};
        await publicNote.screenshot({path:join(output,'posted-review.png')});
      }
    }
    const updated = await request(api + '/merge_requests/' + iid);
    facts.updatedSource = updated.description;
    if (membership) facts.savedAuthor = [created.author, updated.author].map(author => ({id:author.id, username:author.username}));
    const matches = await mergeRequests();
    facts.singleRecord = matches.length === 1 && matches[0].iid === iid;
    facts.headPreserved = updated.sha === commit.id && updated.state === 'opened' && updated.title === input.title;
    await reader.screenshot({path:join(output,'updated-reader.png')});
    if (input.scope === 'mr-review-handover') {
      stage('leave-fountain-review-pending');
      await leavePendingReview({actor, request, project, input, result, output});
    }
    result.status = 'observed';
  } catch (error) {
    result.failure = String(error);
    await actor.screenshot({path:join(output,'interrupted.png'),timeout:5000}).catch(() => {});
  } finally {
    if (navigation) result.traceEndStage = result.stage;
    result.stage = result.status === 'observed' ? 'finished' : result.stage;
    await context.close();
    if (navigation) await writeFile(join(output, 'navigation.json'), JSON.stringify(navigation, null, 2) + '\n');
  }
  return [result];
}
