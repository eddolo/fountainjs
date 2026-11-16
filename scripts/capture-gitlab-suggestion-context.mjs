import { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/** Observe real Vue props after real diff-line clicks; never inject editor state. */
export async function captureGitLabSuggestionContext({ root, page, request, project, pin, version, preview = false, transport = false }) {
  const output = new URL(transport ? 'artifacts/suggestion-transport-live-20261116/' : preview ? 'artifacts/suggestion-preview-live-20261116/' : 'artifacts/suggestion-context-live-20261116/', root); await mkdir(output, { recursive: true });
  const suffix = Date.now().toString(36), prefix = transport ? 'fountain-suggestion-transport-' : 'fountain-suggestion-context-', branch = prefix + suffix;
  const filePath = 'suggestion-' + (transport ? 'transport-' : 'context-') + suffix + '.js';
  const source = transport ? "const value = \"\\n\";\nconst value = \"\ue000\";\nconst mixed = \"\\n\ue000\";\nconst key = \"A\u200bB\";  \n\nreturn 1;\n" : 'const key = "A\u200bB";\n\n  keep();  \nreturn 1;\n// end\n';
  let mr, commit;
  const previous = await readFile(new URL(transport ? 'artifacts/suggestion-transport-live-20261116/context.json' : 'artifacts/suggestion-context-live-20261116/context.json', root), 'utf8').then(JSON.parse)
    .catch(() => readFile(new URL('setup.json', output), 'utf8').then(JSON.parse).catch(() => readFile(new URL('failure.json', output), 'utf8').then(JSON.parse).catch(() => null)));
  if (previous?.mergeRequest?.iid) {
    const candidate = await request(`/api/v4/projects/${project.id}/merge_requests/${previous.mergeRequest.iid}`);
    if (!candidate.title.startsWith(transport ? 'Fountain suggestion transport ' : 'Fountain inline suggestion context ') || !candidate.source_branch.startsWith(prefix)) throw new Error('Wrong retained context fixture');
    mr = candidate; commit = { id: candidate.sha };
  } else {
    commit = await request(`/api/v4/projects/${project.id}/repository/commits`, { branch, start_branch: project.default_branch,
      commit_message: 'Add suggestion context audit fixture', actions: [{ action: 'create', file_path: filePath, content: source }] });
    mr = await request(`/api/v4/projects/${project.id}/merge_requests`, { source_branch: branch, target_branch: project.default_branch,
      title: (transport ? 'Fountain suggestion transport ' : 'Fountain inline suggestion context ') + suffix, description: 'Isolated source/line-context probe; no suggestion application claim.' });
  }
  await writeFile(new URL('setup.json', output), JSON.stringify({ mergeRequest: { iid: mr.iid, url: mr.web_url } }, null, 2) + '\n');
  let diffs;
  // New merge requests can precede their asynchronous diff collection.
  await expect(async () => {
    diffs = await request(`/api/v4/projects/${project.id}/merge_requests/${mr.iid}/diffs`);
    expect(diffs).toHaveLength(1);
  }).toPass({ timeout: 60000, intervals: [1000, 2000, 5000] }); expect(diffs[0].new_path).toMatch(/^suggestion-(?:context|transport)-[a-z0-9]+\.js$/u);
  const actualFilePath = diffs[0].new_path;
  const branchRecord = await request(`/api/v4/projects/${project.id}/repository/branches/${encodeURIComponent(mr.source_branch)}`);
  const versions = await request(`/api/v4/projects/${project.id}/merge_requests/${mr.iid}/versions`);
  const revisions = { reportedSHA: mr.sha, diffRefs: mr.diff_refs, sourceBranch: mr.source_branch, branchHead: branchRecord.commit.id,
    versions: versions.map(value => ({ id: value.id, head: value.head_commit_sha, base: value.base_commit_sha, start: value.start_commit_sha, state: value.state })) };
  const fixtures = [], previews = [];
  try {
    const cases = transport ? [['escaped', 1], ['private-use', 2], ['mixed', 3], ['unicode', 4], ['empty', 5], ['multiline', 1, 2]] : [['unicode', 1], ['empty', 2], ['trailing-spaces', 3]];
    for (const [name, line, end = line] of cases) {
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
      if (end !== line) {
        const destination = page.locator('tr[data-hunk-lines]').filter({ has: page.locator(`[data-position="new"] [data-line-number="${end}"]`) }).first();
        await expect(toggle).toHaveAttribute('draggable', 'true');
        const from = await toggle.boundingBox(), to = await destination.locator('pre').first().boundingBox();
        if (!from || !to) throw new Error('Missing visible drag endpoints');
        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2, { steps: 4 });
        await page.mouse.move(to.x + Math.min(40, to.width / 2), to.y + to.height / 2, { steps: 12 });
        // Chromium dispatches dragover on a second move at the destination.
        await page.mouse.move(to.x + Math.min(40, to.width / 2) + 1, to.y + to.height / 2);
        await page.mouse.up();
      } else await toggle.click();
      const form = page.locator('form.common-note-form').first(); await expect(form).toBeVisible();
      const observed = await form.evaluate(element => {
        for (let current = element; current; current = current.parentElement) {
          const component = current.__vue__ ?? current.__vueParentComponent?.proxy;
          if (component?.codeSuggestionsConfig) return { context: JSON.parse(JSON.stringify(component.codeSuggestionsConfig)), renderMarkdownPath: component.renderMarkdownPath };
        }
        throw new Error('No actual NoteForm suggestion config on the opened form.');
      });
      const { context, renderMarkdownPath } = observed;
      expect(context.canSuggest).toBe(true); expect(context.lineRange).toEqual({ start: line, end });
      const rawURL = new URL(context.blobRawPath, mr.web_url); expect(rawURL.origin).toBe(new URL(project.web_url).origin);
      const raw = await page.request.get(rawURL.href); expect(raw.ok()).toBe(true);
      const rawSource = await raw.text(); expect(rawSource).toBe(source);
      const selected = source.split('\n').slice(line - 1, end);
      expect(context.lines).toEqual(transport ? selected.map(value => value.replace(/\\n/gu, '\uE000')) : selected);
      fixtures.push({ name, context, rawSource });
      if (preview) {
        if (typeof renderMarkdownPath !== 'string') throw new Error('No actual host preview URL.');
        const endpoint = new URL(renderMarkdownPath, mr.web_url); expect(endpoint.origin).toBe(new URL(project.web_url).origin);
        const cases = name === 'unicode' ? [
          ['single', '```suggestion:-0+0\nreturn 42;\n```'],
          ['literal-unicode', '```suggestion:-0+0\nconst key = "A\u200bB";\n```'],
          ['quoted', '> ```suggestion:-0+0\n> return 42;\n> ```'],
          ['nested-list', '- Review\n\n  ```suggestion:-0+0\n  return 42;\n  ```'],
        ] : name === 'empty' ? [
          ['empty', '```suggestion:-0+0\n```'], ['one-blank-line', '```suggestion:-0+0\n\n```'],
          ['two-blank-lines', '```suggestion:-0+0\n\n\n```'],
        ] : [
          ['range', '```suggestion:-1+1\nnew();\n```'], ['trailing-spaces', '```suggestion:-0+0\n  keep();  \n```'],
          ['two', '```suggestion:-0+0\nfirst();\n```\n\n```suggestion:-0+0\nsecond();\n```'],
        ];
        for (const [kind, markdown] of cases) {
          const rendered = await request(endpoint.href, { text: markdown });
          if (typeof rendered.body !== 'string') throw new Error('Missing contextual suggestion preview body.');
          previews.push({ name: kind, source: markdown, context, endpoint: endpoint.pathname + endpoint.search, body: rendered.body });
        }
      }
      await writeFile(new URL('partial-context.json', output), JSON.stringify({ mergeRequest: { iid: mr.iid, url: mr.web_url }, fixtures }, null, 2) + '\n');
      await form.screenshot({ caret: 'initial', path: fileURLToPath(new URL(name + '.png', output)) });
    }
    if (transport) {
      expect(fixtures[0].context.lines).toEqual(fixtures[1].context.lines);
      expect(source.split('\n')[0]).not.toBe(source.split('\n')[1]);
    }
    const receipt = { scope: 'Actual Rapid Diffs NoteForm context after user clicks in a real pinned MR diff; no insertion/posting/application/batching acceptance.',
      upstream: { revision: pin.commit, version: version.version, packagedRevision: version.revision },
      project: { id: project.id, path: project.path_with_namespace }, mergeRequest: { iid: mr.iid, url: mr.web_url },
      setupSHA: { source: previous?.mergeRequest?.iid ? 'merge-request-api.sha' : 'created-commit.id', value: commit.id },
      previewHeadSHAs: [...new Set(fixtures.map(fixture => fixture.context.previewParams?.head_sha).filter(Boolean))],
      filePath: actualFilePath, revisions, fixtures, ...(preview ? { previews } : {}) };
    await writeFile(new URL(preview ? 'preview.json' : 'context.json', output), JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify({ kind: 'suggestion-context', captured: fixtures.length, previews: previews.length }));
  } catch (error) {
    await page.screenshot({ path: fileURLToPath(new URL('failure.png', output)), fullPage: true }).catch(() => {});
    const dom = await page.locator('[data-new-discussion-toggle]').evaluateAll(elements => elements.map(element => ({ html: element.outerHTML, parent: element.parentElement?.tagName, hidden: element.hidden }))).catch(() => []);
    await writeFile(new URL('failure.json', output), JSON.stringify({ dom, mergeRequest: { iid: mr.iid, url: mr.web_url }, fixtures, error: String(error) }, null, 2) + '\n');
    throw error;
  }
}
