import { expect } from '@playwright/test';
import { join } from 'node:path';
import { editorProof, observePage, openRich } from './gitlab-audit-editor.mjs';

export async function runGitLabMergeRequestCreation({ page, project, request, fixture, runId, side, output, onProgress }) {
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
  try {
    await observePage(actor, result);
    stage('select-source-branch');
    const commit = await request(api + '/repository/commits', {
      start_branch: project.default_branch, branch, commit_message: input.commitMessage,
      actions: [{ action: 'create', file_path: input.filePath, content: input.fileContent }],
    });
    result.setup = { branch, sha: commit.id, target: project.default_branch };
    expect(await mergeRequests()).toHaveLength(0);
    await actor.goto(list);
    await actor.getByRole('link', { name: 'New merge request', exact:true }).click();
    await actor.getByRole('button', { name:'Select source branch', exact:true }).click();
    const picker = actor.locator('[data-qa-compare-side="source"]');
    await picker.locator('input:not([type="hidden"]):visible').fill(branch);
    await actor.getByRole('option', {name:branch, exact:true}).click();
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
    stage('reopen-edit-and-save');
    await actor.goto(created.web_url + '/edit');
    const reopened = await openRich(form, side);
    result.reopenedEditorProof = await editorProof(reopened);
    await expect(reopened.locator('p').first()).toBeVisible();
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
    await form.getByRole('button', {name:'Save changes', exact:true}).click();
    await expect(actor).toHaveURL(created.web_url, {timeout:30000});
    await actor.reload();
    facts.finalReader = await read();
    const updated = await request(api + '/merge_requests/' + iid);
    facts.updatedSource = updated.description;
    const matches = await mergeRequests();
    facts.singleRecord = matches.length === 1 && matches[0].iid === iid;
    facts.headPreserved = updated.sha === commit.id && updated.state === 'opened' && updated.title === input.title;
    await reader.screenshot({path:join(output,'updated-reader.png')});
    result.status = 'observed';
  } catch (error) {
    result.failure = String(error);
    await actor.screenshot({path:join(output,'interrupted.png'),timeout:5000}).catch(() => {});
  } finally {
    await context.close();
  }
  return [result];
}
