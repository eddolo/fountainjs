import { expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const nativeSelector = '[data-fountain-integration="native"]:visible';
async function richEditor(page, name) {
  const host = page.locator(name === 'wiki' ? 'form.wiki-form' : 'form.merge-request-form');
  const switcher = host.getByRole('button', { name: 'Switch to rich text editing', exact: true });
  await expect(async () => {
    expect(await host.locator(nativeSelector).count() > 0 || await switcher.count() > 0).toBe(true);
  }).toPass();
  if (await switcher.isVisible()) await switcher.click();
  const native = host.locator(nativeSelector);
  await expect(native).toHaveCount(1);
  const editor = native.locator('.fountain-editor[contenteditable="true"]');
  await expect(editor).toBeVisible();
  await expect(native.getByTestId('content-editor-error')).toHaveCount(0);
  return { host, native, editor, toolbar: native.getByTestId('formatting-toolbar') };
}

async function appendRich({ page, output, report, name, marker }) {
  const { host, native, editor, toolbar } = await richEditor(page, name);
  await expect(editor).toContainText('End of workflow notes.');
  await expect(editor.locator('table')).toHaveCount(1);
  await expect(editor.locator('h1')).toContainText('Release review');
  const math = editor.locator('.katex-mathml');
  await expect(math).toHaveCount(1);
  await expect(math).toHaveCSS('position', 'absolute');
  const projection = await math.evaluate(el => ({ width: el.getBoundingClientRect().width,
    height: el.getBoundingClientRect().height, clip: getComputedStyle(el).clip, position: getComputedStyle(el).position }));
  expect(projection.width).toBeLessThanOrEqual(1); expect(projection.height).toBeLessThanOrEqual(1);
  (report.workflows.mathProjection ??= []).push({ name, ...projection });
  const image = editor.getByRole('img', { name: 'Workflow figure', exact: true });
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate(el => el.complete && el.naturalWidth > 0)).toBe(true);
  await editor.getByText('End of workflow notes.', { exact: true }).click();
  await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await editor.pressSequentially(marker);
  await page.keyboard.press('Home'); await page.keyboard.press('Shift+End');
  await toolbar.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(editor.locator('strong')).toContainText(['Review carefully', marker]);
  await page.screenshot({ path: fileURLToPath(new URL(`${name}-author.png`, output)), fullPage: true });
  // Switch through the real host; submitting this source would hide rich-editor submit defects.
  await native.getByRole('button', { name: 'Switch to plain text editing', exact: true }).click();
  const source = host.locator('textarea.markdown-area:visible');
  await expect(source).toHaveCount(1);
  expect(await source.inputValue()).toContain(`**${marker}**`);
  await host.getByRole('button', { name: 'Switch to rich text editing', exact: true }).click();
  const reopened = (await richEditor(page, name)).editor;
  await expect(reopened).toContainText(marker);
  await reopened.getByText(marker, { exact: true }).click();
  await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await page.keyboard.insertText(`${name}: final rich edit.`);
  // Caller submits immediately, without a source handoff or observer-delay wait.
}

