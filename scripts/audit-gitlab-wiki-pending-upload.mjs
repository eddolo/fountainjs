import { expect } from '@playwright/test';
import { join } from 'node:path';
import { editorProof } from './gitlab-audit-editor.mjs';

export async function checkPendingWikiUpload({page, peer, item, edit, read, side, project, switchWikiDeployment, output}) {
  const {name,text} = item.input.upload, bytes = Buffer.from(text);
  const origin = new URL(project.web_url).origin;
  const actor = await edit(peer), observer = await edit(page);
  const pending = item.pendingUpload = {requests:0,uploader:await editorProof(actor)};
  expect(pending.uploader.native).toBe(side === 'fountain');
  const form = peer.locator('form.wiki-form');
  const status = actor.locator('p').filter({hasText:'Status:'});
  const before = await read();
  await status.click();
  await peer.keyboard.press('End');
  await peer.keyboard.insertText(' Evidence pending.');
  const expectedStatus = 'Status: ready.' + item.input.ownerEdit + item.input.peerEdit + ' Evidence pending.';
  await expect(observer).toContainText(expectedStatus);
  // Give the upload its own paragraph so each editor's insertion can be checked after reload.
  await peer.keyboard.press('End');
  await peer.keyboard.press('Enter');
  const release = Promise.withResolvers();
  let routeFailure;
  // Hold delivery of the actual GitLab response to the uploader across the restart.
  // The bytes, endpoint, authentication, response and resulting reader URL are real.
  const matches = url => url.origin === origin && /\/(?:uploads|attachments)(?:\.json)?\/?$/u.test(url.pathname);
  await peer.route(matches, async route => {
    if (route.request().method() !== 'POST' || !route.request().headers()['content-type']?.startsWith('multipart/form-data'))
      return route.continue();
    pending.requests++;
    try {
      const response = await route.fetch({maxRetries:0,maxRedirects:0});
      pending.uploadStatus = response.status();
      expect(response.ok()).toBe(true);
      const data = await response.json();
      pending.markdown = (data.link ?? data).markdown;
      expect(pending.markdown).toContain('[' + name + '](');
      await release.promise;
      await route.fulfill({response});
    } catch (error) {
      routeFailure = String(error);
      await route.abort().catch(() => {});
    }
  });
  try {
    item.stage = 'upload-through-wiki-picker';
    const chooser = peer.waitForEvent('filechooser',{timeout:8000});
    await Promise.all([chooser.then(file => file.setFiles({name,mimeType:'text/plain',buffer:bytes})),
      form.getByRole('button',{name:'Attach a file or image',exact:true}).click({timeout:8000})]);
    await expect.poll(() => routeFailure ?? Boolean(pending.markdown),{timeout:15000}).toBe(true);
    if (side === 'original') {
      await expect(observer.getByRole('link',{name,exact:true})).toHaveAttribute('href',/^blob:/u);
      pending.sharedPlaceholder = true;
    } else {
      await expect(form.getByRole('list',{name:'Attachment uploads'})).toContainText(name);
      await expect(observer.getByText(name,{exact:true})).toHaveCount(0);
      pending.sharedPlaceholder = false;
    }
    expect(await read()).toBe(before);
    await form.screenshot({path:join(output,'pending-upload.png')});
    await page.goto('about:blank');
    item.stage = 'join-switched-wiki-before-upload-completion';
    await switchWikiDeployment({wikiSlug:item.slug});
    const next = side === 'original' ? 'fountain' : 'original';
    const fresh = await edit(page,next);
    pending.destination = await editorProof(fresh);
    expect(pending.destination.native).toBe(next === 'fountain');
    await expect(fresh).toContainText(expectedStatus);
    if (side === 'original') {
      await expect(fresh).toContainText(name);
      await expect(fresh.locator('a[href^="blob:"]')).toHaveCount(0);
      await expect(page.getByTestId('wiki-submit-button')).toBeDisabled();
    }
    // A different paragraph remains editable while the uploader waits. This also proves
    // the old tab rejoined the live room before releasing its pending HTTP response.
    await fresh.locator('p').filter({hasText:'Status:'}).click();
    await page.keyboard.press('End');
    await page.keyboard.insertText(' Witness checked.');
    pending.witnessDraft = expectedStatus + ' Witness checked.';
    await expect(actor).toContainText(pending.witnessDraft,{timeout:30000});
    await fresh.screenshot({path:join(output,'destination-before-completion.png')});
    expect(await read()).toBe(before);
    item.stage = 'resolve-pending-wiki-upload';
    release.resolve();
    const link = fresh.getByRole('link',{name,exact:true});
    for (const view of [actor,fresh])
      await expect(view.getByRole('link',{name,exact:true})).toHaveAttribute('href',/^(?!blob:).+$/u,{timeout:30000});
    const url = await link.evaluate(a => a.href);
    expect(new URL(url).origin).toBe(origin);
    expect((await actor.getByRole('link',{name,exact:true}).evaluate(a => a.href))).toBe(url);
    await expect(fresh).toContainText(expectedStatus);
    item.stage = 'save-resolved-wiki-upload';
    await page.getByTestId('wiki-submit-button').click();
    const confirm = page.getByTestId('wiki-confirm-message'), reader = page.getByTestId('wiki-page-content');
    await expect(confirm.or(reader).first()).toBeVisible();
    if (await confirm.isVisible()) await confirm.click();
    await expect(reader).toContainText(pending.witnessDraft);
    await page.reload();
    await expect(reader.locator('strong')).toHaveText('Sam');
    await expect(reader.getByRole('link',{name,exact:true})).toHaveCount(1);
    const reopened = await reader.getByRole('link',{name,exact:true}).evaluate(a => a.href);
    expect(reopened).toBe(url);
    const file = await page.request.get(reopened);
    expect(file.ok()).toBe(true);
    expect(await file.body()).toEqual(bytes);
    pending.saved = await read();
    expect(pending.saved.replaceAll('\r\n','\n')).toBe(before.replaceAll('\r\n','\n') + ' Evidence pending. Witness checked.\n\n' + pending.markdown);
    expect(pending.requests).toBe(1);
    pending.verifiedBytes = bytes.length;
    await reader.screenshot({path:join(output,'reopened-attachment.png')});
  } finally {
    release.resolve();
    await peer.unrouteAll({behavior:'wait'});
  }
}
