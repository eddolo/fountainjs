import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { buildIdentityError } from '../integrations/gitlab/testing/build-identity.mjs';
import { compareGitLabCompatibility } from '../integrations/gitlab/testing/compatibility.mjs';

// Read records created by both repaired deployments using the packaged GitLab UI and API.
export async function verifySuggestionHistoryRollback({ previous, report, page, project, request, output, readCommits }) {
  const writers = await Promise.all(['original','fountain'].map(async side =>
    JSON.parse(await readFile(join(previous.directory, side + '-' + previous.attempts[side], 'report.json'), 'utf8'))));
  const match = compareGitLabCompatibility(...writers);
  if (!match.environment.matched || !match.comparisonComplete || report.side !== 'original' || buildIdentityError(report) ||
      report.deployment.suggestionHistory || report.deployment.assetMount.length) throw new Error('Expected a matched repaired pair and verified packaged stock reader.');
  const evidence = report.suggestionHistoryRollback = { passed: false, runId: writers[0].runId, attempts: previous.attempts, records: [] };
  for (const writer of writers) {
    const receipt = writer.deployment.suggestionHistory;
    expect(writer.suite).toBe('review-history');
    expect(writer.collectionComplete).toBe(true);
    expect(writer.fixtureHash).toBe(report.fixtureHash);
    expect(writer.deployment.imageId).toBe(report.deployment.imageId);
    expect(writer.deployment.backendMounts).toEqual(report.deployment.backendMounts);
    expect(writer.backend.project).toEqual(report.backend.project);
    for (const [file, digest] of Object.entries(receipt.files)) {
      expect(report.backend.serverSources).toContain(digest.original + '  /opt/gitlab/embedded/service/gitlab-rails/' + file);
    }
    for (const input of writer.fixture.cases) {
      const observation = writer.observations.find(item => item.id === input.id);
      const saved = observation.history.phases[input.outdatedHistory ? 'outdated' : 'range'].saved;
      const iid = observation.setup.mergeRequest.iid, id = observation.appliedNote.id;
      const base = '/api/v4/projects/' + project.id;
      const mr = await request(base + '/merge_requests/' + iid);
      expect(mr.source_branch).toBe(observation.setup.branch);
      const note = await request(base + '/merge_requests/' + iid + '/notes/' + id);
      const file = await request(base + '/repository/files/' + encodeURIComponent(input.filePath) + '?ref=' + encodeURIComponent(mr.source_branch));
      const head = await request(base + '/repository/branches/' + encodeURIComponent(mr.source_branch));
      expect(note.body).toBe(saved.body);
      const suggestions = note.suggestions.map(({ id, applied, appliable, from_content, to_content }) => ({ id, applied, appliable, from_content, to_content }));
      expect(suggestions).toEqual(saved.suggestions);
      const appliedCommits = readCommits(id);
      expect(appliedCommits).toEqual(suggestions.map(s => ({id: s.id, commit: s.applied ? observation.appliedCommit.id : null})));
      expect(file.content).toBe(saved.file);
      expect(head.commit.id).toBe(saved.head);
      await page.goto('http://127.0.0.1:5080/' + project.path_with_namespace + '/-/merge_requests/' + iid + '#note_' + id);
      const reader = page.locator('#note_' + id);
      await expect(reader.getByText(saved.body.split('\n').at(-1), { exact: true })).toBeVisible();
      const badges = suggestions.filter(item => item.applied).length;
      await expect(reader.getByTestId('applied-badge')).toHaveCount(badges);
      await reader.screenshot({path: join(output, 'rollback-' + writer.side + '-' + input.id + '.png'), animations: 'disabled'});
      evidence.records.push({writer: writer.side, editorBuild: writer.buildIdentity.expected, case: input.id, iid, note: id,
        suggestions, appliedCommits, badges, head: head.commit.id, bodyAndFileVerified: true});
    }
  }
  evidence.passed = true;
}
