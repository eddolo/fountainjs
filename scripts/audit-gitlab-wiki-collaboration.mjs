import { expect } from '@playwright/test';
import { join } from 'node:path';
import { prepareGitLabAuditMember } from './gitlab-audit-member.mjs';
import { editorProof, observePage, openRich } from './gitlab-audit-editor.mjs';

export async function runWikiCollaboration({page, request, project, fixture, side, runId, output, switchDraftToStock, mixedWiki}) {
  const [input] = fixture.cases;
  const item = {id:input.id, input, stage:'setup', status:'incomplete', pageErrors:[]};
  const flag = 'wiki_collaborative_editing';
  const flags = '/api/v4/features';
  const endpoint = flags + '/' + flag;
  const readFlag = async () => (await request(flags)).find(value => value.name === flag) ?? null;
  const before = await readFlag();
  if (before && before.state !== 'off') throw new Error('Wiki collaboration comparison expects the packaged default.');
  const namespace = project.namespace.full_path;
  expect(project.namespace.kind).toBe('user');
  expect(namespace).toBe('root');
  const member = await prepareGitLabAuditMember({project, request, fixture});
  const members = '/api/v4/projects/' + project.id + '/members';
  const readMember = async () => (await request(members + '?query=' + fixture.username)).find(value => value.id === member.account.id);
  const membership = await readMember();
  const second = await page.context().browser().newContext();
  try {
    const gate = await request(endpoint, {namespace, value:'true'});
    item.gate = gate.gates.find(value => value.key === 'actors')?.value;
    if (membership?.access_level !== 30) await member.setRole(30);
    const peer = await second.newPage();
    await member.signInMember(peer, {});
    await observePage(peer, item);
    const remote = await peer.request.get(new URL('/api/v4/user', project.web_url).href);
    expect(remote.status()).toBe(200);
    const identity = await remote.json();
    const owner = await request('/api/v4/user');
    expect(identity.id).toBe(member.account.id);
    expect(identity.id).not.toBe(owner.id);
    item.authors = {owner:owner.name, peer:identity.name};
    const wikis = '/api/v4/projects/' + project.id + '/wikis';
    const wiki = await request(wikis, {title:[input.title,side,runId].join('-'),content:input.source,format:'markdown'});
    item.slug = wiki.slug;
    const url = project.web_url + '/-/wikis/' + encodeURIComponent(wiki.slug);
    const read = async () => (await request(wikis + '/' + encodeURIComponent(wiki.slug))).content;
    async function edit(tab, editorSide = side) {
      const roomEvents = [];
      (item.roomEvents ??= []).push(roomEvents);
      tab.on('websocket', socket => socket.on('framereceived', ({payload}) => {
        if (typeof payload !== 'string' || roomEvents.length >= 12) return;
        let frame;
        try { frame = JSON.parse(payload); } catch { return; }
        if (!frame.identifier?.includes('CollaborativeEditing::WikiPageChannel')) return;
        const kind = frame.type ?? frame.message?.type;
        if (['init','confirm_subscription','reject_subscription'].includes(kind)) roomEvents.push(kind);
      }));
      await tab.goto(url);
      await tab.getByTestId('wiki-edit-button').click();
      return openRich(tab.locator('form.wiki-form'), editorSide);
    }
    async function paragraphText(paragraph) {
      return paragraph.evaluate(element => {
        const content = element.cloneNode(true);
        for (const cursor of content.querySelectorAll('.collaboration-cursor-caret[aria-hidden="true"],.fountain-collaboration-caret[data-fountain-collaborator]')) cursor.remove();
        return content.textContent;
      });
    }
    async function append(tab, paragraph, text) {
      await paragraph.click();
      await tab.keyboard.press('End');
      await tab.keyboard.insertText(text);
    }
    item.stage = 'open-first-editor';
    const first = await edit(page);
    item.editorProof = await editorProof(first);
    await expect(first.locator('strong')).toHaveText('Sam');
    const firstStatus = first.locator('p').filter({hasText:'Status:'});
    await append(page, firstStatus, input.ownerEdit);
    await expect.poll(() => paragraphText(firstStatus)).toBe('Status: ready.' + input.ownerEdit);
    expect(await read()).toBe(input.source);
    item.stage = 'second-author-joins-unsaved-draft';
    const other = await edit(peer);
    item.peerEditorProof = await editorProof(other);
    const peerStatus = other.locator('p').filter({hasText:'Status:'});
    await expect.poll(() => paragraphText(peerStatus), {timeout:20000}).toBe('Status: ready.' + input.ownerEdit);
    item.joinedDraft = await paragraphText(peerStatus);
    await expect(other.locator('strong')).toHaveText('Sam');
    const firstAvatar = page.getByTestId('collaborators-indicator').getByAltText(identity.name);
    const peerAvatar = peer.getByTestId('collaborators-indicator').getByAltText(owner.name);
    item.presenceAtJoin = {ownerSeesPeer:await firstAvatar.isVisible(), peerSeesOwner:await peerAvatar.isVisible()};
    // Moving the first author's caret publishes a fresh awareness event after the second session joins.
    await firstStatus.click();
    await page.keyboard.press('Home');
    await peerStatus.click();
    await peer.keyboard.press('Home');
    await Promise.all([firstAvatar,peerAvatar].map(avatar => avatar.waitFor({state:'visible',timeout:5000})
      .catch(error => { if (error.name !== 'TimeoutError') throw error; })));
    item.ownerSeesPeer = await firstAvatar.isVisible();
    item.peerSeesOwner = await peerAvatar.isVisible();
    // Fountain paints carets in a body overlay. Verify the peer's label intersects this editor.
    async function peerCursorVisible(editor, name) {
      return editor.evaluate((root, peerName) => {
        const bounds = root.getBoundingClientRect();
        const labels = [...root.querySelectorAll('.collaboration-cursor-label'),
          ...root.ownerDocument.querySelectorAll('[data-fountain-overlay-widgets] [data-fountain-overlay-label]')];
        return labels.some(label => {
          if (label.textContent.trim() !== peerName || !label.checkVisibility()) return false;
          const box = label.getBoundingClientRect();
          return box.width > 0 && box.height > 0 && box.bottom > bounds.top && box.top < bounds.bottom
            && box.right > bounds.left && box.left < bounds.right;
        });
      }, name);
    }
    const cursors = [() => peerCursorVisible(first,identity.name),() => peerCursorVisible(other,owner.name)];
    await Promise.all(cursors.map(visible => expect.poll(visible,{timeout:5000}).toBe(true).catch(() => {})));
    item.cursors = await Promise.all(cursors.map(visible => visible()));
    item.stage = 'peer-edit-and-local-undo';
    await append(peer, peerStatus, input.peerEdit);
    const both = 'Status: ready.' + input.ownerEdit + input.peerEdit;
    await expect.poll(() => paragraphText(firstStatus)).toBe(both);
    await peer.keyboard.press('Control+z');
    await expect.poll(() => paragraphText(peerStatus)).toBe(item.joinedDraft);
    await expect.poll(() => paragraphText(firstStatus)).toBe(item.joinedDraft);
    item.afterPeerUndo = await paragraphText(firstStatus);
    await peer.keyboard.press('Control+Shift+z');
    await expect.poll(() => paragraphText(firstStatus)).toBe(both);
    item.afterPeerRedo = await paragraphText(firstStatus);
    if (side === 'original') {
      item.stockWire = await first.evaluate(element => {
        const state = element.editor?.state;
        const binding = state?.plugins.find(plugin => plugin.key.startsWith('y-sync$'))?.getState(state);
        return binding?.type?.toArray().map(block => ({
          name:block.nodeName, attrs:block.getAttributes(), children:block.toArray().map(text => text.toDelta()),
        }));
      });
    }
    await first.screenshot({path:join(output,'shared-wiki.png')});
    item.stage = 'save-and-reopen';
    await page.getByTestId('wiki-submit-button').click();
    const confirm = page.getByTestId('wiki-confirm-message');
    const reader = page.getByTestId('wiki-page-content');
    await expect(confirm.or(reader).first()).toBeVisible();
    if (await confirm.isVisible()) await confirm.click();
    await expect(reader).toContainText(both);
    item.saved = await read();
    await peer.goto(url);
    const peerReader = peer.getByTestId('wiki-page-content');
    await expect(peerReader).toContainText(both);
    item.reopened = await peerReader.locator('p').last().innerText();
    item.bold = await peerReader.locator('strong').innerText();
    if (switchDraftToStock) {
      item.stage = 'unsaved-draft-before-rollback';
      const rollback = item.rollback = {};
      const writer = await edit(page);
      const witness = await edit(peer);
      const draft = both + ' Pending rollback review.';
      await append(page,writer.locator('p').filter({hasText:'Status:'}),' Pending rollback review.');
      await expect.poll(() => paragraphText(witness.locator('p').filter({hasText:'Status:'}))).toBe(draft);
      rollback.fountain = await editorProof(writer);
      expect(rollback.fountain.native).toBe(true);
      expect(await read()).toBe(item.saved);
      rollback.unsaved = draft;
      await writer.screenshot({path:join(output,'unsaved-before-rollback.png')});
      await page.goto('about:blank');
      // The cold rollback closes every native tab. The rolling case keeps one author at the same mounted editor.
      if (!mixedWiki) await peer.goto('about:blank');
      item.stage = 'reopen-live-room-on-stock';
      await switchDraftToStock({wikiSlug:item.slug});
      expect((await readFlag()).gates.find(value => value.key === 'actors')?.value).toEqual(item.gate);
      expect(await read()).toBe(item.saved);
      if (mixedWiki) {
        item.stage = 'mixed-editor-session';
        const stock = await edit(page,'original');
        const nativeLine = witness.locator('p').filter({hasText:'Status:'});
        const stockLine = stock.locator('p').filter({hasText:'Status:'});
        const mixed = item.mixed = {stock:await editorProof(stock), fountain:await editorProof(witness)};
        expect(mixed.stock.native).toBe(false);
        expect(mixed.fountain.native).toBe(true);
        const session = await peer.request.get(new URL('/api/v4/user', project.web_url).href);
        expect(session.status()).toBe(200);
        expect((await session.json()).id).toBe(identity.id);
        const verifyBoth = async expected => {
          const readBoth = () => Promise.all([paragraphText(stockLine),paragraphText(nativeLine)]);
          await expect.poll(readBoth,{timeout:30000}).toEqual([expected,expected]);
          return expected;
        };
        mixed.joined = await verifyBoth(draft);
        const fromStock = ' Stock edit.', fromFountain = ' Fountain edit.';
        item.stage = 'mixed-stock-to-fountain';
        await append(page,stockLine,fromStock);
        mixed.fromStock = await verifyBoth(draft + fromStock);
        item.stage = 'mixed-fountain-to-stock';
        await append(peer,nativeLine,fromFountain);
        mixed.fromFountain = await verifyBoth(draft + fromStock + fromFountain);
        // Each editor must undo its own edit even after it receives another user's change.
        item.stage = 'mixed-history';
        await stockLine.click();
        await page.keyboard.press('Control+z');
        mixed.stockUndo = await verifyBoth(draft + fromFountain);
        await nativeLine.click();
        await peer.keyboard.press('Control+z');
        mixed.fountainUndo = await verifyBoth(draft);
        await page.keyboard.press('Control+Shift+z');
        mixed.stockRedo = await verifyBoth(draft + fromStock);
        await peer.keyboard.press('Control+Shift+z');
        mixed.fountainRedo = await verifyBoth(draft + fromStock + fromFountain);
        item.stage = 'mixed-cursors';
        await stockLine.click();
        await page.keyboard.press('Home');
        await nativeLine.click();
        await peer.keyboard.press('End');
        await expect.poll(() => Promise.all([peerCursorVisible(stock,identity.name),peerCursorVisible(witness,owner.name)]),
          {timeout:10000}).toEqual([true,true]);
        mixed.cursors = [true,true];
        await stock.screenshot({path:join(output,'mixed-stock.png')});
        await witness.screenshot({path:join(output,'mixed-fountain.png')});
        expect(await read()).toBe(item.saved);
        item.stage = 'mixed-overlapping-edits';
        const leftAddition = ' Stock owner.', rightAddition = ' Fountain status.';
        const ownerLine = stock.locator('p').filter({hasText:'Owner:'});
        await ownerLine.click();
        await page.keyboard.press('End');
        await nativeLine.click();
        await peer.keyboard.press('End');
        // Observe the document each browser actually paints, including the transient
        // local-only draft. Concurrent dispatch by the driver alone is insufficient.
        const watch = (editor, local, remote) => editor.evaluateHandle((root, [own, other]) => {
          const observations = {localFirst:false, together:false};
          const observer = new MutationObserver(() => {
            const text = root.textContent;
            if (text.includes(own) && !text.includes(other)) observations.localFirst = true;
            if (text.includes(own) && text.includes(other)) observations.together = true;
          });
          observer.observe(root,{subtree:true,childList:true,characterData:true});
          return {observations,observer};
        },[local,remote]);
        const watchers = await Promise.all([watch(stock,leftAddition,rightAddition),watch(witness,rightAddition,leftAddition)]);
        try {
          await Promise.all([page.keyboard.insertText(leftAddition),peer.keyboard.insertText(rightAddition)]);
          mixed.concurrentStatus = await verifyBoth(mixed.fountainRedo + rightAddition);
          const nativeOwner = witness.locator('p').filter({hasText:'Owner:'});
          await expect.poll(() => Promise.all([paragraphText(ownerLine),paragraphText(nativeOwner)]))
            .toEqual(['Owner: Sam.' + leftAddition,'Owner: Sam.' + leftAddition]);
          mixed.concurrentOwner = await paragraphText(nativeOwner);
          mixed.overlap = await Promise.all(watchers.map(w => w.evaluate(({observations}) => observations)));
        } finally {
          await Promise.all(watchers.map(async w => {
            await w.evaluate(({observer}) => observer.disconnect());
            await w.dispose();
          }));
        }
        expect(mixed.overlap).toEqual([{localFirst:true,together:true},{localFirst:true,together:true}]);
        await stock.screenshot({path:join(output,'mixed-converged-stock.png')});
        await witness.screenshot({path:join(output,'mixed-converged-fountain.png')});
        item.stage = 'mixed-save-and-reopen';
        await page.getByTestId('wiki-submit-button').click();
        const confirm = page.getByTestId('wiki-confirm-message');
        const reader = page.getByTestId('wiki-page-content');
        await expect(confirm.or(reader).first()).toBeVisible();
        if (await confirm.isVisible()) await confirm.click();
        await expect(reader).toContainText(mixed.concurrentStatus);
        mixed.saved = await read();
        expect(mixed.saved).toBe('Owner: **Sam**.' + leftAddition + '\r\n\r\n' + mixed.concurrentStatus);
        await peer.goto(url);
        const peerReader = peer.getByTestId('wiki-page-content');
        await expect(peerReader.locator('p').first()).toHaveText(mixed.concurrentOwner);
        await expect(peerReader.locator('p').last()).toHaveText(mixed.concurrentStatus);
        await expect(peerReader.locator('strong')).toHaveText('Sam');
        mixed.reopened = true;
      } else {
        const clean = await page.context().browser().newContext();
        try {
          const restored = await clean.newPage();
          await member.signInMember(restored,{});
          await observePage(restored,item);
          const editor = await edit(restored,'original');
          rollback.stock = await editorProof(editor);
          expect(rollback.stock.native).toBe(false);
          const status = editor.locator('p').filter({hasText:'Status:'});
          await expect.poll(() => paragraphText(status),{timeout:20000}).toBe(draft);
          await expect(editor.locator('strong')).toHaveText('Sam');
          rollback.recovered = await paragraphText(status);
          await editor.screenshot({path:join(output,'stock-recovered-draft.png')});
          await append(restored,status,' Published.');
          await restored.getByTestId('wiki-submit-button').click();
          const confirm = restored.getByTestId('wiki-confirm-message');
          const reader = restored.getByTestId('wiki-page-content');
          await expect(confirm.or(reader).first()).toBeVisible();
          if (await confirm.isVisible()) await confirm.click();
          await expect(reader).toContainText(draft + ' Published.');
          rollback.saved = await read();
          expect(rollback.saved).toBe(item.saved + ' Pending rollback review. Published.');
          await restored.reload();
          await expect(reader.locator('p').last()).toHaveText(draft + ' Published.');
          await expect(reader.locator('strong')).toHaveText('Sam');
          rollback.reopened = true;
        } finally { await clean.close(); }
      }
    }
    item.status = 'observed';
    item.stage = 'complete';
  } catch (error) {
    item.failure = String(error);
    if (side === 'fountain') {
      const failed = page.locator('form.wiki-form [data-fountain-error]').first();
      if (await failed.count()) item.editorFailure = await failed.evaluate(root => {
        // Read the local fixture's retained editor error without copying its document or component state.
        let instance = root.__vue__ || root.__vueParentComponent?.proxy;
        if (!instance) {
          let appRoot = root;
          while (appRoot && !appRoot.__vue_app__) appRoot = appRoot.parentElement;
          const seen = new Set();
          function locate(vnode) {
            if (!vnode || seen.has(vnode)) return;
            seen.add(vnode);
            if (vnode.component?.proxy?.$el === root && vnode.component.proxy.failure) return vnode.component.proxy;
            return locate(vnode.component?.subTree) || (Array.isArray(vnode.children) && vnode.children.map(locate).find(Boolean));
          }
          instance = locate(appRoot?.__vue_app__?._container?._vnode);
        }
        return {code:root.dataset.fountainError,message:instance?.failure?.message};
      });
    }
    item.controls = await page.locator('form.wiki-form').ariaSnapshot({timeout:2000}).catch(() => '');
    await page.screenshot({path:join(output,'interrupted.png')}).catch(() => {});
  } finally {
    try {
      await second.close();
    } finally {
      try {
        if (membership?.access_level !== 30) {
          if (membership) await member.setRole(membership.access_level);
          else if (await readMember()) await request(members + '/' + member.account.id, {}, 'DELETE');
        }
        expect((await readMember())?.access_level).toBe(membership?.access_level);
      } finally {
        await request(endpoint, {namespace, value:'false'});
        if (before === null && (await readFlag())?.state === 'off') await request(endpoint, {}, 'DELETE');
        expect(await readFlag()).toEqual(before);
        item.restoredFlag = true;
      }
    }
  }
  return [item];
}
