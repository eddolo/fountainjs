import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';

test('downloads complete standalone projects from the developer guide', async ({ page }, info) => {
  await page.goto('workflows.html');
  await page.getByRole('link', { name: /Download the template workspace/ }).click();
  await expect(page).toHaveURL(/developers\.html#starter-templates$/);
  await expect(page.getByRole('button', { name: 'Download template workspace' })).toBeVisible();
  await page.getByRole('link', { name: 'Download a starter' }).click();
  await expect(page.getByRole('heading', { name: 'Start with a working project.' })).toBeVisible();
  for (const { kind, label, projectFiles } of [
    { kind: 'plain-dom', label: 'Download plain DOM starter', projectFiles: ['index.html', 'main.js'] },
    { kind: 'react', label: 'Download React starter', projectFiles: ['index.html', 'main.jsx'] },
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
    expect(manifest.dependencies['fountainjs-editor']).toBe('0.5.0-beta.1');
  }
  await page.locator('#starters').screenshot({ path: info.outputPath('starter-downloads.png') });
  for (const { kind, demo, host } of [
    { kind: 'plain-dom', demo: 'plain-dom-notes', host: 'Plain DOM' },
    { kind: 'react', demo: 'react-article', host: 'React' },
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
