import { expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';

const assets = new URL('../artifacts/gitlab-media-test-assets/', import.meta.url);
export async function auditNativeMedia({ page, context, editor, toolbar, output, report }) {
  const menu = page.getByRole('group', { name: 'Media controls' });
  const dialog = () => page.getByRole('dialog', { name: 'Media properties', exact: true });
  const screenshot = name => page.screenshot({ path: fileURLToPath(new URL(name, output)), fullPage: true, caret: 'initial' });
  const place = async () => {
    await editor.getByText('Recovered paste', { exact: true }).click();
    await page.keyboard.press('End'); await page.keyboard.press('Enter');
    const bold = toolbar.getByRole('button', { name: 'Bold', exact: true });
    if (await bold.getAttribute('aria-pressed') === 'true') await bold.click();
  };
  const choose = async (button, name) => {
    const picked = page.waitForEvent('filechooser'); await button.click();
    await (await picked).setFiles(fileURLToPath(new URL(name, assets)));
  };
  const properties = async () => {
    await menu.getByRole('button', { name: 'Edit media properties', exact: true }).click();
    await expect(dialog()).toBeVisible(); await expect(dialog()).toHaveCSS('opacity', '1');
  };
  const apply = async () => {
    await dialog().getByRole('button', { name: 'Apply media changes', exact: true }).click();
    await expect(dialog()).toHaveCount(0); await expect(page.locator('.modal:visible')).toHaveCount(0);
  };
  await place(); await choose(toolbar.getByRole('button', { name: 'Attach a file or image', exact: true }), 'fountain-figure.png');
  const image = editor.locator('img[src*="/fountain-figure.png"]');
  await expect(image).toBeVisible(); await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth === 320)).toBe(true);
  const originalAlt = await image.getAttribute('alt');
  await image.click(); await properties();
  const canonical = await dialog().getByRole('textbox', { name: 'Media URL', exact: true }).inputValue();
  expect(canonical).toMatch(/^\/uploads\//u);
  await dialog().getByRole('textbox', { name: 'Media width', exact: true }).fill('2em');
  await dialog().getByRole('button', { name: 'Apply media changes', exact: true }).click();
  await expect(dialog().getByRole('alert')).toContainText('pixel size');
  await expect(image).toHaveAttribute('alt', originalAlt);
  await dialog().getByRole('textbox', { name: 'Media description', exact: true }).fill('Reviewed media figure');
  await dialog().getByRole('textbox', { name: 'Media title', exact: true }).fill('Source-preserved image title');
  await dialog().getByRole('textbox', { name: 'Media width', exact: true }).fill('240');
  await apply(); await expect(image).toHaveAttribute('alt', 'Reviewed media figure');
  expect((await image.boundingBox()).width).toBe(240);
  await toolbar.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(image).toHaveAttribute('alt', originalAlt);
  await toolbar.getByRole('button', { name: 'Redo', exact: true }).click(); await expect(image).toHaveAttribute('alt', 'Reviewed media figure');
  await menu.getByRole('button', { name: 'Copy media URL', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(canonical);
  report.checks.push('Real picker upload yields a decoded image; invalid size retains its property draft; description/title/width changes, undo/redo and actual clipboard copy preserve the canonical source');

  if (report.nativeMediaFilesProfile) {
    const host = page.getByTestId('work-item-description-wrapper');
    await host.getByRole('button', { name: 'Switch to plain text editing', exact: true }).click();
    const source = host.locator('textarea'); await expect(source).toBeVisible();
    const original = `![Reviewed media figure](${canonical} "Source-preserved image title"){width="240"}`;
    const text = await source.inputValue(); expect(text).toContain(original);
    const linkedHref = '/help/user/project';
    const linkedSource = text.replace(original, `[${original}](${linkedHref})`);
    const rendered = page.waitForResponse(response => {
      if (response.request().method() !== 'POST' || !response.ok()) return false;
      try { return response.request().postDataJSON()?.text === linkedSource; } catch { return false; }
    });
    await source.fill(linkedSource);
    await host.getByRole('button', { name: 'Switch to rich text editing', exact: true }).click();
    const rendering = await (await rendered).json();
    if (typeof rendering.body !== 'string') throw new Error('Missing actual linked-media renderer output');
    await writeFile(new URL('linked-media-renderer.json', output), JSON.stringify({ source: linkedSource, body: rendering.body, revision: report.pin.commit }, null, 2) + '\n');
    await expect(editor).toBeVisible(); await image.click();
    const displayHref = await image.evaluate(node => node.closest('a')?.getAttribute('href'));
    expect(displayHref).toContain('/-/blob/main/help/user/project');
    report.nativeLinkedMedia = { canonicalHref: linkedHref, displayHref };
    report.checks.push('Actual source-mode editing adds an image link; real GitLab rendering reopens the linked image with its title and width intact');
  }

  const paragraphs = await editor.locator(':scope > p').count();
  await menu.getByRole('button', { name: 'Delete media', exact: true }).click(); await expect(image).toHaveCount(0);
  await page.keyboard.type('Typed where the image was.');
  await expect(editor.getByText('Typed where the image was.', { exact: true })).toBeVisible();
  expect(await editor.locator(':scope > p').count()).toBe(paragraphs);
  await toolbar.getByRole('button', { name: 'Undo', exact: true }).click();
  if (!(await image.count())) await toolbar.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(image).toBeVisible(); await expect(image).toHaveAttribute('alt', 'Reviewed media figure');
  await expect(editor.getByText('Typed where the image was.', { exact: true })).toHaveCount(0);
  await image.click();
  if (report.nativeMediaFilesProfile) {
    const picker = page.waitForEvent('filechooser');
    await menu.getByRole('button', { name: 'Replace media file', exact: true }).click();
    await (await picker).setFiles([]);
    await expect(page.getByRole('list', { name: 'Attachment uploads', exact: true })).toHaveCount(0);
    await expect(image).toHaveAttribute('alt', 'Reviewed media figure');
    await choose(menu.getByRole('button', { name: 'Replace media file', exact: true }), 'fountain-recording.wav');
    const failed = page.getByRole('list', { name: 'Attachment uploads', exact: true });
    await expect(failed).toContainText('replacement was not applied');
    await expect(failed.getByRole('button', { name: 'Retry upload', exact: true })).toHaveCount(0);
    await expect(image).toHaveAttribute('alt', 'Reviewed media figure');
    expect(await image.evaluate(node => node.closest('a')?.getAttribute('href'))).toBe(report.nativeLinkedMedia.displayHref);
    await failed.getByRole('button', { name: 'Remove upload', exact: true }).click();
    await expect(failed).toHaveCount(0);
    report.checks.push('A real empty picker selection leaves the media unchanged; an actual WAV upload cannot replace a linked image, exposes retained upload recovery without a misleading retry, and is removable');
    await image.click();
    await context.setOffline(true);
    try {
      await choose(menu.getByRole('button', { name: 'Replace media file', exact: true }), 'fountain-figure-replacement.png');
      await expect(failed).toContainText('Retry or remove this file');
      await expect(image).toHaveAttribute('alt', 'Reviewed media figure');
      await screenshot('replacement-upload-offline.png');
    } finally { await context.setOffline(false); }
    await editor.getByText('Recovered paste', { exact: true }).click();
    await page.keyboard.press('End'); await page.keyboard.press('Enter');
    await page.keyboard.type('Typed while media replacement awaited retry.');
    await failed.getByRole('button', { name: 'Retry upload', exact: true }).click();
    await expect(failed).toHaveCount(0);
    await expect(editor.getByText('Typed while media replacement awaited retry.', { exact: true })).toBeVisible();
    report.checks.push('Real offline replacement upload retains its original target; after typing elsewhere, Retry uploads and replaces that same media instead of inserting at the new cursor');
  } else await choose(menu.getByRole('button', { name: 'Replace media file', exact: true }), 'fountain-figure-replacement.png');
  const replacement = editor.locator('img[src*="/fountain-figure-replacement.png"]');
  await expect(replacement).toBeVisible(); await expect(image).toHaveCount(0);
  await replacement.scrollIntoViewIfNeeded();
  await expect.poll(() => replacement.evaluate(node => node.complete && node.naturalWidth === 320)).toBe(true);
  await expect(replacement).toHaveAttribute('alt', 'Reviewed media figure');
  await expect(replacement).toHaveAttribute('title', 'Source-preserved image title');
  expect((await replacement.boundingBox()).width).toBe(240);
  if (report.nativeLinkedMedia) expect(await replacement.evaluate(node => node.closest('a')?.getAttribute('href'))).toBe(report.nativeLinkedMedia.displayHref);
  await replacement.click(); await properties();
  const replacementURL = await dialog().getByRole('textbox', { name: 'Media URL', exact: true }).inputValue();
  expect(replacementURL).not.toBe(canonical);
  await screenshot('media-replacement-properties.png');
  await dialog().getByRole('textbox', { name: 'Media URL', exact: true }).fill(canonical);
  await dialog().getByRole('textbox', { name: 'Media description', exact: true }).fill('Replacement figure');
  await dialog().getByRole('textbox', { name: 'Media title', exact: true }).fill('Replacement title');
  await dialog().getByRole('textbox', { name: 'Media width', exact: true }).fill('240');
  await context.setOffline(true);
  try {
    await dialog().getByRole('button', { name: 'Apply media changes', exact: true }).click();
    await expect(dialog().getByRole('alert')).toContainText('draft and document are retained');
    await expect(dialog().getByRole('textbox', { name: 'Media URL', exact: true })).toHaveValue(canonical);
    await expect(replacement).toHaveCount(1); await screenshot('media-offline-draft.png');
  } finally { await context.setOffline(false); }
  await apply(); await expect(image).toHaveAttribute('alt', 'Replacement figure'); await expect(replacement).toHaveCount(0);
  report.checks.push('Delete and actual typing stay in the original paragraph; undo restores the image; replacement picker uploads a new file; real offline URL failure retains the draft and online retry applies it');

  await place(); await choose(toolbar.getByRole('button', { name: 'Attach a file or image', exact: true }), 'fountain-recording.wav');
  const audio = editor.locator('audio[src*="/fountain-recording.wav"]');
  await expect(audio).toBeVisible(); await expect.poll(() => audio.evaluate(node => node.readyState)).toBeGreaterThanOrEqual(1);
  expect(await audio.evaluate(node => node.duration)).toBe(1);
  const audioStart = await audio.evaluate(node => node.currentTime);
  await audio.click({ position: { x: 24, y: 27 } });
  await expect.poll(() => audio.evaluate(node => node.currentTime)).toBeGreaterThan(audioStart + 0.1);
  await editor.getByRole('button', { name: 'Select audio', exact: true }).click(); await properties();
  const audioURL = await dialog().getByRole('textbox', { name: 'Media URL', exact: true }).inputValue();
  await dialog().getByRole('textbox', { name: 'Media description', exact: true }).fill('Reviewed audio');
  await dialog().getByRole('textbox', { name: 'Media title', exact: true }).fill('Retained recording title'); await apply();
  await expect(audio).toHaveAttribute('aria-label', 'Reviewed audio');

  await place(); await choose(toolbar.getByRole('button', { name: 'Attach a file or image', exact: true }), 'fountain-recording.webm');
  const video = editor.locator('video[src*="/fountain-recording.webm"]');
  await expect(video).toBeVisible(); await expect.poll(() => video.evaluate(node => node.videoWidth)).toBe(320);
  const videoStart = await video.evaluate(node => node.currentTime);
  // In the pinned Chromium controls, Play is above the bottom seek bar.
  const box = await video.boundingBox(); await video.click({ position: { x: 24, y: box.height - 48 } });
  await expect.poll(() => video.evaluate(node => node.currentTime)).toBeGreaterThan(videoStart + 0.1);
  await expect.poll(() => video.evaluate(node => node.getVideoPlaybackQuality().totalVideoFrames)).toBeGreaterThan(0);
  await editor.getByRole('button', { name: 'Select video', exact: true }).click(); await properties();
  const videoURL = await dialog().getByRole('textbox', { name: 'Media URL', exact: true }).inputValue();
  await dialog().getByRole('textbox', { name: 'Media description', exact: true }).fill('Reviewed video');
  await dialog().getByRole('textbox', { name: 'Media title', exact: true }).fill('Preserved video title');
  await dialog().getByRole('textbox', { name: 'Media width', exact: true }).fill('280'); await apply();
  expect((await video.boundingBox()).width).toBe(280);
  await screenshot('media-native-playback.png');
  report.nativeMedia = { image: { canonical, alt: 'Replacement figure', title: 'Replacement title', width: 240,
      ...(report.nativeLinkedMedia ? { link: report.nativeLinkedMedia.canonicalHref } : {}) },
    replacedUpload: replacementURL, audio: { canonical: audioURL, alt: 'Reviewed audio', title: 'Retained recording title' },
    video: { canonical: videoURL, alt: 'Reviewed video', title: 'Preserved video title', width: 280 },
    playback: { audio: await audio.evaluate(node => ({ currentTime: node.currentTime, duration: node.duration })),
      video: await video.evaluate(node => ({ currentTime: node.currentTime, width: node.videoWidth, height: node.videoHeight, frames: node.getVideoPlaybackQuality().totalVideoFrames })) } };
  report.checks.push('Actual WAV/VP8 files upload and play through native controls using user clicks; separate selection buttons expose properties without intercepting playback; descriptions, source-only titles and video width remain editable');
}

export async function assertSavedNativeMedia({ page, description, report, output, phase }) {
  const { image, audio, video } = report.nativeMedia;
  for (const item of [image, audio, video]) expect(description).toContain(`![${item.alt}](${item.canonical} "${item.title}")${item.width ? `{width="${item.width}"}` : ''}`);
  const expand = page.getByTestId('show-all-btn'); if (await expand.isVisible()) await expand.click();
  const reader = page.getByTestId('work-item-description');
  const figure = reader.getByRole('img', { name: image.alt, exact: true });
  await figure.scrollIntoViewIfNeeded(); await expect.poll(() => figure.evaluate(node => node.complete && node.naturalWidth === 320)).toBe(true);
  expect((await figure.boundingBox()).width).toBe(image.width);
  if (image.link) {
    expect(description).toContain(`[![${image.alt}](${image.canonical} "${image.title}"){width="${image.width}"}](${image.link})`);
    expect(await figure.evaluate(node => node.closest('a')?.getAttribute('data-canonical-src'))).toBe(image.link);
  }
  const savedAudio = reader.locator('audio'); await expect(savedAudio).toHaveCount(1);
  const savedVideo = reader.locator('video'); await expect(savedVideo).toHaveCount(1);
  await savedVideo.scrollIntoViewIfNeeded(); await expect.poll(() => savedVideo.evaluate(node => node.videoWidth)).toBe(320);
  await expect.poll(() => savedVideo.evaluate(node => node.readyState)).toBeGreaterThanOrEqual(2);
  expect((await savedVideo.boundingBox()).width).toBe(video.width);
  const player = await savedVideo.boundingBox();
  const start = await savedVideo.evaluate(node => node.currentTime);
  await savedVideo.click({ position: { x: 24, y: player.height - 48 } });
  await expect.poll(() => savedVideo.evaluate(node => node.currentTime)).toBeGreaterThan(start + 0.1);
  await expect.poll(() => savedVideo.evaluate(node => node.getVideoPlaybackQuality().totalVideoFrames)).toBeGreaterThan(0);
  await expect.poll(() => savedVideo.evaluate(node => node.ended)).toBe(true);
  (report.nativeReaderPlayback ??= {})[phase] = await savedVideo.evaluate(node => ({ currentTime: node.currentTime, frames: node.getVideoPlaybackQuality().totalVideoFrames, paused: node.paused, ended: node.ended }));
  await expect.poll(() => savedAudio.evaluate(node => node.duration)).toBe(1);
  await page.screenshot({ path: fileURLToPath(new URL(`media-reader-${phase}.png`, output)), fullPage: true });
}
