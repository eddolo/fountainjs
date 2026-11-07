import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';

test('downloads complete standalone projects from the developer guide', async ({ page }, info) => {
  await page.goto('developers.html');
  await page.getByRole('link', { name: 'Download a starter' }).click();
  await expect(page.getByRole('heading', { name: 'Run your first editor.' })).toBeVisible();
  for (const { kind, label, entry } of [
    { kind: 'plain-dom', label: 'Download plain DOM starter', entry: 'main.js' },
    { kind: 'react', label: 'Download React starter', entry: 'main.jsx' },
  ]) {
    const name = `fountainjs-${kind}`;
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: label }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe(`${name}.zip`);
    const zipPath = info.outputPath(download.suggestedFilename());
    await download.saveAs(zipPath);
    const files = unzipSync(await readFile(zipPath));
    const expected = ['README.md', 'index.html', entry, 'package.json'];
    expect(Object.keys(files).sort()).toEqual(expected.map(file => `${name}/${file}`).sort());
    for (const file of expected) {
      expect(strFromU8(files[`${name}/${file}`])).toBe(await readFile(`examples/starters/${kind}/${file}`, 'utf8'));
    }
    const manifest = JSON.parse(strFromU8(files[`${name}/package.json`]));
    expect(manifest.dependencies['fountainjs-editor']).toBe('0.4.0-beta.2');
  }
  await page.locator('#starters').screenshot({ path: info.outputPath('starter-downloads.png') });
  for (const { kind, demo, host } of [
    { kind: 'plain-dom', demo: 'plain-dom-notes', host: 'Plain DOM' },
    { kind: 'react', demo: 'react-article', host: 'React' },
  ]) {
    await page.goto(`demos/${demo}.html`);
    await page.getByRole('link', { name: `Get the ${host} starter` }).click();
    await expect(page).toHaveURL(new RegExp(`developers\\.html#starter-${kind}$`));
    await expect(page.locator(`#starter-${kind}`).getByRole('button', { name: /download/i })).toBeVisible();
  }
});
