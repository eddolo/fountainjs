import { expect } from '@playwright/test';
import { join } from 'node:path';
import { prepareGitLabAuditMember } from './gitlab-audit-member.mjs';
import { editorProof, observePage, openRich } from './gitlab-audit-editor.mjs';

export async function runWikiCollaboration({page, request, project, fixture, side, runId, output}) {
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
    async function edit(tab) {
      await tab.goto(url);
      await tab.getByTestId('wiki-edit-button').click();
      return openRich(tab.locator('form.wiki-form'), side);
    }
    async function paragraphText(paragraph) {
      return paragraph.evaluate(element => {
        const content = element.cloneNode(true);
        for (const cursor of content.querySelectorAll('.collaboration-cursor-caret[aria-hidden="true"]')) cursor.remove();
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
    item.status = 'observed';
    item.stage = 'complete';
  } catch (error) {
    item.failure = String(error);
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
