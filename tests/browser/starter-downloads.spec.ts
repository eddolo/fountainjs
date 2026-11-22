import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';

test('opens the homepage at the requested section while the embedded editors initialize', async ({ page }) => {
  for (const fragment of ['', '#review', '#collaboration']) {
    await page.goto('about:blank');
    await page.goto('./' + fragment);
    await expect(page.getByRole('textbox', { name: 'Tracked changes demo editor' })).toBeAttached();
    await expect(page.getByRole('textbox', { name: 'Grace collaborative editor' })).toBeAttached();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    if (fragment) {
      await expect(page.locator(fragment + ' h2').first()).toBeInViewport();
    } else {
      await expect(page.locator('#top h1')).toBeInViewport();
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    }
    expect(await page.evaluate(() => !!document.activeElement?.closest('[contenteditable=true]'))).toBe(false);
  }
});

test('keeps site navigation in place and follows the visible home section', async ({ page }) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('./');
    const nav = page.getByRole('navigation', { name: 'Primary navigation' });
    const sections = page.getByRole('navigation', { name: 'Homepage sections' });
    const banner = page.getByRole('complementary', { name: 'Website build information' });
    const home = nav.getByRole('link', { name: 'Home', exact: true });
    const demos = nav.getByRole('link', { name: 'Demos', exact: true });
    await page.evaluate(() => document.fonts.ready);
    await expect(home).toHaveAttribute('aria-current', 'page');
    const position = await demos.boundingBox();
    await sections.getByRole('link', { name: 'Open source' }).click();
    await expect(sections.getByRole('link', { name: 'Open source' })).toHaveAttribute('aria-current', 'location');
    await expect(home).not.toHaveAttribute('aria-current');
    await page.locator('#what').evaluate(el => window.scrollTo(0, scrollY + el.getBoundingClientRect().top));
    await expect(sections.getByRole('link', { name: 'What it is' })).toHaveAttribute('aria-current', 'location');
    expect((await banner.boundingBox())!.y).toBe(0);
    await demos.click();
    await expect(demos).toHaveAttribute('aria-current', 'page');
    await page.evaluate(() => document.fonts.ready);
    const destination = await demos.boundingBox();
    expect(Math.abs(position!.x - destination!.x)).toBeLessThan(2);
    expect(Math.abs(position!.y - destination!.y)).toBeLessThan(2);
    await sections.getByRole('link', { name: 'Review' }).click();
    await expect(sections.getByRole('link', { name: 'Review' })).toHaveAttribute('aria-current', 'location');
    expect((await banner.boundingBox())!.y).toBe(0);
  }
});

