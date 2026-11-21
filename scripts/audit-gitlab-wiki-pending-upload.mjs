import { expect } from '@playwright/test';
import { join } from 'node:path';
import { editorProof } from './gitlab-audit-editor.mjs';

export async function checkPendingWikiUpload({page, peer, item, edit, read, paragraphText, side, project, switchWikiDeployment, output}) {
  const {peerEditDuringFailure} = item.input.upload;
  const {name,text} = item.input.upload, bytes = Buffer.from(text);
  const origin = new URL(project.web_url).origin;
  const actor = await edit(peer), observer = await edit(page);
  const statusText = editor => paragraphText(editor.locator('p').filter({hasText:'Status:'}));
  const pending = item.pendingUpload = {requests:0,forwardedRequests:0,uploader:await editorProof(actor)};
  expect(pending.uploader.native).toBe(side === 'fountain');
  const form = peer.locator('form.wiki-form');
  const status = actor.locator('p').filter({hasText:'Status:'});
  item.stage = 'create-attachment-paragraph';
  const before = await read();
  await status.click();
  await peer.keyboard.press('End');
  await peer.keyboard.insertText(' Evidence pending.');
  let expectedStatus = 'Status: ready.' + item.input.ownerEdit + item.input.peerEdit + ' Evidence pending.';
  await expect.poll(() => statusText(observer)).toBe(expectedStatus);
  // Give the upload its own paragraph so each editor's insertion can be checked after reload.
  await peer.keyboard.press('End');
  await peer.keyboard.press('Enter');
  // Verify Enter on both clients before opening the picker. A refused split can
  // otherwise insert the completed attachment at the end of the status instead.
  for (const view of [actor,observer]) {
    // The stock editor wraps its paragraphs in NodeView elements.
    const paragraphs = view.locator('p');
    await expect(paragraphs).toHaveCount(3);
    await expect.poll(() => paragraphText(paragraphs.last())).toBe('');
  }
  const interrupt = Promise.withResolvers(), release = Promise.withResolvers();
  let routeFailure;
  // Hold delivery of the actual GitLab response to the uploader across the restart.
  // The bytes, endpoint, authentication, response and resulting reader URL are real.
  const matches = url => url.origin === origin && /\/(?:uploads|attachments)(?:\.json)?\/?$/u.test(url.pathname);
  await peer.route(matches, async route => {
    if (route.request().method() !== 'POST' || !route.request().headers()['content-type']?.startsWith('multipart/form-data'))
      return route.continue();
    pending.requests++;
    if (peerEditDuringFailure && pending.requests === 1) {
      // Fail this browser request before it is forwarded to the authenticated endpoint.
      await interrupt.promise;
      await route.abort('connectionreset');
      return;
    }
    try {
      pending.forwardedRequests++;
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
  async function selectFile() {
    const chooser = peer.waitForEvent('filechooser',{timeout:8000});
    await Promise.all([chooser.then(file => file.setFiles({name,mimeType:'text/plain',buffer:bytes})),
      form.getByRole('button',{name:'Attach a file or image',exact:true}).click({timeout:8000})]);
  }
  try {
    item.stage = 'upload-through-wiki-picker';
    await selectFile();
    if (peerEditDuringFailure) {
      item.stage = 'recover-upload-before-server-acceptance';
      const isNative = side === 'fountain';
      const visibleFile = isNative
        ? page.getByRole('list',{name:'Files being attached by other authors'}).getByText(name,{exact:true})
        : observer.getByRole('link',{name,exact:true});
      await expect(visibleFile).toBeVisible();
      await observer.locator('p').filter({hasText:'Status:'}).click();
      await page.keyboard.press('End');
      await page.keyboard.insertText(peerEditDuringFailure);
      expectedStatus += peerEditDuringFailure;
      await expect.poll(() => statusText(actor)).toBe(expectedStatus);
      await expect.poll(() => pending.requests).toBe(1);
      expect(pending.forwardedRequests).toBe(0);
      interrupt.resolve();
      const retry = form.getByRole('button',{name:'Retry upload',exact:true});
      const failure = isNative ? form.getByRole('list',{name:'Attachment uploads'})
        : peer.getByText('An error occurred while uploading the file. Please try again.',{exact:true});
      await expect(failure).toBeVisible();
      if (isNative) {
        await expect(failure).toContainText(name);
        await expect(retry).toBeEnabled();
      }
      await expect(visibleFile).toHaveCount(0);
      await expect(page.getByTestId('wiki-submit-button')).toBeEnabled();
      expect(await read()).toBe(before);
      await form.screenshot({path:join(output,'interrupted-before-retry.png')});
      pending.interruption = {peerText:await statusText(observer),forwardedBeforeRetry:pending.forwardedRequests,
        failureFeedback:await failure.innerText(),retainedFile:await retry.isVisible()};
      if (pending.interruption.retainedFile) await retry.click();
      else {
        await actor.locator('p').last().click();
        await selectFile();
      }
    }
    await expect.poll(() => routeFailure ?? Boolean(pending.markdown),{timeout:15000}).toBe(true);
    if (side === 'original') {
      await expect(observer.getByRole('link',{name,exact:true})).toHaveAttribute('href',/^blob:/u);
      pending.sharedPlaceholder = true;
    } else {
      await expect(form.getByRole('list',{name:'Attachment uploads'})).toContainText(name);
      await expect(observer.getByText(name,{exact:true})).toHaveCount(0);
      pending.sharedPlaceholder = false;
      const notice = page.getByRole('list',{name:'Files being attached by other authors'});
      await expect(notice.getByText(name,{exact:true})).toBeVisible();
      pending.peerUploadNotice = true;
    }
    expect(await read()).toBe(before);
    await form.screenshot({path:join(output,'pending-upload.png')});
    let fresh = observer, next = side;
    if (switchWikiDeployment) {
      await page.goto('about:blank');
      item.stage = 'join-switched-wiki-before-upload-completion';
      await switchWikiDeployment({wikiSlug:item.slug});
      next = side === 'original' ? 'fountain' : 'original';
      fresh = await edit(page,next);
    }
    pending.destination = await editorProof(fresh);
    expect(pending.destination.native).toBe(next === 'fountain');
    await expect.poll(() => statusText(fresh)).toBe(expectedStatus);
    if (side === 'original' && next === 'fountain') {
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
    await expect.poll(() => statusText(actor),{timeout:30000}).toBe(pending.witnessDraft);
    await fresh.screenshot({path:join(output,'destination-before-completion.png')});
    expect(await read()).toBe(before);
    if (!switchWikiDeployment) {
      item.stage = 'save-before-attachment-completion';
      const save = page.getByTestId('wiki-submit-button');
      pending.peerSave = {disabled:await save.isDisabled()};
      if (side === 'fountain') expect(pending.peerSave.disabled).toBe(true);
      await page.locator('form.wiki-form').screenshot({path:join(output,'peer-save-before-completion.png')});
      if (!pending.peerSave.disabled) {
        await save.click();
        const confirm = page.getByTestId('wiki-confirm-message'), reader = page.getByTestId('wiki-page-content');
        await expect(confirm.or(reader).first()).toBeVisible();
        if (await confirm.isVisible()) await confirm.click();
        await expect(reader).toContainText(pending.witnessDraft);
        pending.peerSave.source = await read();
        pending.peerSave.hasObjectURL = pending.peerSave.source.includes('blob:');
        pending.peerSave.hasFileName = pending.peerSave.source.includes(name);
        await reader.screenshot({path:join(output,'intermediate-saved-reader.png')});
        fresh = await edit(page);
      } else {
        const submissions = [];
        const record = req => { if (req.isNavigationRequest() && req.method() === 'POST') submissions.push(new URL(req.url()).pathname); };
        page.on('request',record);
        try {
          await fresh.locator('p').filter({hasText:'Status:'}).press('Control+Enter');
          await expect(fresh).toBeVisible();
          await expect(save).toBeDisabled();
          expect(await read()).toBe(before);
          expect(submissions).toEqual([]);
          pending.peerSave.keyboardSubmissions = submissions;
        } finally { page.off('request',record); }
      }
    }
    item.stage = 'resolve-pending-wiki-upload';
    release.resolve();
    const link = fresh.getByRole('link',{name,exact:true});
    for (const view of [actor,fresh])
      await expect(view.getByRole('link',{name,exact:true})).toHaveAttribute('href',/^(?!blob:).+$/u,{timeout:30000});
    const url = await link.evaluate(a => a.href);
    expect(new URL(url).origin).toBe(origin);
    expect((await actor.getByRole('link',{name,exact:true}).evaluate(a => a.href))).toBe(url);
    await expect.poll(() => statusText(fresh)).toBe(pending.witnessDraft);
    if (next === 'fountain') {
      await expect(page.getByRole('list',{name:'Files being attached by other authors'})).toHaveCount(0);
      await expect(page.getByTestId('wiki-submit-button')).toBeEnabled();
    }
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
    expect(pending.saved.replaceAll('\r\n','\n')).toBe(before.replaceAll('\r\n','\n') + ' Evidence pending.' + (peerEditDuringFailure ?? '') + ' Witness checked.\n\n' + pending.markdown);
    expect(pending.requests).toBe(peerEditDuringFailure ? 2 : 1);
    expect(pending.forwardedRequests).toBe(1);
    pending.verifiedBytes = bytes.length;
    await reader.screenshot({path:join(output,'reopened-attachment.png')});
  } catch (error) {
    for (const [key,tab] of [['source',peer],['destination',page]]) {
      const wiki = tab.locator('form.wiki-form');
      pending[key + 'Feedback'] = await wiki.locator('[role="status"],[data-testid="content-editor-error"]')
        .allTextContents().catch(() => []);
      if (await wiki.count()) await wiki.screenshot({path:join(output,key + '-upload-interrupted.png')}).catch(() => {});
    }
    throw error;
  } finally {
    interrupt.resolve();
    release.resolve();
    await peer.unrouteAll({behavior:'wait'});
  }
}
