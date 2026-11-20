import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { compareGitLabCompatibility } from '../integrations/gitlab/testing/compatibility.mjs';
import { buildIdentityError } from '../integrations/gitlab/testing/build-identity.mjs';

export async function verifyWikiRollback({ previous, report, page, project, request, output }) {
  const writers = await Promise.all(['original','fountain'].map(async side =>
    JSON.parse(await readFile(join(previous.directory, side + '-' + previous.attempts[side], 'report.json'), 'utf8'))));
  const match = compareGitLabCompatibility(...writers);
  const restored = match.rows.filter(row => row.invariant === 'restoredSource');
  if (!match.environment.matched || !match.comparisonComplete || !restored.length ||
      restored.some(row => row.fountain !== row.expected) || buildIdentityError(report) ||
      report.side !== 'original' || report.deployment.wikiRestore || report.deployment.assetMount.length)
    throw new Error('Expected exact restored Fountain revisions and a verified stock deployment.');

  const result = report.wikiRollback = {passed:false, runId:writers[0].runId, attempts:previous.attempts, records:[]};
  const controller = 'app/controllers/concerns/wiki_actions.rb';
  for (const writer of writers) {
    expect(writer.suite).toBe(report.suite);
    expect(writer.fixtureHash).toBe(report.fixtureHash);
    expect(writer.deployment.backendMounts).toEqual(report.deployment.backendMounts);
    expect(writer.deployment.imageId).toBe(report.deployment.imageId);
    expect(writer.backend.project).toEqual(report.backend.project);
    const originalHash = writer.deployment.wikiRestore.files[controller].original;
    expect(report.backend.serverSources).toContain(originalHash + '  /opt/gitlab/embedded/service/gitlab-rails/' + controller);
    for (const item of writer.observations) {
      const slug = encodeURIComponent(item.slug);
      const api = '/api/v4/projects/' + project.id + '/wikis/' + slug;
      expect((await request(api)).content).toBe(item.restoredSource);
      await page.goto(project.web_url + '/-/wikis/' + slug);
      const reader = page.getByTestId('wiki-page-content');
      await expect(reader.locator('p').last()).toHaveText(item.input.paragraph);
      await expect(reader.locator('strong')).toHaveText(['Release team']);
      const history = page.getByTestId('page-history-button');
      if (!await history.isVisible()) await page.getByTestId('wiki-more-dropdown').getByRole('button').first().click();
      await history.click();
      const table = page.getByTestId('wiki-history-table');
      await expect(table.locator('tbody tr')).toHaveCount(item.revisions.length);
      const revisions = [];
      for (const [index,revision] of item.revisions.entries()) {
        const row = table.locator('tbody tr').nth(index);
        const url = new URL(await row.locator('a').first().getAttribute('href'), page.url());
        expect(url.searchParams.get('version_id')).toBe(revision.sha);
        await expect(row.locator('td').nth(2)).toHaveText(item.after[index].message);
        const {content} = await request(api + '?version=' + revision.sha);
        expect(content).toBe(revision.source);
        revisions.push({sha:revision.sha, sourceSHA256:createHash('sha256').update(content).digest('hex')});
      }
      await page.screenshot({path:join(output, writer.side + '-' + item.id + '-rollback.png')});
      result.records.push({writer:writer.side, slug:item.slug, revisions});
    }
  }
  result.passed = true;
}