test('opens the GitLab showcase, compares saved records and edits the native composers independently', async ({ page }, info) => {
  await page.goto('./demos.html');
  await page.getByRole('link', { name: 'Explore the GitLab integration' }).click();
  await expect(page.getByRole('heading', { name: 'FountainJS inside GitLab' })).toBeVisible();
  await expect.poll(() => page.locator('.gl-cover img').evaluate(el => (el as HTMLImageElement).naturalWidth)).toBe(1280);
  await page.screenshot({ path: info.outputPath('gitlab-integration-desktop.png') });
  for (const name of ['Merge requests', 'Collaborative wikis', 'Deployment & rollback', 'Issues']) {
    await page.getByRole('button', { name, exact: true }).click();
    const image = page.getByRole('link', { name: 'Open full-size GitLab capture' }).locator('img');
    await expect.poll(() => image.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(100);
  }
  await page.getByRole('button', { name: 'Stock GitLab' }).click();
  await expect(page.locator('.gl-result figure img')).toHaveAttribute('alt', /stock issue/i);
  const video = page.getByLabel('GitLab quick-action recording');
  await video.evaluate(el => (el as HTMLVideoElement).load());
  await expect.poll(() => video.evaluate(el => (el as HTMLVideoElement).duration)).toBeGreaterThan(200);
  await page.getByRole('button', { name: 'Open both editors' }).click();
  const tasks = page.locator('.gl-composer').filter({ has: page.getByRole('heading', { name: 'Release checklist' }) });
  const notes = page.locator('.gl-composer').filter({ has: page.getByRole('heading', { name: 'Handoff notes' }) });
  await tasks.locator('[data-fountain-task-toggle]').first().click();
  await tasks.getByText('Inspect GitLab Markdown').click();
  await expect(tasks.locator('pre')).toContainText('- [x] Verify deployment');
  const editor = notes.getByRole('textbox', { name: 'Handoff notes editor' });
  await editor.locator('p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' Ready for review.');
  await notes.getByText('Inspect GitLab Markdown').click();
  await expect(notes.locator('pre')).toContainText('Ready for review.');
  await tasks.getByRole('button', { name: 'Undo' }).click();
  await expect(tasks.locator('pre')).toContainText('- [ ] Verify deployment');
  await expect(notes.locator('pre')).toContainText('Ready for review.');
  await notes.getByRole('button', { name: 'Undo' }).click();
  await expect(notes.locator('pre')).not.toContainText('Ready for review.');
  await tasks.getByRole('button', { name: 'Redo' }).click();
  await expect(tasks.locator('pre')).toContainText('- [x] Verify deployment');
  await page.locator('.gl-live').screenshot({ path: info.outputPath('gitlab-live-composers.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'FountainJS', exact: true }).click();
  await page.locator('.gl-evidence').screenshot({ path: info.outputPath('gitlab-issue-mobile.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});

test('downloads complete standalone projects from the developer guide', async ({ page }, info) => {
  const publishedStarter = JSON.parse(await readFile('examples/starters/published-version.json', 'utf8'));
  const hiddenAssets = new Set<string>();
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.includes('/assets/') && path.split('/').some(segment => segment.startsWith('.')))
      hiddenAssets.add(path);
  });
  await page.goto('workflows.html');
  await page.getByRole('link', { name: /Download the template workspace/ }).click();
  await expect(page).toHaveURL(/developers\.html#starter-templates$/);
  await expect(page.getByRole('button', { name: 'Download template workspace' })).toBeVisible();
  await page.getByRole('link', { name: 'Download a starter' }).click();
  await expect(page.getByRole('heading', { name: 'Start with a working project.' })).toBeVisible();
  for (const { kind, label, projectFiles } of [
    { kind: 'plain-dom', label: 'Download plain DOM starter', projectFiles: ['index.html', 'main.js'] },
    { kind: 'react', label: 'Download React starter', projectFiles: ['index.html', 'main.jsx'] },
    { kind: 'vue', label: 'Download Vue starter', projectFiles: ['index.html', 'main.js', 'vite.vue.config.js', 'ReviewForm.vue'] },
    { kind: 'node', label: 'Download Node.js starter', projectFiles: ['convert.mjs', 'sample.md'] },
    { kind: 'templates', label: 'Download template workspace', projectFiles: ['.gitignore','index.html','main.js','inline-fields.mjs','model.mjs','server.mjs','style.css','workflow.test.mjs'] },
  ]) {
    const name = `fountainjs-${kind}`;
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: label }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe(`${name}.zip`);
    const zipPath = info.outputPath(download.suggestedFilename());
    await download.saveAs(zipPath);
    const files = unzipSync(await readFile(zipPath));
    const expected = ['README.md', 'package.json', ...projectFiles];
    expect(Object.keys(files).sort()).toEqual(expected.map(file => `${name}/${file}`).sort());
    for (const file of expected) {
      expect(strFromU8(files[`${name}/${file}`])).toBe(await readFile(`examples/starters/${kind}/${file}`, 'utf8'));
    }
    const manifest = JSON.parse(strFromU8(files[`${name}/package.json`]));
    expect(manifest.dependencies['fountainjs-editor']).toBe(publishedStarter.version);
  }
  expect([...hiddenAssets], 'GitHub Pages omits dot-prefixed build assets').toEqual([]);
  await page.locator('#starters').screenshot({ path: info.outputPath('starter-downloads.png') });
  for (const { kind, demo, host } of [
    { kind: 'plain-dom', demo: 'plain-dom-notes', host: 'Plain DOM' },
    { kind: 'react', demo: 'react-article', host: 'React' },
    { kind: 'vue', demo: 'vue-runbook', host: 'Vue' },
    { kind: 'node', demo: 'node-markdown', host: 'Node.js' },
  ]) {
    await page.goto(`demos/${demo}.html`);
    await page.getByRole('link', { name: `Get the ${host} starter` }).click();
    await expect(page).toHaveURL(new RegExp(`developers\\.html#starter-${kind}$`));
    await expect(page.locator(`#starter-${kind}`).getByRole('button', { name: /download/i })).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const nodeStarter = page.locator('#starter-node');
  await nodeStarter.scrollIntoViewIfNeeded();
  await expect(nodeStarter.getByRole('button', { name: 'Download Node.js starter' })).toBeInViewport();
  const card = await nodeStarter.boundingBox();
  expect(card?.x).toBeGreaterThanOrEqual(0);
  expect(card!.x + card!.width).toBeLessThanOrEqual(390);
  await nodeStarter.screenshot({ path: info.outputPath('node-starter-narrow.png') });
});
