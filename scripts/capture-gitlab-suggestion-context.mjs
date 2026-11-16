import { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/** Observe real Vue props after real diff-line clicks; never inject editor state. */
export async function captureGitLabSuggestionContext({ root, page, request, project, pin, version }) {
  const output = new URL('artifacts/suggestion-context-live-20261116/', root); await mkdir(output, { recursive: true });
  const suffix = Date.now().toString(36), branch = 'fountain-suggestion-context-' + suffix;
  const filePath = 'suggestion-context-' + suffix + '.js';
  const source = 'const key = "A\u200bB";\n\n  keep();  \nreturn 1;\n// end\n';
  let mr, commit;
  const previous = await readFile(new URL('failure.json', output), 'utf8').then(JSON.parse).catch(() => null);
  if (previous?.mergeRequest?.iid) {
    const candidate = await request(`/api/v4/projects/${project.id}/merge_requests/${previous.mergeRequest.iid}`);
    if (!candidate.title.startsWith('Fountain inline suggestion context ') || !candidate.source_branch.startsWith('fountain-suggestion-context-')) throw new Error('Wrong retained context fixture');
    mr = candidate; commit = { id: candidate.sha };
  } else {
    commit = await request(`/api/v4/projects/${project.id}/repository/commits`, { branch, start_branch: project.default_branch,
      commit_message: 'Add suggestion context audit fixture', actions: [{ action: 'create', file_path: filePath, content: source }] });
    mr = await request(`/api/v4/projects/${project.id}/merge_requests`, { source_branch: branch, target_branch: project.default_branch,
      title: 'Fountain inline suggestion context ' + suffix, description: 'Isolated source/line-context probe; no suggestion application claim.' });
  }
  const diffs = await request(`/api/v4/projects/${project.id}/merge_requests/${mr.iid}/diffs`);
  expect(diffs).toHaveLength(1); expect(diffs[0].new_path).toMatch(/^suggestion-context-[a-z0-9]+\.js$/u);
  const actualFilePath = diffs[0].new_path;
  const fixtures = [];
  try {
    for (const [name, line] of [['unicode', 1], ['empty', 2], ['trailing-spaces', 3]]) {
      await page.goto(mr.web_url + '/diffs');
      console.log(JSON.stringify({ kind: 'suggestion-context', stage: 'opening-rapid-line', name, line }));
      const row = page.locator('tr[data-hunk-lines]').filter({ has: page.locator(`[data-position="new"] [data-line-number="${line}"]`) }).first();
      await expect(row).toBeVisible({ timeout: 60000 });
      const toggle = page.locator('[data-new-discussion-toggle]');
      // Server-rendered rows precede the hover adapter. Retry real pointer
      // entry after hydration; never remove hidden or synthesize host state.
      await expect(async () => {
        await page.mouse.move(10, 10);
        await row.locator(`[data-line-number="${line}"]`).first().hover();
        await expect(toggle).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: 30000, intervals: [500, 1000, 2000] });
      await toggle.click();
      const form = page.locator('form.common-note-form').first(); await expect(form).toBeVisible();
      const context = await form.evaluate(element => {
        for (let current = element; current; current = current.parentElement) {
          const component = current.__vue__ ?? current.__vueParentComponent?.proxy;
          if (component?.codeSuggestionsConfig) return JSON.parse(JSON.stringify(component.codeSuggestionsConfig));
        }
        throw new Error('No actual NoteForm suggestion config on the opened form.');
      });
      expect(context.canSuggest).toBe(true); expect(context.lineRange).toEqual({ start: line, end: line });
      const rawURL = new URL(context.blobRawPath, mr.web_url); expect(rawURL.origin).toBe(new URL(project.web_url).origin);
      const raw = await page.request.get(rawURL.href); expect(raw.ok()).toBe(true);
      const rawSource = await raw.text(); expect(rawSource).toBe(source);
      expect(context.lines).toEqual([source.split('\n')[line - 1]]);
      fixtures.push({ name, context, rawSource });
      await writeFile(new URL('partial-context.json', output), JSON.stringify({ mergeRequest: { iid: mr.iid, url: mr.web_url }, fixtures }, null, 2) + '\n');
      await form.screenshot({ caret: 'initial', path: fileURLToPath(new URL(name + '.png', output)) });
    }
    const receipt = { scope: 'Actual Rapid Diffs NoteForm context after user clicks in a real pinned MR diff; no insertion/posting/application/batching acceptance.',
      upstream: { revision: pin.commit, version: version.version, packagedRevision: version.revision },
      project: { id: project.id, path: project.path_with_namespace }, mergeRequest: { iid: mr.iid, url: mr.web_url },
      setupSHA: { source: previous?.mergeRequest?.iid ? 'merge-request-api.sha' : 'created-commit.id', value: commit.id },
      previewHeadSHAs: [...new Set(fixtures.map(fixture => fixture.context.previewParams?.head_sha).filter(Boolean))],
      filePath: actualFilePath, fixtures };
    await writeFile(new URL('context.json', output), JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify({ kind: 'suggestion-context', captured: fixtures.length }));
  } catch (error) {
    await page.screenshot({ path: fileURLToPath(new URL('failure.png', output)), fullPage: true }).catch(() => {});
    const dom = await page.locator('[data-new-discussion-toggle]').evaluateAll(elements => elements.map(element => ({ html: element.outerHTML, parent: element.parentElement?.tagName, hidden: element.hidden }))).catch(() => []);
    await writeFile(new URL('failure.json', output), JSON.stringify({ dom, mergeRequest: { iid: mr.iid, url: mr.web_url }, fixtures, error: String(error) }, null, 2) + '\n');
    throw error;
  }
}
