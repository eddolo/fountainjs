import { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export async function auditGitLabSuggestionAuthoring({ root, page, request, project, pin, version, transport = false }) {
  const output = new URL(transport ? 'artifacts/suggestion-transport-authoring-live-20261116/' : 'artifacts/suggestion-authoring-live-20261116/', root); await mkdir(output, { recursive: true });
  const suffix = Date.now().toString(36), branch = (transport ? 'fountain-suggestion-transport-author-' : 'fountain-suggestion-author-') + suffix, filePath = 'suggestion-author-' + suffix + '.js';
  const original = transport ? 'const value = "\\n";\nconst value = "\uE000";\nconst mixed = "\\n\uE000";\nconst key = "A\u200bB";  \n\nreturn 1;\n' : 'const key = "A\u200bB";\n\n  keep();  \nreturn 1;\n// end\n';
  const marker = 'Review combined suggestion ' + suffix;
  const proposal = transport ? 'const value = "\\n";\nconst value = "\uE000";\n// verified transport\n' : 'const key = "updated";\n';
  const prefill = transport ? original.split('\n').slice(0, 2).join('\n') + '\n' : original.split('\n')[0] + '\n';
  const initialParams = transport ? '-1+0' : '-0+0', expandedParams = transport ? '-1+1' : '-0+2';
  const commit = await request(`/api/v4/projects/${project.id}/repository/commits`, { branch, start_branch: project.default_branch,
    commit_message: 'Add native suggestion authoring audit fixture', actions: [{ action: 'create', file_path: filePath, content: original }] });
  const mr = await request(`/api/v4/projects/${project.id}/merge_requests`, { source_branch: branch, target_branch: project.default_branch,
    title: 'Fountain native inline suggestion ' + suffix, description: 'Isolated native suggestion editing workflow.' });
  const base = `/api/v4/projects/${project.id}/merge_requests/${mr.iid}`, observations = [], errors = [], premature = [];
  page.on('pageerror', error => errors.push(error.message)); let allowSubmit = false;
  const onRequest = value => { if (!allowSubmit && value.method() === 'POST' && value.url().includes(`/merge_requests/${mr.iid}/discussions`)) premature.push(new URL(value.url()).pathname); };
  page.on('request', onRequest);
  const receipt = { scope: 'Actual native Fountain suggestion authoring, normal GitLab submission and real single-suggestion repository application; excludes resolved Rapid Diffs gutter reopening, review batching and role/concurrency acceptance.',
    upstream: { revision: pin.commit, version: version.version }, project: { id: project.id, path: project.path_with_namespace },
    mergeRequest: { iid: mr.iid, url: mr.web_url }, branch, filePath, seedCommit: commit.id, original, proposal, marker, observations, errors };
  try {
    await page.goto(mr.web_url + '/diffs');
    const row = page.locator('tr[data-hunk-lines]').filter({ has: page.locator('[data-position="new"] [data-line-number="1"]') }).first();
    await expect(row).toBeVisible({ timeout: 60000 }); const toggle = page.locator('[data-new-discussion-toggle]');
    await expect(async () => { await page.mouse.move(10, 10); await row.locator('[data-line-number="1"]').first().hover(); await expect(toggle).toBeVisible({ timeout: 1000 }); }).toPass({ timeout: 30000, intervals: [500, 1000, 2000] });
    if (transport) {
      await expect(toggle).toHaveAttribute('draggable', 'true');
      const destination = page.locator('tr[data-hunk-lines]').filter({ has: page.locator('[data-position="new"] [data-line-number="2"]') }).first();
      const from = await toggle.boundingBox(), to = await destination.locator('pre').first().boundingBox();
      if (!from || !to) throw new Error('Missing visible drag endpoints');
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
      await page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2, { steps: 4 });
      await page.mouse.move(to.x + Math.min(40, to.width / 2), to.y + to.height / 2, { steps: 12 });
      await page.mouse.move(to.x + Math.min(40, to.width / 2) + 1, to.y + to.height / 2); await page.mouse.up();
    } else await toggle.click(); const form = page.locator('form.common-note-form').first(); await expect(form).toBeVisible();
    const switcher = form.getByRole('button', { name: 'Switch to rich text editing', exact: true });
    if (await switcher.isVisible()) await switcher.click();
    const native = form.locator('[data-fountain-integration="native"]');
    await expect(native.getByTestId('content-editor-error')).toHaveCount(0);
    const editor = native.locator('.fountain-editor[contenteditable="true"]'); await expect(editor).toBeVisible();
    await native.getByRole('button', { name: 'Insert suggestion', exact: true }).click();
    const region = editor.getByRole('region', { name: 'Suggested replacement', exact: true });
    await expect(region).toHaveCount(1); await expect.poll(() => region.locator('code').textContent()).toBe(prefill);
    observations.push(transport ? 'Real selected multiline diff context inserts exact raw backslash-n and genuine U+E000 as distinct original source values.' : 'Real diff context inserts original Unicode source and offsets into a native suggestion.');
    await region.focus(); await page.getByRole('button', { name: 'Edit suggestion', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Suggested replacement', exact: true }); await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: 'Replacement source', exact: true }).fill(proposal);
    await dialog.getByRole('button', { name: 'Load original file', exact: true }).click();
    await expect(dialog.getByRole('region', { name: 'Original file lines', exact: true })).toContainText('A\u200bB');
    if (transport) await expect(dialog.getByRole('region', { name: 'Original file lines', exact: true })).toContainText('const value = "\\n";');
    await dialog.getByRole('spinbutton', { name: 'Last file line', exact: true }).fill('3');
    await dialog.screenshot({ caret: 'initial', path: fileURLToPath(new URL('source-and-range.png', output)) });
    await dialog.getByRole('button', { name: 'Apply suggestion', exact: true }).click(); await expect(dialog).toBeHidden();
    await expect(region).toHaveAttribute('data-fountain-gitlab-suggestion', expandedParams); await expect.poll(() => region.locator('code').textContent()).toBe(proposal);
    const toolbar = native.getByTestId('formatting-toolbar');
    await toolbar.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(region).toHaveAttribute('data-fountain-gitlab-suggestion', initialParams);
    await expect.poll(() => region.locator('code').textContent()).toBe(prefill);
    await toolbar.getByRole('button', { name: 'Redo', exact: true }).click(); await expect(region).toHaveAttribute('data-fountain-gitlab-suggestion', expandedParams);
    observations.push('Replacement plus expanded range apply and undo/redo atomically in the actual native menu.');
    await region.focus(); await page.keyboard.press('Control+Enter'); await page.keyboard.insertText(marker);
    await expect(editor.getByText(marker, { exact: true })).toBeVisible(); await expect(form).toBeVisible();
    expect(premature).toEqual([]); expect((await request(`${base}/discussions`)).some(value => value.notes.some(note => note.body.includes(marker)))).toBe(false);
    const palette = await region.locator('code').evaluate(element => ({ background: getComputedStyle(element).backgroundColor, color: getComputedStyle(element).color, parentColor: getComputedStyle(element.parentElement).color }));
    expect(palette.background).toBe('rgba(0, 0, 0, 0)'); expect(palette.color).toBe(palette.parentColor); receipt.palette = palette;
    observations.push('Ctrl+Enter leaves source without triggering GitLab quick submit; subsequent prose remains in the draft.');
    await form.screenshot({ caret: 'initial', path: fileURLToPath(new URL('native-draft.png', output)) });
    allowSubmit = true;
    await form.getByRole('button', { name: /^(Add comment now|Comment)$/u }).click();
    let discussion;
    await expect.poll(async () => { discussion = (await request(`${base}/discussions`)).find(value => value.notes.some(note => note.body.includes(marker))); return Boolean(discussion); }, { timeout: 30000 }).toBe(true);
    const note = discussion.notes.find(value => value.body.includes(marker));
    expect(note.body).toBe('```suggestion:' + expandedParams + '\n' + proposal + '```\n\n' + marker);
    receipt.saved = { discussionId: discussion.id, noteId: note.id, body: note.body, position: note.position };
    observations.push('Normal GitLab submission persists exact native suggestion source, offsets and prose via the authenticated discussions API.');
    await page.reload(); await expect(page.getByText(marker, { exact: true })).toBeVisible({ timeout: 30000 });
    await page.screenshot({ caret: 'initial', path: fileURLToPath(new URL('posted-reader.png', output)), fullPage: true });
    await page.getByTestId('apply-suggestion-dropdown').getByRole('button', { name: 'Apply suggestion', exact: true }).click();
    const message = 'Apply Fountain native suggestion ' + suffix;
    await page.getByTestId('commit-message-field').fill(message);
    await page.getByTestId('commit-with-custom-message-button').click();
    const expected = proposal + original.split('\n').slice(3).join('\n');
    let file;
    await expect.poll(async () => { file = await request(`/api/v4/projects/${project.id}/repository/files/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(branch)}`); return Buffer.from(file.content, 'base64').toString('utf8'); }, { timeout: 30000 }).toBe(expected);
    expect(file.last_commit_id).not.toBe(commit.id);
    const appliedCommit = await request(`/api/v4/projects/${project.id}/repository/commits/${file.last_commit_id}`);
    expect(appliedCommit.message).toContain(message);
    const branchAfter = await request(`/api/v4/projects/${project.id}/repository/branches/${encodeURIComponent(branch)}`);
    expect(branchAfter.commit.id).toBe(appliedCommit.id);
    receipt.applied = { commit: appliedCommit.id, parents: appliedCommit.parent_ids, message: appliedCommit.message, content: expected, branchHead: branchAfter.commit.id };
    await page.goto(mr.web_url + '#note_' + note.id);
    await expect(page.getByText(marker, { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('applied-badge')).toBeVisible({ timeout: 30000 });
    receipt.readerRoute = 'MR overview note anchor after application; resolved Rapid Diffs gutter reopening remains a separate retained UI issue.';
    observations.push('GitLab Apply suggestion creates a real source-branch commit containing exactly the intended replacement and untouched remaining file lines.');
    await page.screenshot({ caret: 'initial', path: fileURLToPath(new URL('applied.png', output)), fullPage: true });
    expect(errors).toEqual([]);
    await writeFile(new URL('report.json', output), JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify({ kind: transport ? 'native-suggestion-transport-authoring' : 'native-suggestion-authoring', checks: observations.length, discussionId: discussion.id, noteId: note.id }));
  } catch (error) {
    receipt.failure = String(error); await page.screenshot({ path: fileURLToPath(new URL('failure.png', output)), fullPage: true }).catch(() => {});
    await writeFile(new URL('failure.json', output), JSON.stringify(receipt, null, 2) + '\n'); throw error;
  } finally { page.off('request', onRequest); }
}


export async function verifyGitLabSuggestionAfterRestart({ root, page, request, project, pin, version, transport = false }) {
  const output = new URL(transport ? 'artifacts/suggestion-transport-authoring-live-20261116/' : 'artifacts/suggestion-authoring-live-20261116/', root);
  const prior = JSON.parse(await readFile(new URL('report.json', output)));
  if (!prior.applied || prior.project.id !== project.id || prior.upstream.revision !== pin.commit) throw new Error('No matching applied suggestion receipt.');
  const base = `/api/v4/projects/${project.id}/merge_requests/${prior.mergeRequest.iid}`;
  const note = await request(`${base}/notes/${prior.saved.noteId}`); expect(note.body).toBe(prior.saved.body);
  const file = await request(`/api/v4/projects/${project.id}/repository/files/${encodeURIComponent(prior.filePath)}?ref=${encodeURIComponent(prior.branch)}`);
  expect(Buffer.from(file.content, 'base64').toString('utf8')).toBe(prior.applied.content); expect(file.last_commit_id).toBe(prior.applied.commit);
  const branch = await request(`/api/v4/projects/${project.id}/repository/branches/${encodeURIComponent(prior.branch)}`);
  expect(branch.commit.id).toBe(prior.applied.commit);
  await page.goto(prior.mergeRequest.url + '#note_' + prior.saved.noteId);
  await expect(page.getByText(prior.marker, { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('applied-badge')).toBeVisible();
  await page.screenshot({ caret: 'initial', path: fileURLToPath(new URL('after-restart.png', output)), fullPage: true });
  await writeFile(new URL('restart.json', output), JSON.stringify({ scope: 'Cold-container-restart persistence for the saved native proposal and applied source-branch commit; not review batching or full role/concurrency acceptance.',
    upstream: { revision: pin.commit, version: version.version }, mergeRequest: prior.mergeRequest, noteId: note.id, body: note.body,
    commit: file.last_commit_id, content: Buffer.from(file.content, 'base64').toString('utf8'), branchHead: branch.commit.id,
    readerAppliedVisible: true }, null, 2) + '\n');
  console.log(JSON.stringify({ kind: transport ? 'native-suggestion-transport-restart' : 'native-suggestion-restart', noteId: note.id, commit: file.last_commit_id }));
}
