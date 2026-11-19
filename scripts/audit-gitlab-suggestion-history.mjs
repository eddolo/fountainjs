import { expect } from '@playwright/test';
import { join } from 'node:path';

export async function inspectSuggestionHistory({ page, ui, request, input, fixture, result, mr, base, note, branch, project, fileURL, output, stage }) {
  const reader = page.locator('#note_' + note.id);
  const api = base + '/notes/' + note.id;
  const original = result.afterProseNote.body;
  const marker = fixture.marker + fixture.proseSuffix;
  const proposal = original.slice(0, original.lastIndexOf(marker)).trimEnd();
  const firstLine = proposal.split('\n')[0];
  if (!/^\x60{3}suggestion(?:[-+:0-9]*)$/u.test(firstLine) || !proposal.endsWith('\n```')) throw new Error('Unexpected authored suggestion fence.');
  const fence = (text, opening = firstLine) => [opening, text, '```'].join('\n');
  const second = fence(fixture.comparisonProposal), changed = fence(fixture.changedProposal);
  const body = (...proposals) => [...proposals, marker].join('\n\n');
  const headURL = '/api/v4/projects/' + project.id + '/repository/branches/' + encodeURIComponent(branch);
  const snapshot = async () => {
    const saved = await request(api), file = await request(fileURL);
    return { body: saved.body, suggestions: saved.suggestions.map(({ id, applied, appliable, from_content, to_content }) =>
      ({ id, applied, appliable, from_content, to_content })), head: (await request(headURL)).commit.id, file: file.content };
  };
  const evidence = result.history = { initial: await snapshot(), phases: {} };
  const edit = async (name, text, ambiguous = false) => {
    await stage('history-' + name);
    const form = reader.locator('form.common-note-form');
    let field = form.locator('textarea.markdown-area:visible');
    if (name === 'change' && evidence.phases.duplicate?.status === 422) {
      await expect(field).toHaveValue(evidence.phases.duplicate.submitted);
    } else {
      await page.goto(mr.web_url + '#note_' + note.id);
      await reader.getByRole('button', { name: /^Edit comment(?:,|$)/u }).click();
      const surface = await ui.rich(form);
      await expect(surface.code.first()).toBeVisible();
      field = await ui.source(form);
    }
    await expect.poll(() => field.inputValue(), { timeout: 15000 }).toContain(marker);
    await field.fill(text);
    const response = page.waitForResponse(res => ['PUT','PATCH','POST'].includes(res.request().method())
      && new URL(res.url()).origin === new URL(mr.web_url).origin
      && (new URL(res.url()).pathname.split('/').slice(-2).join('/').replace(/\.json$/u, '') === 'notes/' + note.id
        || (new URL(res.url()).pathname.endsWith('/graphql') && (res.request().postData() || '').includes('updateNote'))), { timeout: 30000 });
    await form.getByRole('button', { name: 'Save comment', exact: true }).click();
    const res = await response;
    const observed = evidence.phases[name] = { submitted: text, status: res.status() };
    if (!ambiguous || res.ok()) {
      await expect.poll(async () => (await request(api)).body, { timeout: 15000 }).toBe(text);
    } else {
      await res.finished();
      await expect(form.getByRole('button', { name: 'Save comment', exact: true })).toBeEnabled({ timeout: 10000 });
      observed.draft = await field.isVisible() ? await field.inputValue() : null;
      observed.serverMessage = (await res.text()).includes('identical applied suggestions ambiguous');
      const explanation = page.getByText(/identical applied suggestions ambiguous/i).first();
      observed.visibleError = await explanation.isVisible();
      await page.screenshot({ path: join(output, input.id + '-duplicate-response.png'), animations: 'disabled' });
      if (observed.visibleError) {
        observed.errorInitiallyOnscreen = await explanation.evaluate(element => {
          const box = element.getBoundingClientRect();
          return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
        });
        await explanation.scrollIntoViewIfNeeded();
        await explanation.screenshot({ path: join(output, input.id + '-duplicate-explanation.png'), animations: 'disabled' });
      }
    }
    observed.saved = await snapshot();
  };
  await edit('add', body(second, proposal));
  if (input.outdatedHistory) {
    await stage('change-target-on-branch');
    const commit = await request('/api/v4/projects/' + project.id + '/repository/commits', { branch,
      commit_message: 'Revise target after the first suggestion was applied', actions: [{ action: 'update', file_path: input.filePath,
        content: input.remoteSource, last_commit_id: result.appliedCommit.id }] });
    expect(commit.parent_ids).toEqual([result.appliedCommit.id]);
    await expect.poll(async () => (await request(base)).diff_refs?.head_sha, { timeout: 60000 }).toBe(commit.id);
    const pendingId = evidence.phases.add.saved.suggestions.find(s => s.to_content === fixture.comparisonProposal + '\n').id;
    await expect.poll(async () => (await request(api)).suggestions.find(s => s.id === pendingId)?.appliable, { timeout: 60000 }).toBe(false);
    evidence.outdatedBefore = await snapshot();
    evidence.competingCommit = { id: commit.id, parents: commit.parent_ids };
    await edit('outdated', body(second, proposal) + fixture.outdatedSuffix);
    await page.reload();
    await expect(reader.getByText(marker + fixture.outdatedSuffix, { exact: true })).toBeVisible();
    evidence.finalBadges = await reader.getByTestId('applied-badge').count();
    await reader.screenshot({ path: join(output, input.id + '-outdated-review.png'), animations: 'disabled' });
    return;
  }
  await edit('reorder', body(proposal, second));
  await edit('duplicate', body(proposal, proposal, second), true);
  await edit('change', body(changed, second));
  await edit('range', body(changed, fence(fixture.comparisonProposal, '```suggestion:-0+1')));
  await page.goto(mr.web_url + '#note_' + note.id);
  await expect(reader.getByText(marker, { exact: true })).toBeVisible();
  evidence.finalBadges = await reader.getByTestId('applied-badge').count();
  await reader.screenshot({ path: join(output, input.id + '-changed-review.png'), animations: 'disabled' });
}
