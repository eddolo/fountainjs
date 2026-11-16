import { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const directory = 'artifacts/suggestion-review-live-20261116/';
// appliable is computed by the host, not persisted suggestion identity/history.
const persistedSuggestion = values => values.map(({id,from_line,to_line,applied,from_content,to_content}) =>
  ({id,from_line,to_line,applied,from_content,to_content}));
async function richForm(page, form) {
  await expect(form).toBeVisible({ timeout: 30000 });
  const switcher = form.getByRole('button', { name: 'Switch to rich text editing', exact: true });
  if (await switcher.isVisible()) await switcher.click();
  const native = form.locator('[data-fountain-integration="native"]');
  await expect(native.getByTestId('content-editor-error')).toHaveCount(0);
  const editor = native.locator('.fountain-editor[contenteditable="true"]');
  await expect(editor).toBeVisible();
  return { native, editor, region: editor.getByRole('region', { name: 'Suggested replacement', exact: true }) };
}
async function editReplacement(page, region, text, warningPath) {
  // A real click places the caret in a reopened source block; DOM focus alone
  // does not establish a browser/model text selection.
  await region.locator('code').click(); await page.getByRole('button', { name: 'Edit suggestion', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Suggested replacement', exact: true });
  await expect(dialog).toBeVisible();
  const source = dialog.getByRole('textbox', { name: 'Replacement source', exact: true });
  await source.fill(text);
  const apply = dialog.getByRole('button', { name: /^Apply (suggestion|deletion)$/u });
  if (text === '\n') {
    await expect(dialog.getByRole('alert')).toContainText('not as blank lines');
    await expect(apply).toBeDisabled();
    if (warningPath) await dialog.screenshot({ caret:'initial', animations:'disabled', path:warningPath });
    // GitLab UI places its custom label above the native input. Click the
    // visible label as a user does; never force through it.
    await dialog.getByText('I intend to delete these file lines', {exact:true}).click();
    await expect(dialog.getByRole('checkbox', {name:'I intend to delete these file lines',exact:true})).toBeChecked();
    await expect(apply).toBeEnabled();
  }
  await apply.click();
  await expect(dialog).toBeHidden(); await expect.poll(() => region.locator('code').textContent()).toBe(text);
}
// Control deliberately bypasses Fountain editing: all writes use stock REST APIs.
async function apiAppliedStateControl({ request, project }) {
  const suffix = Date.now().toString(36), branch = 'fountain-review-api-control-' + suffix, filePath = 'api-control-' + suffix + '.js';
  const original = 'old();\nkeep();\n', replacement = 'new();\n';
  const seed = await request(`/api/v4/projects/${project.id}/repository/commits`, { branch, start_branch: project.default_branch,
    commit_message: 'Add isolated server-only suggestion control', actions: [{ action:'create', file_path:filePath, content:original }] });
  let mr = await request(`/api/v4/projects/${project.id}/merge_requests`, { source_branch:branch, target_branch:project.default_branch,
    title:'Fountain server-only suggestion update control ' + suffix, description:'All suggestion creation/application/note editing uses stock REST. No Fountain editing.' });
  const base = `/api/v4/projects/${project.id}/merge_requests/${mr.iid}`;
  await expect.poll(async () => { mr = await request(base); return Boolean(mr.diff_refs?.head_sha); }, { timeout:30000 }).toBe(true);
  const body = '```suggestion:-0+0\n' + replacement + '```\n\nServer-only control ' + suffix;
  const discussion = await request(`${base}/discussions`, { body, position: { position_type:'text', ...mr.diff_refs,
    old_path:filePath, new_path:filePath, new_line:1 } });
  const note = await request(`${base}/notes/${discussion.notes[0].id}`);
  expect(note.suggestions).toHaveLength(1); expect(note.suggestions[0].applied).toBe(false);
  await request(`/api/v4/suggestions/${note.suggestions[0].id}/apply`, { commit_message:'Apply server-only control ' + suffix }, 'PUT');
  const applied = await request(`${base}/notes/${note.id}`); expect(applied.suggestions[0].applied).toBe(true);
  const fileURL = `/api/v4/projects/${project.id}/repository/files/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(branch)}`;
  const fileBefore = await request(fileURL);
  await request(`${base}/notes/${note.id}`, { body:body + ' — prose-only API edit' }, 'PUT');
  const edited = await request(`${base}/notes/${note.id}`), fileAfter = await request(fileURL);
  expect(edited.body).toBe(body + ' — prose-only API edit');
  expect(edited.suggestions).toHaveLength(1); expect(edited.suggestions[0].id).not.toBe(applied.suggestions[0].id);
  expect(edited.suggestions[0].applied).toBe(false); expect(edited.suggestions[0].to_content).toBe(applied.suggestions[0].to_content);
  expect(fileAfter.content).toBe(fileBefore.content); expect(fileAfter.last_commit_id).toBe(fileBefore.last_commit_id);
  expect(Buffer.from(fileAfter.content,'base64').toString('utf8')).toBe(replacement + 'keep();\n');
  expect((await request(`/api/v4/projects/${project.id}/repository/commits/${fileBefore.last_commit_id}`)).parent_ids).toEqual([seed.id]);
  return { scope:'Stock REST control; no Fountain document/editor operations', mergeRequest:{iid:mr.iid,url:mr.web_url}, noteId:note.id,
    original, replacement, before:applied.suggestions, after:edited.suggestions,
    sourceCommit:fileBefore.last_commit_id, sourceUnchanged:true, body:edited.body };
}
export async function auditGitLabSuggestionReview({ root, page, request, project, pin, version }) {
  const output = new URL(directory, root); await mkdir(output, { recursive: true });
  const errors = [], cases = [], retainedIssues = [];
  const onError = error => errors.push(error.message); page.on('pageerror', onError);
  const receipt = { scope: 'Real posted replacement, empty deletion and explicitly confirmed whitespace-deletion editing/application. Desired Applied-metadata retention is a failing host requirement; blank-line application is not claimed.',
    upstream: { revision: pin.commit, version: version.version }, project: { id: project.id, path: project.path_with_namespace }, errors, cases, retainedIssues, limitations:['Stock GitLab applies whitespace-only source as deletion. Native warning and explicit confirmation describe that effect; meaningful blank-line application remains unsupported by the host.'], acceptancePassed:false };
  try {
    receipt.serverControl = await apiAppliedStateControl({ request, project });
    console.log(JSON.stringify({ kind:'suggestion-review', stage:'server-control-confirmed', noteId:receipt.serverControl.noteId }));
    for (const [kind, replacement] of [['replacement', 'const key = "\\n\uE000";\n'], ['deletion', ''], ['whitespace-deletion', '\n']]) {
      console.log(JSON.stringify({ kind: 'suggestion-review', stage: 'starting', case: kind }));
      const suffix = Date.now().toString(36), branch = 'fountain-review-' + kind + '-' + suffix;
      const filePath = 'review-' + suffix + '.js', original = 'const key = "A\u200bB";\nkeep();\nlast();\n';
      const marker = 'Review ' + kind + ' ' + suffix;
      const commit = await request(`/api/v4/projects/${project.id}/repository/commits`, { branch, start_branch: project.default_branch,
        commit_message: 'Add isolated posted-suggestion review fixture', actions: [{ action: 'create', file_path: filePath, content: original }] });
      const mr = await request(`/api/v4/projects/${project.id}/merge_requests`, { source_branch: branch, target_branch: project.default_branch,
        title: 'Fountain posted suggestion ' + kind + ' ' + suffix, description: 'Native end-to-end review acceptance fixture.' });
      const base = `/api/v4/projects/${project.id}/merge_requests/${mr.iid}`;
      const entry = { kind, replacement, branch, filePath, original, marker, seedCommit: commit.id, mergeRequest: { iid: mr.iid, url: mr.web_url }, checks: [] };
      cases.push(entry); await writeFile(new URL('partial.json', output), JSON.stringify(receipt, null, 2) + '\n');
      await page.goto(mr.web_url + '/diffs');
      const row = page.locator('tr[data-hunk-lines]').filter({ has: page.locator('[data-position="new"] [data-line-number="1"]') }).first();
      await expect(row).toBeVisible({ timeout: 60000 }); const toggle = page.locator('[data-new-discussion-toggle]');
      await expect(async () => { await page.mouse.move(10, 10); await row.locator('[data-line-number="1"]').first().hover(); await expect(toggle).toBeVisible({ timeout: 1000 }); }).toPass({ timeout: 30000, intervals: [500, 1000, 2000] });
      await toggle.click();
      const form = page.locator('form.common-note-form').first();
      let { native, editor, region } = await richForm(page, form);
      await native.getByRole('button', { name: 'Insert suggestion', exact: true }).click();
      await expect.poll(() => region.locator('code').textContent()).toBe(original.split('\n')[0] + '\n');
      await region.focus(); await page.keyboard.press('Control+Enter'); await page.keyboard.insertText(marker);
      await form.getByRole('button', { name: /^(Add comment now|Comment)$/u }).click();
      let discussion;
      await expect.poll(async () => { discussion = (await request(`${base}/discussions`)).find(value => value.notes.some(note => note.body.includes(marker))); return Boolean(discussion); }, { timeout: 30000 }).toBe(true);
      const note = discussion.notes.find(value => value.body.includes(marker));
      entry.noteId = note.id; entry.discussionId = discussion.id; entry.initialBody = note.body;
      expect(note.body).toBe('```suggestion:-0+0\n' + original.split('\n')[0] + '\n```\n\n' + marker);
      await page.reload();
      const savedNote = page.locator('#note_' + note.id);
      await expect(savedNote).toBeVisible({ timeout: 30000 });
      await savedNote.getByRole('button', { name: 'Edit comment', exact: true }).click();
      const editForm = savedNote.locator('form.common-note-form');
      ({ native, editor, region } = await richForm(page, editForm));
      await expect.poll(() => region.locator('code').textContent()).toBe(original.split('\n')[0] + '\n');
      entry.checks.push('Posted source reopens in the native suggestion node with exact original source.');
      await editReplacement(page, region, replacement, fileURLToPath(new URL(kind + '-warning.png', output)));
      const effect = kind === 'replacement' ? 'replacement' : 'deletion';
      await expect(region).toHaveAttribute('data-fountain-suggestion-effect', effect);
      if (effect === 'deletion') await expect(region).toContainText('Deletes target lines');
      const toolbar = native.getByTestId('formatting-toolbar');
      await toolbar.getByRole('button', {name:'Undo',exact:true}).click();
      await expect.poll(() => region.locator('code').textContent()).toBe(original.split('\n')[0] + '\n');
      await expect(region).toHaveAttribute('data-fountain-suggestion-effect','replacement');
      await toolbar.getByRole('button', {name:'Redo',exact:true}).click();
      await expect.poll(() => region.locator('code').textContent()).toBe(replacement);
      await expect(region).toHaveAttribute('data-fountain-suggestion-effect',effect);
      entry.checks.push('Native caption describes host effect and one-step undo/redo retains exact source.');
      await editForm.screenshot({ caret: 'initial', path: fileURLToPath(new URL(kind + '-edited-draft.png', output)) });
      const body = '```suggestion:-0+0\n' + replacement + '```\n\n' + marker;
      await editForm.getByRole('button', { name: 'Save comment', exact: true }).click();
      await expect.poll(async () => (await request(`${base}/notes/${note.id}`)).body, { timeout: 30000 }).toBe(body);
      entry.savedBody = body;
      await page.reload(); await expect(savedNote.getByText(marker, { exact: true })).toBeVisible({ timeout: 30000 });
      entry.checks.push('Editing the posted proposal saves the intended replacement exactly; empty and whitespace source remain distinct, while confirmed whitespace has explicit deletion semantics.');
      await page.screenshot({ caret: 'initial', fullPage: true, path: fileURLToPath(new URL(kind + '-posted-reader.png', output)) });
      await savedNote.getByTestId('apply-suggestion-dropdown').getByRole('button', { name: 'Apply suggestion', exact: true }).click();
      const message = 'Apply Fountain reviewed ' + kind + ' ' + suffix;
      await page.getByTestId('commit-message-field').fill(message);
      await page.getByTestId('commit-with-custom-message-button').click();
      const expected = (kind === 'whitespace-deletion' ? '' : replacement) + original.split('\n').slice(1).join('\n');
      let file;
      await expect.poll(async () => { file = await request(`/api/v4/projects/${project.id}/repository/files/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(branch)}`); return Buffer.from(file.content, 'base64').toString('utf8'); }, { timeout: 30000 }).toBe(expected);
      expect(file.last_commit_id).not.toBe(commit.id);
      const appliedCommit = await request(`/api/v4/projects/${project.id}/repository/commits/${file.last_commit_id}`);
      expect(appliedCommit.message).toContain(message);
      expect(appliedCommit.parent_ids).toEqual([commit.id]);
      const branchAfter = await request(`/api/v4/projects/${project.id}/repository/branches/${encodeURIComponent(branch)}`);
      expect(branchAfter.commit.id).toBe(appliedCommit.id);
      entry.applied = { commit: appliedCommit.id, parents: appliedCommit.parent_ids, branchHead: branchAfter.commit.id, content: expected };
      entry.checks.push('GitLab applies the edited proposal as a real source commit with exact remaining file content.');
      await page.goto(mr.web_url + '/diffs');
      // Use the normal overview link: do not rely on the retained resolved-gutter issue.
      await page.getByRole('link', { name: /^Overview/u }).first().click();
      const thread = page.locator(`[data-discussion-id="${discussion.id}"]`).first();
      await expect(thread).toBeVisible({ timeout: 30000 });
      const expand = thread.getByRole('button', { name: 'Expand replies', exact: true });
      if (await expand.isVisible()) await expand.click();
      await expect(page.getByTestId('applied-badge')).toBeVisible({ timeout: 30000 });
      entry.readerRoute = 'Overview link and normal Expand replies control; resolved Rapid Diffs gutter remains separate.';
      entry.beforeProseEdit = (await request(`${base}/notes/${note.id}`)).suggestions;
      expect(entry.beforeProseEdit).toHaveLength(1); expect(entry.beforeProseEdit[0].applied).toBe(true);
      const appliedNote = page.locator('#note_' + note.id);
      await appliedNote.getByRole('button', { name: /^Edit comment(?:,|$)/u }).click();
      const appliedForm = appliedNote.locator('form.common-note-form');
      ({ native, editor, region } = await richForm(page, appliedForm));
      await expect.poll(() => region.locator('code').textContent()).toBe(replacement);
      const prose = editor.getByText(marker, { exact: true }); await prose.click(); await page.keyboard.press('End');
      await page.keyboard.insertText(' — confirmed');
      await appliedForm.getByRole('button', { name: 'Save comment', exact: true }).click();
      entry.finalBody = body + ' — confirmed';
      await expect.poll(async () => (await request(`${base}/notes/${note.id}`)).body, { timeout: 30000 }).toBe(entry.finalBody);
      entry.afterProseEdit = (await request(`${base}/notes/${note.id}`)).suggestions;
      expect(entry.afterProseEdit).toHaveLength(1);
      expect(entry.afterProseEdit[0].to_content).toBe(entry.beforeProseEdit[0].to_content);
      if (!entry.afterProseEdit[0].applied) retainedIssues.push({ code:'GITLAB_APPLIED_METADATA_RECREATED_ON_PROSE_EDIT', kind, noteId:note.id,
        before:entry.beforeProseEdit, after:entry.afterProseEdit, serverControlNoteId:receipt.serverControl.noteId,
        desired:'Unchanged applied replacement retains its application metadata through prose-only note editing.' });
      const unchanged = await request(`/api/v4/projects/${project.id}/repository/files/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(branch)}`);
      expect(Buffer.from(unchanged.content, 'base64').toString('utf8')).toBe(expected); expect(unchanged.last_commit_id).toBe(appliedCommit.id);
      entry.checks.push('Applied note reopens natively; prose editing retains suggestion source and cannot write repository content.');
      await page.reload();
      const reloadedThread = page.locator(`[data-discussion-id="${discussion.id}"]`).first();
      await expect(reloadedThread).toBeVisible({ timeout:30000 });
      const reopened = reloadedThread.getByRole('button', { name: 'Expand replies', exact: true });
      if (await reopened.isVisible()) await reopened.click();
      await expect(appliedNote.getByText(marker + ' — confirmed', { exact: true })).toBeVisible({ timeout: 30000 });
      entry.readerAppliedVisible = await page.getByTestId('applied-badge').isVisible();
      if (entry.afterProseEdit[0].applied) expect(entry.readerAppliedVisible).toBe(true);
      await page.screenshot({ caret: 'initial', fullPage: true, path: fileURLToPath(new URL(kind + '-applied-reader.png', output)) });
      await writeFile(new URL('partial.json', output), JSON.stringify(receipt, null, 2) + '\n');
      console.log(JSON.stringify({ kind: 'suggestion-review', stage: 'source-workflow-verified', case: kind, noteId: note.id, commit: appliedCommit.id }));
    }
    expect(errors).toEqual([]);
    receipt.acceptancePassed = retainedIssues.length === 0;
    await writeFile(new URL('report.json', output), JSON.stringify(receipt, null, 2) + '\n');
    if (!receipt.acceptancePassed) throw new Error('GITLAB_REVIEW_RETAINED_APPLIED_METADATA_ISSUE');
  } catch (error) {
    receipt.failure = String(error); await page.screenshot({ fullPage: true, path: fileURLToPath(new URL('failure.png', output)) }).catch(() => {});
    await writeFile(new URL('failure.json', output), JSON.stringify(receipt, null, 2) + '\n'); throw error;
  } finally { page.off('pageerror', onError); }
}
export async function verifyGitLabSuggestionReview({ root, page, request, project, pin, version }) {
  const output = new URL(directory, root), prior = JSON.parse(await readFile(new URL('report.json', output)));
  if (prior.project.id !== project.id || prior.upstream.revision !== pin.commit || prior.cases.length !== 3) throw new Error('No complete matching review receipt');
  const checks = [];
  const control = prior.serverControl;
  const controlBase = `/api/v4/projects/${project.id}/merge_requests/${control.mergeRequest.iid}`;
  const controlNote = await request(`${controlBase}/notes/${control.noteId}`);
  expect(controlNote.body).toBe(control.body); expect(persistedSuggestion(controlNote.suggestions)).toEqual(persistedSuggestion(control.after));
  const controlMR = await request(controlBase), controlDiffs = await request(`${controlBase}/diffs`);
  expect(controlDiffs).toHaveLength(1);
  const controlFile = await request(`/api/v4/projects/${project.id}/repository/files/${encodeURIComponent(controlDiffs[0].new_path)}?ref=${encodeURIComponent(controlMR.source_branch)}`);
  expect(controlFile.last_commit_id).toBe(control.sourceCommit);
  expect(Buffer.from(controlFile.content,'base64').toString('utf8')).toBe(control.replacement + 'keep();\n');
  // Independently retain the original negative blank-line application receipt.
  const before = JSON.parse(await readFile(new URL('artifacts/suggestion-review-before-effects-20261116/failure.json',root)));
  const blank = before.cases.find(entry => entry.kind === 'blank');
  const blankBase = `/api/v4/projects/${project.id}/merge_requests/${blank.mergeRequest.iid}`;
  const blankNote = await request(`${blankBase}/notes/${blank.noteId}`);
  expect(blankNote.body).toBe(blank.savedBody); expect(blankNote.suggestions[0].to_content).toBe('');
  const blankFile = await request(`/api/v4/projects/${project.id}/repository/files/${encodeURIComponent(blank.filePath)}?ref=${encodeURIComponent(blank.branch)}`);
  const blankActual = Buffer.from(blankFile.content,'base64').toString('utf8');
  expect(blankActual).toBe('keep();\nlast();\n'); expect(blankActual).not.toBe('\nkeep();\nlast();\n');
  const negativeBlank = {scope:'Original negative case, read-only recheck after restart; not silently promoted to blank-line support',
    mergeRequest:blank.mergeRequest,noteId:blank.noteId,body:blankNote.body,source:blank.replacement,
    desiredContent:'\nkeep();\nlast();\n',actualContent:blankActual,commit:blankFile.last_commit_id,
    serverSuggestion:blankNote.suggestions[0]};
  for (const entry of prior.cases) {
    const base = `/api/v4/projects/${project.id}/merge_requests/${entry.mergeRequest.iid}`;
    const note = await request(`${base}/notes/${entry.noteId}`);
    expect(note.body).toBe(entry.finalBody); expect(persistedSuggestion(note.suggestions)).toEqual(persistedSuggestion(entry.afterProseEdit));
    const file = await request(`/api/v4/projects/${project.id}/repository/files/${encodeURIComponent(entry.filePath)}?ref=${encodeURIComponent(entry.branch)}`);
    expect(Buffer.from(file.content, 'base64').toString('utf8')).toBe(entry.applied.content); expect(file.last_commit_id).toBe(entry.applied.commit);
    expect((await request(`/api/v4/projects/${project.id}/repository/branches/${encodeURIComponent(entry.branch)}`)).commit.id).toBe(entry.applied.commit);
    await page.goto(entry.mergeRequest.url + '#note_' + entry.noteId);
    await expect(page.getByText(entry.marker + ' — confirmed', { exact: true })).toBeVisible({ timeout: 30000 });
    const readerAppliedVisible = await page.getByTestId('applied-badge').isVisible();
    expect(readerAppliedVisible).toBe(entry.readerAppliedVisible);
    await page.screenshot({ caret: 'initial', fullPage: true, path: fileURLToPath(new URL(entry.kind + '-after-restart.png', output)) });
    checks.push({ kind: entry.kind, noteId: entry.noteId, commit: entry.applied.commit, body: entry.finalBody, content: entry.applied.content, readerAppliedVisible, suggestions:note.suggestions, computedEligibility:{before:entry.afterProseEdit.map(value=>value.appliable),after:note.suggestions.map(value=>value.appliable)} });
  }
  await writeFile(new URL('restart.json', output), JSON.stringify({ scope: 'Cold restart retention of observed proposals, comments and source commits; desired Applied metadata retention remains a failing host requirement.', acceptancePassed:prior.acceptancePassed, retainedIssues:prior.retainedIssues, serverControl:{noteId:controlNote.id,suggestions:controlNote.suggestions,sourceCommit:controlFile.last_commit_id,computedEligibility:{before:control.after.map(value=>value.appliable),after:controlNote.suggestions.map(value=>value.appliable)}}, negativeBlank, upstream: { revision: pin.commit, version: version.version }, checks }, null, 2) + '\n');
  console.log(JSON.stringify({ kind: 'suggestion-review-restart', checks: checks.length, acceptancePassed:prior.acceptancePassed }));
}