export async function auditNativeWorkflows({ page, api, project, upload, report, output }) {
  const suffix = Date.now().toString(36);
  const projectAPI = `/projects/${project.id}`;
  expect(typeof upload.full_path).toBe('string');
  const imageURL = new URL(upload.full_path, project.web_url).href;
  expect((await page.request.get(imageURL)).ok()).toBe(true);
  const source = '# Release review\n\n**Review carefully** before merging.\n\n- [ ] Verify deployment\n- [ ] Review migration\n\n| Check | Result |\n| --- | --- |\n| Persistence | Pending |\n\nInline math $`a^2 + b^2 = c^2`$.\n\n' +
    `![Workflow figure](${imageURL})\n\nEnd of workflow notes.\n`;
  const branch = `fountain-workflow-${suffix}`;
  const commit = await api('POST', `${projectAPI}/repository/commits`, { data: {
    branch, start_branch: project.default_branch, commit_message: 'Add release review audit fixture',
    actions: [{ action: 'create', file_path: `workflow-${suffix}.md`, content: 'Release review fixture.\n' }],
  } });
  const mr = await api('POST', `${projectAPI}/merge_requests`, { data: {
    source_branch: branch, target_branch: project.default_branch,
    title: `Fountain release review ${suffix}`, description: source,
  } });
  report.workflows = { commit: commit.id, mergeRequest: { iid: mr.iid, url: mr.web_url, original: source }, phases: [] };
  await page.goto(`${mr.web_url}/edit`);
  const mrMarker = 'Fountain merge request: rich changes survive submission.';
  await appendRich({ page, output, report, name: 'merge-request', marker: mrMarker });
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page).toHaveURL(mr.web_url);
  const savedMR = await api('GET', `${projectAPI}/merge_requests/${mr.iid}`);
  expect(savedMR.description).toContain(`**${mrMarker}**`);
  expect(savedMR.description).toContain('Review carefully');
  expect(savedMR.description).toContain('merge-request: final rich edit.');
  report.workflows.mergeRequest.saved = savedMR.description;
  report.workflows.mergeRequest.marker = mrMarker;
  await expect(page.getByText(mrMarker, { exact: true })).toBeVisible();
  await page.screenshot({ path: fileURLToPath(new URL('merge-request-saved.png', output)), fullPage: true });
  await page.goto(`${mr.web_url}/edit`);
  await expect((await richEditor(page, 'merge-request')).editor).toContainText(mrMarker);
  await page.getByRole('link', { name: 'Cancel', exact: true }).click();
  report.checks.push('Actual merge-request form edits in Fountain, switches rich/source modes, saves from rich mode and reopens the persisted description');

  const wikiTitle = `Fountain-release-${suffix}`;
  const wiki = await api('POST', `${projectAPI}/wikis`, { data: { title: wikiTitle, content: source, format: 'markdown' } });
  const wikiURL = `${project.web_url}/-/wikis/${wiki.slug}`;
  report.workflows.wiki = { slug: wiki.slug, url: wikiURL, original: source };
  await page.goto(`${wikiURL}/edit`);
  const wikiMarker = 'Fountain wiki: rich changes survive submission.';
  await appendRich({ page, output, report, name: 'wiki', marker: wikiMarker });
  await page.getByTestId('wiki-submit-button').click();
  const confirm = page.getByTestId('wiki-confirm-message');
  await expect(async () => expect(page.url() === wikiURL || await confirm.isVisible()).toBe(true)).toPass();
  if (await confirm.isVisible()) {
    await page.getByTestId('wiki-message-textbox').fill('Verify Fountain rich editor persistence');
    await confirm.click();
  }
  await expect(page).toHaveURL(wikiURL);
  const savedWiki = await api('GET', `${projectAPI}/wikis/${encodeURIComponent(wiki.slug)}`);
  expect(savedWiki.content).toContain(`**${wikiMarker}**`);
  expect(savedWiki.content).toContain('wiki: final rich edit.');
  report.workflows.wiki.saved = savedWiki.content;
  report.workflows.wiki.marker = wikiMarker;
  await expect(page.getByText(wikiMarker, { exact: true })).toBeVisible();
  await page.screenshot({ path: fileURLToPath(new URL('wiki-saved.png', output)), fullPage: true });
  await page.goto(`${wikiURL}/edit`);
  await expect((await richEditor(page, 'wiki')).editor).toContainText(wikiMarker);
  await page.getByTestId('wiki-cancel-button').click();
  report.checks.push('Actual wiki form edits in Fountain, switches rich/source modes, saves from rich mode and reopens the persisted page');
  await assertSavedNativeWorkflows({ page, api, project, report, output, phase: 'reopened' });
}

export async function assertSavedNativeWorkflows({ page, api, project, report, output, phase }) {
  for (const [name, item] of [['merge-request', report.workflows.mergeRequest], ['wiki', report.workflows.wiki]]) {
    const path = name === 'wiki' ? `wikis/${encodeURIComponent(item.slug)}` : `merge_requests/${item.iid}`;
    const saved = await api('GET', `/projects/${project.id}/${path}`);
    expect(name === 'wiki' ? saved.content : saved.description).toBe(item.saved);
    await page.goto(item.url);
    await expect(page.getByText(item.marker, { exact: true })).toBeVisible();
    const body = page.locator(name === 'wiki' ? '.js-wiki-page-content.md' : '.description .md').first();
    await expect(body).toBeVisible();
    await expect(body.locator('table')).toHaveCount(1);
    await expect(body.locator('.katex')).toBeVisible();
    const image = body.getByRole('img', { name: 'Workflow figure', exact: true });
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(el => el.complete && el.naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: fileURLToPath(new URL(`${name}-${phase}.png`, output)), fullPage: true });
  }
  report.workflows.phases.push(phase);
  report.checks.push(`Saved merge-request and wiki Markdown remain exact, with bold edits, tables, math and decoded images in the actual readers (${phase})`);
}
