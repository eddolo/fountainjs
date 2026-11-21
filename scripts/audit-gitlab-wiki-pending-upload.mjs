import { expect } from '@playwright/test';
import { join } from 'node:path';
import { throttleWikiUpload } from './gitlab-partial-wiki-transfer.mjs';
import { editorProof } from './gitlab-audit-editor.mjs';

export async function checkPendingWikiUpload({page, peer, item, edit, read, paragraphText, side, project, switchWikiDeployment, abandonWikiUpload, output, readIngress}) {
  const {peerEditDuringFailure,closeBeforeTransfer,partialTransfer,repetitions = 1} = item.input.upload;
  const {name,text} = item.input.upload, bytes = Buffer.from(text.repeat(repetitions));
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
  let routeFailure, throttle, headerBound;
  let releasePresence;
  // Hold delivery of the actual GitLab response to the uploader across the restart.
  // The bytes, endpoint, authentication, response and resulting reader URL are real.
  const matches = url => url.origin === origin && /\/(?:uploads|attachments)(?:\.json)?\/?$/u.test(url.pathname);
  await peer.route(matches, async route => {
    if (route.request().method() !== 'POST' || !route.request().headers()['content-type']?.startsWith('multipart/form-data'))
      return route.continue();
    pending.requests++;
    if (partialTransfer && pending.requests === 1) {
      // Chromium sends its original multipart request, with the test header and its normal session.
      const headers = await route.request().headersArray();
      headerBound = 16384 + Buffer.byteLength(route.request().url()) + headers.reduce((sum,{name,value}) => sum+Buffer.byteLength(name+value)+4,0);
      pending.forwardedRequests++;
      await route.continue();
      return;
    }
    if ((peerEditDuringFailure || closeBeforeTransfer) && pending.requests === 1) {
      // Fail this browser request before it is forwarded to the authenticated endpoint.
      await interrupt.promise;
      if (!peer.isClosed()) await route.abort('connectionreset');
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
    if (partialTransfer) throttle = await throttleWikiUpload(peer,name,bytes.length);
    await selectFile();
    if (closeBeforeTransfer) {
      item.stage = 'save-after-uploader-tab-closes';
      await expect.poll(() => pending.requests).toBe(1);
      const isNative = side === 'fountain';
      const visibleFile = isNative ? page.getByRole('list',{name:'Files being attached by other authors'}).getByText(name,{exact:true})
        : observer.getByRole('link',{name,exact:true});
      const avatar = page.getByTestId('collaborators-indicator').getByAltText(item.authors.peer,{exact:true});
      const save = page.getByTestId('wiki-submit-button');
      await expect(visibleFile).toBeVisible();
      await expect(avatar).toBeVisible();
      if (isNative) await expect(save).toBeDisabled();
      await observer.locator('p').filter({hasText:'Status:'}).click();
      await page.keyboard.press('End');
      await page.keyboard.insertText(' Handoff recorded.');
      expectedStatus += ' Handoff recorded.';
      await expect.poll(() => statusText(actor)).toBe(expectedStatus);
      await page.locator('form.wiki-form').screenshot({path:join(output,'peer-before-departure.png')});
      const departure = pending.departure = {visibleBeforeClose:true,forwardedBeforeClose:pending.forwardedRequests};
      const start = Date.now();
      await peer.close();
      expect(peer.isClosed()).toBe(true);
      interrupt.resolve();
      await expect(avatar).toHaveCount(0,{timeout:60000});
      if (isNative) await expect(visibleFile).toHaveCount(0,{timeout:10000});
      await expect(save).toBeEnabled();
      departure.saveAvailableAfterDepartureMs = Date.now() - start;
      departure.pendingStillVisible = await visibleFile.isVisible();
      expect(await read()).toBe(before);
      await observer.locator('p').filter({hasText:'Status:'}).click();
      await page.keyboard.press('End');
      await page.keyboard.insertText(' Saved after closure.');
      expectedStatus += ' Saved after closure.';
      await expect.poll(() => statusText(observer)).toBe(expectedStatus);
      await page.locator('form.wiki-form').screenshot({path:join(output,'peer-after-departure.png')});
      await save.click();
      const confirm = page.getByTestId('wiki-confirm-message'), reader = page.getByTestId('wiki-page-content');
      await expect(confirm.or(reader).first()).toBeVisible();
      if (await confirm.isVisible()) await confirm.click();
      await expect(reader).toContainText(expectedStatus);
      await page.reload();
      await expect(reader).toContainText(expectedStatus);
      await expect(reader.locator('strong')).toHaveText('Sam');
      await expect(reader.getByRole('link',{name,exact:true})).toHaveCount(0);
      departure.saved = await read();
      expect(departure.saved).not.toContain('blob:');
      departure.savedHasFilename = departure.saved.includes(name);
      departure.readerText = await reader.innerText();
      expect(pending.forwardedRequests).toBe(0);
      expect(pending.requests).toBe(1);
      await reader.screenshot({path:join(output,'reopened-after-departure.png')});
      return;
    }
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
      if (partialTransfer) pending.partialIngress = await throttle.interrupt(readIngress,headerBound);
      else {
        expect(pending.forwardedRequests).toBe(0);
        interrupt.resolve();
      }
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
      next = await switchWikiDeployment({wikiSlug:item.slug,afterStop:abandonWikiUpload ? async () => {
        await peer.close();
        release.resolve();
        pending.uploaderClosedDuringOutage = peer.isClosed();
      } : undefined});
      if (next === 'prepared' && !abandonWikiUpload) {
        // Hold only inbound wiki presence. Room initialization, document edits and HTTP use the live backend.
        const held = [];
        pending.delayedPresenceFrames = 0;
        let delaying = true;
        await page.routeWebSocket(url => url.origin === 'ws://127.0.0.1:5080' && url.pathname === '/-/cable', socket => {
          const upstream = socket.connectToServer();
          upstream.onMessage(message => {
            const frame = typeof message === 'string' ? JSON.parse(message) : {};
            if (delaying && frame.identifier?.includes('CollaborativeEditing::WikiPageChannel') && frame.message?.type === 'awareness') {
              held.push(() => socket.send(message));
              pending.delayedPresenceFrames++;
            } else socket.send(message);
          });
        });
        releasePresence = () => {
          delaying = false;
          releasePresence = undefined;
          held.splice(0).forEach(forward => forward());
        };
      }
      fresh = await edit(page,next);
    }
    pending.destinationSide = next;
    pending.destination = await editorProof(fresh);
    expect(pending.destination.native).toBe(next === 'fountain');
    await expect.poll(() => statusText(fresh)).toBe(expectedStatus);
    if (abandonWikiUpload) {
      item.stage = 'recover-reservation-after-uploader-closed-during-outage';
      expect(next).toBe('prepared');
      expect(pending.uploaderClosedDuringOutage).toBe(true);
      const save = page.getByTestId('wiki-submit-button');
      const recover = page.getByTestId('wiki-recover-uploads');
      const dialog = page.getByRole('dialog').filter({hasText:'Confirm with the authors'});
      await expect(save).toBeDisabled();
      await recover.click();
      await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
      await expect(save).toBeDisabled();
      expect(await read()).toBe(before);
      await recover.click();
      await dialog.screenshot({path:join(output,'confirm-interrupted-upload.png')});
      await dialog.getByRole('button',{name:'Clear interrupted uploads',exact:true}).click();
      await expect(save).toBeEnabled();
      expect(await read()).toBe(before);
      pending.clearedWithoutSave = true;

      const chooser = page.waitForEvent('filechooser');
      const uploaded = page.waitForResponse(res => matches(new URL(res.url())) && res.request().method() === 'POST');
      await fresh.locator('p').last().click();
      await Promise.all([chooser.then(file => file.setFiles({name,mimeType:'text/plain',buffer:bytes})),
        page.locator('form.wiki-form').getByRole('button',{name:'Attach a file or image',exact:true}).click()]);
      const replacement = await uploaded;
      expect(replacement.ok()).toBe(true);
      const data = await replacement.json();
      const markdown = (data.link ?? data).markdown;
      const link = fresh.getByRole('link',{name,exact:true});
      await expect(link).toHaveAttribute('href',/^(?!blob:).+$/u);
      const href = await link.evaluate(a => a.href);
      await save.click();
      const confirm = page.getByTestId('wiki-confirm-message'), reader = page.getByTestId('wiki-page-content');
      await expect(confirm.or(reader).first()).toBeVisible();
      if (await confirm.isVisible()) await confirm.click();
      await expect(reader).toContainText(expectedStatus);
      await page.reload();
      await expect(reader.getByRole('link',{name,exact:true})).toHaveCount(1);
      expect(await reader.getByRole('link',{name,exact:true}).evaluate(a=>a.href)).toBe(href);
      expect(new URL(href).origin).toBe(origin);
      const downloaded = await page.request.get(href);
      expect(downloaded.ok()).toBe(true);
      expect(await downloaded.body()).toEqual(bytes);
      pending.saved = await read();
      expect(pending.saved.replaceAll('\r\n','\n')).toBe(before.replaceAll('\r\n','\n')+' Evidence pending.\n\n'+markdown);
      pending.verifiedBytes = bytes.length;
      await reader.screenshot({path:join(output,'reopened-recovered-attachment.png')});
      return;
    }
    if (next === 'prepared') {
      const save = page.getByTestId('wiki-submit-button');
      const notice = page.getByRole('list',{name:'Files being attached by other authors'}).getByText(name,{exact:true});
      const start = Date.now();
      pending.saveDisabledOnJoin = await save.isDisabled();
      await expect.poll(() => pending.delayedPresenceFrames,{timeout:20000}).toBeGreaterThan(0);
      pending.saveDisabledWithoutPresence = await save.isDisabled();
      const submissions = [];
      const record = req => { if (req.isNavigationRequest() && req.method() === 'POST') submissions.push(new URL(req.url()).pathname); };
      page.on('request',record);
      try {
        if (pending.saveDisabledWithoutPresence) {
          await fresh.locator('p').filter({hasText:'Status:'}).press('Control+Enter');
          await expect(save).toBeDisabled();
          const actions = await page.getByTestId('wiki-form-actions').boundingBox();
          const noticeRow = await page.getByTestId('wiki-upload-notice').boundingBox();
          expect(noticeRow.y).toBeGreaterThanOrEqual(actions.y + actions.height - 1);
          await page.locator('form.wiki-form').screenshot({path:join(output,'save-held-before-presence.png')});
          expect(await read()).toBe(before);
          expect(submissions).toEqual([]);

          const recover = page.getByTestId('wiki-recover-uploads');
          const dialog = page.getByRole('dialog').filter({hasText:'Confirm with the authors'});
          await recover.click();
          await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
          await expect(save).toBeDisabled();
          await recover.click();
          await expect(dialog).toBeVisible();
          releasePresence();
          await expect(notice).toBeVisible();
          await dialog.getByRole('button',{name:'Clear interrupted uploads',exact:true}).click();
          await expect(dialog).toBeHidden();
          await expect(recover).toHaveCount(0);
          await expect(save).toBeDisabled();
          pending.returningUploaderProtected = true;
        } else {
          await save.click();
          const confirm = page.getByTestId('wiki-confirm-message'), reader = page.getByTestId('wiki-page-content');
          await expect(confirm.or(reader).first()).toBeVisible();
          if (await confirm.isVisible()) await confirm.click();
          await expect(reader).toContainText(expectedStatus);
          pending.earlySavedSource = await read();
          await reader.screenshot({path:join(output,'saved-before-upload-notice.png')});
        }
        pending.earlySubmissions = submissions;
      } finally {
        page.off('request',record);
        releasePresence?.();
      }
      expect(pending.saveDisabledWithoutPresence,'The initial room data must protect Save without a live presence message').toBe(true);
      await expect(notice).toBeVisible();
      await expect(save).toBeDisabled();
      pending.peerNoticeBeforeTypingMs = Date.now() - start;
    }
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
    item.stage = 'save-before-attachment-completion';
    const save = page.getByTestId('wiki-submit-button');
    const notice = page.getByRole('list',{name:'Files being attached by other authors'}).getByText(name,{exact:true});
    pending.peerSave = {disabled:await save.isDisabled(), filenameVisible:
      await notice.isVisible() || (await fresh.innerText()).includes(name)};
    if (next === 'prepared') {
      await expect(notice).toBeVisible();
      expect(pending.peerSave.filenameVisible).toBe(true);
    }
    if (next !== 'original') expect(pending.peerSave.disabled).toBe(true);
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
      fresh = await edit(page,next);
      pending.peerSave.reopenedEditor = await editorProof(fresh);
      expect(pending.peerSave.reopenedEditor.native).toBe(next === 'fountain');
      await expect.poll(() => statusText(fresh)).toBe(pending.witnessDraft);
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
    item.stage = 'resolve-pending-wiki-upload';
    release.resolve();
    const link = fresh.getByRole('link',{name,exact:true});
    for (const view of [actor,fresh])
      await expect(view.getByRole('link',{name,exact:true})).toHaveAttribute('href',/^(?!blob:).+$/u,{timeout:30000});
    const url = await link.evaluate(a => a.href);
    expect(new URL(url).origin).toBe(origin);
    expect((await actor.getByRole('link',{name,exact:true}).evaluate(a => a.href))).toBe(url);
    await expect.poll(() => statusText(fresh)).toBe(pending.witnessDraft);
    if (next !== 'original') {
      await expect(page.getByRole('list',{name:'Files being attached by other authors'})).toHaveCount(0);
      await expect(page.getByTestId('wiki-submit-button')).toBeEnabled();
    }
    // A peer's intermediate Save remains its own revision until someone deliberately saves the resolved link.
    pending.storedBeforeFinalSave = await read();
    expect(pending.storedBeforeFinalSave).toBe(pending.peerSave.source ?? before);
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
    expect(pending.forwardedRequests).toBe(partialTransfer ? 2 : 1);
    pending.verifiedBytes = bytes.length;
    await reader.screenshot({path:join(output,'reopened-attachment.png')});
    if (next === 'prepared') expect(pending.saveDisabledOnJoin,
      'Save must already be guarded when the prepared editor first exposes the shared draft').toBe(true);
  } catch (error) {
    for (const [key,tab] of [['source',peer],['destination',page]]) {
      if (tab.isClosed()) continue;
      const wiki = tab.locator('form.wiki-form');
      pending[key + 'Feedback'] = await wiki.locator('[role="status"],[data-testid="content-editor-error"]')
        .allTextContents().catch(() => []);
      if (await wiki.count()) await wiki.screenshot({path:join(output,key + '-upload-interrupted.png')}).catch(() => {});
    }
    throw error;
  } finally {
    releasePresence?.();
    interrupt.resolve();
    release.resolve();
    try { if (!peer.isClosed()) await peer.unrouteAll({behavior:'wait'}); }
    finally { await throttle?.dispose(); }
  }
}
