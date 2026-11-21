import { expect } from '@playwright/test';
import { join } from 'node:path';
import { prepareGitLabAuditMember } from './gitlab-audit-member.mjs';
import { editorProof, observePage, openRich } from './gitlab-audit-editor.mjs';

import { checkPendingWikiUpload } from './audit-gitlab-wiki-pending-upload.mjs';

const wikiFlagPath = '/api/v4/features/wiki_collaborative_editing';
const readWikiFlag = async request => (await request('/api/v4/features')).find(flag => flag.name === 'wiki_collaborative_editing') ?? null;

export async function runWikiCollaboration(options) {
  const {wikiFlagAudit:audit,readStoredWikiFlag,request,project} = options;
  if (!audit) return runWikiEditors(options);
  const namespace = project.namespace.full_path;
  expect(project.namespace.kind).toBe('user');
  expect(namespace).toBe('root');
  const actor = 'Namespaces::UserNamespace:' + project.namespace.id;
  const scoped = [{key:'actors',value:actor}];
  async function snapshot() {
    const flag = await readWikiFlag(request);
    return {apiState:flag?.state ?? 'absent',apiGates:flag?.gates ?? [],stored:readStoredWikiFlag()};
  }
  audit.initial = await snapshot();
  const before = audit.initial.stored;
  if (before.gates.length) expect(before.gates).toEqual(scoped);
  const initialGates = audit.initial.apiGates.filter(({key,value}) =>
    !(key === 'boolean' && value === false) && !(key === 'expression' && value === null));
  const storedState = before.gates.length ? 'conditional' : before.exists ? 'off' : 'absent';
  expect(audit.initial.apiState,'GitLab wiki flag API and PostgreSQL disagree before editor setup').toBe(storedState);
  expect(initialGates).toEqual(before.gates.length ? [{key:'actors',value:[actor]}] : []);
  // The outer fixture owns only the scoped enable it creates. The editor
  // workflow must leave that configuration intact when it finishes.
  const prepare = audit.preconfigured && before.gates.length === 0;
  try {
    if (prepare) await request(wikiFlagPath,{namespace,value:'true'});
    if (audit.preconfigured) {
      audit.beforeEditors = await snapshot();
      expect(audit.beforeEditors.apiState).toBe('conditional');
      expect(audit.beforeEditors.stored).toEqual({exists:true,gates:scoped});
    }
    const observations = await runWikiEditors(options);
    audit.afterEditors = await snapshot();
    if (audit.preconfigured) expect(audit.afterEditors).toEqual(audit.beforeEditors);
    return observations;
  } finally {
    if (prepare) {
      await request(wikiFlagPath,{namespace,value:'false'});
      if (!before.exists && (await readWikiFlag(request))?.state === 'off') await request(wikiFlagPath,{},'DELETE');
    }
    audit.restored = await snapshot();
    expect(audit.restored).toEqual(audit.initial);
  }
}

async function runWikiEditors({page, request, project, fixture, side, runId, output, switchWikiDeployment, mixedWiki, wikiFlagAudit,readStoredWikiFlag,readIngress}) {
  const [input] = fixture.cases;
  const sourceEditor = side === 'original' ? 'stock' : 'fountain';
  const firstLabel = input.wikiLink?.peerLabel ?? input.wikiLink?.label;
  const finalLabel = input.wikiLink?.edited;
  const item = {id:input.id, input, stage:'setup', status:'incomplete', pageErrors:[]};
  const endpoint = wikiFlagPath;
  const readFlag = () => readWikiFlag(request);
  const before = await readFlag();
  const namespace = project.namespace.full_path;
  expect(project.namespace.kind).toBe('user');
  expect(namespace).toBe('root');
  const expectedActor = 'Namespaces::UserNamespace:' + project.namespace.id;
  const activeGates = before?.gates.filter(({key,value}) =>
    !(key === 'boolean' && value === false) && !(key === 'expression' && value === null));
  const alreadyScoped = before?.state === 'conditional' && activeGates.length === 1
    && activeGates[0].key === 'actors' && Array.isArray(activeGates[0].value)
    && activeGates[0].value.length === 1 && activeGates[0].value[0] === expectedActor;
  if (before && before.state !== 'off' && !alreadyScoped)
    throw new Error('Unexpected wiki collaboration flag configuration: ' + JSON.stringify({state:before.state,gates:before.gates}));
  item.initialFlagState = before?.state ?? 'absent';
  const member = await prepareGitLabAuditMember({project, request, fixture});
  const members = '/api/v4/projects/' + project.id + '/members';
  const readMember = async () => (await request(members + '?query=' + fixture.username)).find(value => value.id === member.account.id);
  const membership = await readMember();
  const second = await page.context().browser().newContext();
  try {
    const gate = alreadyScoped ? before : await request(endpoint, {namespace, value:'true'});
    item.gate = gate.gates.find(value => value.key === 'actors')?.value;
    expect(item.gate).toEqual([expectedActor]);
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
    let targetURL;
    if (input.wikiLink) {
      const {target,targetText} = input.wikiLink;
      const endpoint = wikis + '/' + encodeURIComponent(target);
      const response = await page.request.get(new URL(endpoint,project.web_url).href);
      if (response.status() === 404) await request(wikis,{title:target,content:targetText,format:'markdown'});
      const destination = await request(endpoint);
      expect(destination.content).toBe(targetText);
      targetURL = project.web_url + '/-/wikis/' + encodeURIComponent(destination.slug);
    }
    function expandReference(source) {
      const {reference,title} = input.wikiLink, path = new URL(targetURL).pathname;
      const ending = source.includes('\r\n') ? '\r\n' : '\n';
      return source.replace('[' + reference + ']: ' + path + ' "' + title + '"' + ending.repeat(2),'')
        .replaceAll('][' + reference + ']','](' + path + ' "' + title + '")');
    }
    async function checkWikiLinks(surface,label) {
      const links = [surface.getByRole('link',{name:label,exact:true}),
        surface.getByRole('link',{name:input.wikiLink.target,exact:true})];
      for (const link of links) {
        await expect(link).toBeVisible();
        expect(await link.evaluate(a => a.href)).toBe(targetURL);
        if (input.wikiLink.title) await expect.poll(() => link.evaluate(a => a.title || a.dataset.originalTitle)).toBe(input.wikiLink.title);
      }
      return {label,shorthand:input.wikiLink.target,destination:targetURL,...(input.wikiLink.title ? {title:input.wikiLink.title} : {})};
    }
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
    async function readerHeaderAlignment(surface) {
      const headers = surface.getByRole('table').filter({hasText:input.table.headings[0]}).locator('tr').first().locator('th');
      await expect(headers).toHaveCount(input.table.headings.length);
      return headers.evaluateAll(cells => cells.map(cell => ({
        text:cell.textContent.trim(),attribute:cell.getAttribute('align'),inline:cell.style.textAlign,
        computed:getComputedStyle(cell.querySelector('p') ?? cell).textAlign.replace(/^-webkit-/,''),
      })));
    }
    async function checkTable(surface, reviewed, revisedHours, headerAlignments = input.table.alignments) {
      const {headings,rows,alignments} = input.table;
      const expected = [headings,[rows[0][0] + (reviewed ? ' notes' : ''),rows[0][1]],
        [rows[1][0],rows[1][1] + (revisedHours ? '0' : '')]];
      const grid = surface.getByRole('table').filter({hasText:headings[0]});
      const snapshot = () => grid.evaluate(table => Array.from(table.rows, row => Array.from(row.cells, cell => {
        const content = cell.cloneNode(true);
        for (const cursor of content.querySelectorAll('.collaboration-cursor-caret,[data-fountain-collaborator]')) cursor.remove();
        const text = content.textContent.trim();
        const align = getComputedStyle(cell.querySelector('p') ?? cell).textAlign.replace(/^-webkit-/,'');
        return {tag:cell.tagName,text,align};
      })));
      const cells = expected.map((row,i) => row.map((text,j) => ({tag:i ? 'TD' : 'TH',text,align:(i ? alignments : headerAlignments)[j]})));
      await expect.poll(snapshot).toEqual(cells);
      return cells;
    }
    async function checkMergedTable(surface, ownerEdit = '', peerEdit = '') {
      const table = surface.getByRole('table').filter({hasText:'Sign-off'});
      const cell = (tag, paragraphs, rowSpan = 1, colSpan = 1) => ({tag,paragraphs,rowSpan,colSpan});
      const expected = [
        [cell('TH',['Sign-off'],1,2),cell('TH',['Contact'])],
        [cell('TD',['Operations','Night shift' + ownerEdit],2),cell('TD',['Primary']),cell('TD',['Lee'])],
        [cell('TD',['Backup']),cell('TD',['Pat' + peerEdit])],
      ];
      const snapshot = () => table.evaluate(table => Array.from(table.rows,row => Array.from(row.cells,cell => {
        const copy = cell.cloneNode(true);
        for (const cursor of copy.querySelectorAll('.collaboration-cursor-caret,[data-fountain-collaborator]')) cursor.remove();
        const paragraphs = Array.from(copy.querySelectorAll('p'),p => p.textContent.trim());
        return {tag:cell.tagName,paragraphs:paragraphs.length ? paragraphs : [copy.textContent.trim()],
          rowSpan:cell.rowSpan,colSpan:cell.colSpan};
      })));
      await expect.poll(snapshot).toEqual(expected);
      return snapshot();
    }
    async function checkLink(surface,label) {
      const link = surface.getByRole('link',{name:label,exact:true});
      await expect(link).toHaveAttribute('href',input.link.href);
      // GitLab moves the title to data-original-title while its Bootstrap link popover is open.
      const title = () => link.evaluate(element => {
        const tooltip = element.ownerDocument.getElementById(element.getAttribute('aria-describedby') ?? '');
        return element.title || (tooltip?.getAttribute('role') === 'tooltip' ? element.dataset.originalTitle : '');
      });
      await expect.poll(title).toBe(input.link.title);
      return {label:await link.innerText(),href:await link.getAttribute('href'),title:await title()};
    }
    async function checkStructure(surface, childText) {
      const {heading,parent,quote} = input.structure;
      const nested = surface.locator('ul > li > ul > li');
      await expect.poll(async () => (await paragraphText(surface.locator('h2'))).trim()).toBe(heading);
      await expect.poll(async () => (await paragraphText(surface.locator('blockquote'))).trim()).toBe(quote);
      await expect(surface.locator('li').filter({has:surface.page().locator('ul')})).toContainText(parent);
      await expect.poll(async () => (await paragraphText(nested)).trim()).toBe(childText);
      return {heading,quote,parent,childText};
    }
    async function append(tab, paragraph, text) {
      await paragraph.click();
      await tab.keyboard.press('End');
      await tab.keyboard.insertText(text);
    }
    item.stage = 'open-first-editor';
    let seedRendering;
    if ((input.structure || input.wikiLink) && side === 'fountain') {
      // Capture only the GitLab preview of this suite's known, generated source.
      seedRendering = page.waitForResponse(response => {
        if (response.request().method() !== 'POST' || !response.ok()) return false;
        const url = new URL(response.url());
        if (url.origin !== new URL(project.web_url).origin || !url.searchParams.has('no_header_anchors')) return false;
        try { return response.request().postDataJSON()?.text === input.source; } catch { return false; }
      },{timeout:20000}).then(async response => {
        const data = await response.json();
        return data.body ?? data.html;
      }).catch(() => undefined);
    }
    let first;
    try { first = await edit(page); }
    finally { if (seedRendering) item.seedRenderedHTML = await seedRendering; }
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
      if (input.wikiLink?.reference)
        item.stockSupportsReferenceDefinition = await first.evaluate(el => Boolean(el.editor?.schema.nodes.referenceDefinition));
      item.stockWire = await first.evaluate(element => {
        const state = element.editor?.state;
        const binding = state?.plugins.find(plugin => plugin.key.startsWith('y-sync$'))?.getState(state);
        function snapshot(node) {
          if (node.nodeName === undefined) return node.toDelta();
          return {name:node.nodeName,attrs:node.getAttributes(),children:node.toArray().map(snapshot)};
        }
        return binding?.type?.toArray().map(snapshot);
      });
    }
    if (input.wikiLink?.reference) {
      await other.locator('p').filter({hasText:'Consult '}).click();
      await peer.keyboard.press('Home');
      for (const _ of 'Consult Escalation ') await peer.keyboard.press('ArrowRight');
      await peer.keyboard.insertText('duty ');
      item.peerEditedLinks = await checkWikiLinks(first,firstLabel);
      expect(await read()).toBe(input.source);
    }
    await first.screenshot({path:join(output,'shared-wiki.png')});
    item.stage = 'save-and-reopen';
    const savingTab = input.wikiLink?.reference ? peer : page;
    await savingTab.getByTestId('wiki-submit-button').click();
    const confirm = savingTab.getByTestId('wiki-confirm-message');
    const reader = savingTab.getByTestId('wiki-page-content');
    await expect(confirm.or(reader).first()).toBeVisible();
    if (await confirm.isVisible()) await confirm.click();
    await expect(reader).toContainText(both);
    item.saved = await read();
    const readingTab = savingTab === peer ? page : peer;
    await readingTab.goto(url);
    const peerReader = readingTab.getByTestId('wiki-page-content');
    await expect(peerReader).toContainText(both);
    item.reopened = await peerReader.locator('p').last().innerText();
    item.bold = await peerReader.locator('strong').innerText();
    if (input.table) {
      item[sourceEditor + 'ReaderHeaders'] = await readerHeaderAlignment(peerReader);
      const headerAlignments = item[sourceEditor + 'ReaderHeaders'].map(cell => cell.computed);
      item[sourceEditor + 'ReaderTable'] = await checkTable(peerReader,false,false,headerAlignments);
      item[sourceEditor + 'ReaderMatchesAuthoredAlignment'] = headerAlignments.every((align,i) => align === input.table.alignments[i]);
      await peerReader.getByRole('table').filter({hasText:input.table.headings[0]}).screenshot({path:join(output,sourceEditor + '-reader-table.png')});
    }
    if (input.wikiLink) {
      item.initialPageLinks = await checkWikiLinks(peerReader,firstLabel);
      const authored = input.source.replace('[' + input.wikiLink.label + '][','[' + firstLabel + '][') + input.ownerEdit + input.peerEdit;
      const saved = item.saved.replaceAll('\r\n','\n');
      if (input.wikiLink.reference) {
        const inline = expandReference(authored);
        item.referenceSource = saved === authored ? 'shared-definition' : saved === inline ? 'expanded-inline' : 'other';
        if (side === 'fountain') expect(saved).toBe(authored);
        else expect([authored,inline]).toContain(saved);
      } else expect(saved).toBe(authored);
      if (!switchWikiDeployment) {
        await peerReader.screenshot({path:join(output,'saved-reference-links.png')});
        await peerReader.getByRole('link',{name:firstLabel,exact:true}).click();
        await expect(readingTab).toHaveURL(targetURL);
        item.visitedReference = await readingTab.getByTestId('wiki-page-content').innerText();
        expect(item.visitedReference).toBe(input.wikiLink.targetText);
      }
    }
    if (input.mergedTable) item[sourceEditor + 'ReaderMergedTable'] = await checkMergedTable(peerReader);
    if (input.upload) {
      await checkPendingWikiUpload({page,peer,item,edit,read,paragraphText,side,project,switchWikiDeployment,output,readIngress});
    } else if (switchWikiDeployment) {
      const rollout = side === 'original';
      const destination = rollout ? 'fountain' : 'original';
      item.stage = 'unsaved-draft-before-deployment';
      const handover = {};
      if (rollout) item.rollout = handover;
      else item.rollback = handover;
      const writer = await edit(page);
      const witness = await edit(peer);
      if (input.wikiLink && !input.wikiLink.reference && side === 'fountain') {
        item.stage = 'edit-wiki-alias-in-link-form';
        const temporary = 'Escalation contact list';
        await writer.getByRole('link',{name:input.wikiLink.label,exact:true}).click();
        await page.locator('form.wiki-form').getByRole('button',{name:'Insert or edit link',exact:true}).click();
        const dialog = page.getByRole('dialog',{name:'Edit link',exact:true});
        await expect(dialog.getByRole('textbox',{name:'Link URL',exact:true})).toHaveValue(input.wikiLink.target);
        await dialog.getByRole('textbox',{name:'Link text',exact:true}).fill(temporary);
        await dialog.getByRole('button',{name:'Apply link',exact:true}).click();
        handover.formPageLinks = await checkWikiLinks(witness,temporary);
        await writer.locator('p').filter({hasText:'Status:'}).click();
        await page.keyboard.press('Control+z');
        await checkWikiLinks(witness,input.wikiLink.label);
        expect(await read()).toBe(item.saved);
      }
      const pending = rollout ? ' Pending rollout review.' : ' Pending rollback review.';
      const draft = both + pending;
      await append(page,writer.locator('p').filter({hasText:'Status:'}),pending);
      await expect.poll(() => paragraphText(witness.locator('p').filter({hasText:'Status:'}))).toBe(draft);
      handover[rollout ? 'stock' : 'fountain'] = await editorProof(writer);
      expect(handover[rollout ? 'stock' : 'fountain'].native).toBe(!rollout);
      expect(await read()).toBe(item.saved);
      handover.unsaved = draft;
      if (input.structure) {
        const {child,pending} = input.structure;
        handover.beforeNestedEdit = await checkStructure(writer,child);
        if (input.link) handover[sourceEditor + 'Link'] = await checkLink(writer,input.link.label);
        await append(page,writer.locator('ul > li > ul > li p'),pending);
        handover[sourceEditor + 'Structure'] = await checkStructure(witness,child + pending);
        expect(await read()).toBe(item.saved);
      }
      if (input.table) {
        handover[sourceEditor + 'Table'] = await checkTable(writer,false,false);
        await append(page,writer.getByRole('table').filter({hasText:input.table.headings[0]}).locator('td p').first(),' notes');
        handover[sourceEditor + 'TableDraft'] = await checkTable(witness,true,false);
        expect(await read()).toBe(item.saved);
      }
      if (input.mergedTable) {
        item.stage = 'edit-' + sourceEditor + '-merged-cell';
        await checkMergedTable(writer);
        await append(page,writer.locator('td p').filter({hasText:'Night shift'}),' handoff');
        handover[sourceEditor + 'MergedDraft'] = await checkMergedTable(witness,' handoff');
        expect(await read()).toBe(item.saved);
      }
      await writer.screenshot({path:join(output,rollout ? 'unsaved-before-rollout.png' : 'unsaved-before-rollback.png')});
      await page.goto('about:blank');
      // The cold rollback closes every native tab. The rolling case keeps one author at the same mounted editor.
      if (!mixedWiki) await peer.goto('about:blank');
      item.stage = 'reopen-live-room-on-' + destination;
      if (wikiFlagAudit) {
        wikiFlagAudit.beforeSwitch = readStoredWikiFlag();
        expect(wikiFlagAudit.beforeSwitch).toEqual({exists:true,gates:[{key:'actors',value:expectedActor}]});
      }
      await switchWikiDeployment({wikiSlug:item.slug});
      const destinationFlag = await readFlag();
      if (wikiFlagAudit) {
        wikiFlagAudit.afterSwitch = {apiState:destinationFlag?.state ?? 'absent',stored:readStoredWikiFlag()};
        expect(wikiFlagAudit.afterSwitch.stored).toEqual(wikiFlagAudit.beforeSwitch);
      }
      expect(destinationFlag?.gates.find(value => value.key === 'actors')?.value).toEqual(item.gate);
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
          const editor = await edit(restored,destination);
          const proof = await editorProof(editor);
          handover[rollout ? 'fountain' : 'stock'] = proof;
          expect(proof.native).toBe(rollout);
          const status = editor.locator('p').filter({hasText:'Status:'});
          await expect.poll(() => paragraphText(status),{timeout:20000}).toBe(draft);
          await expect(editor.locator('strong')).toHaveText('Sam');
          handover.recovered = await paragraphText(status);
          if (input.structure) handover.recoveredStructure = await checkStructure(editor,input.structure.child + input.structure.pending);
          await editor.screenshot({path:join(output,(rollout ? 'fountain' : 'stock') + '-recovered-draft.png')});
          await append(restored,status,' Published.');
          if (rollout || input.structure) {
            await restored.keyboard.press('Control+z');
            await expect.poll(() => paragraphText(status)).toBe(draft);
            handover.afterUndo = await paragraphText(status);
            await restored.keyboard.press('Control+Shift+z');
            await expect.poll(() => paragraphText(status)).toBe(draft + ' Published.');
            expect(await read()).toBe(item.saved);
          }
          if (input.link) {
            item.stage = 'edit-recovered-link';
            handover.recoveredLink = await checkLink(editor,input.link.label);
            const line = editor.locator('p').filter({hasText:'before publishing.'});
            await line.click();
            await restored.keyboard.press('Home');
            for (const _ of 'Read the release ') await restored.keyboard.press('ArrowRight');
            await restored.keyboard.insertText('operator ');
            handover.editedLink = await checkLink(editor,input.link.editedLabel);
            await restored.keyboard.press('Control+z');
            await checkLink(editor,input.link.label);
            await expect.poll(() => paragraphText(status)).toBe(draft + ' Published.');
            await restored.keyboard.press('Control+Shift+z');
            await checkLink(editor,input.link.editedLabel);
            expect(await read()).toBe(item.saved);
          }
          if (input.table) {
            item.stage = 'edit-recovered-table';
            handover.recoveredTable = await checkTable(editor,true,false);
            await append(restored,editor.getByRole('table').filter({hasText:input.table.headings[0]}).locator('td p').last(),'0');
            handover.editedTable = await checkTable(editor,true,true);
            await restored.keyboard.press('Control+z');
            await checkTable(editor,true,false);
            if (input.link) await checkLink(editor,input.link.editedLabel);
            await restored.keyboard.press('Control+Shift+z');
            await checkTable(editor,true,true);
            expect(await read()).toBe(item.saved);
          }
          if (input.wikiLink) {
            item.stage = 'edit-recovered-wiki-link';
            handover.recoveredPageLinks = await checkWikiLinks(editor,firstLabel);
            await editor.locator('p').filter({hasText:'Consult '}).click();
            await restored.keyboard.press('Home');
            for (const _ of 'Consult Escalation ') await restored.keyboard.press('ArrowRight');
            await restored.keyboard.insertText('field ');
            await checkWikiLinks(editor,finalLabel);
            await restored.keyboard.press('Control+z');
            await checkWikiLinks(editor,firstLabel);
            await restored.keyboard.press('Control+Shift+z');
            await checkWikiLinks(editor,finalLabel);
            expect(await read()).toBe(item.saved);
          }
          if (input.mergedTable) {
            item.stage = 'edit-recovered-merged-table';
            handover.recoveredMergedTable = await checkMergedTable(editor,' handoff');
            await append(restored,editor.locator('td p').filter({hasText:'Pat'}),' Chen');
            await checkMergedTable(editor,' handoff',' Chen');
            await restored.keyboard.press('Control+z');
            await checkMergedTable(editor,' handoff');
            await restored.keyboard.press('Control+Shift+z');
            await checkMergedTable(editor,' handoff',' Chen');
          }
          await restored.getByTestId('wiki-submit-button').click();
          const confirm = restored.getByTestId('wiki-confirm-message');
          const reader = restored.getByTestId('wiki-page-content');
          await expect(confirm.or(reader).first()).toBeVisible();
          if (await confirm.isVisible()) await confirm.click();
          await expect(reader).toContainText(draft + ' Published.');
          handover.saved = await read();
          let expectedSource = item.saved;
          if (input.structure) {
            const {child,pending} = input.structure;
            expect(expectedSource.split(child)).toHaveLength(2);
            expectedSource = expectedSource.replace(child,child + pending);
          }
          if (input.link) {
            expect(expectedSource.split('[' + input.link.label + ']')).toHaveLength(2);
            expectedSource = expectedSource.replace('[' + input.link.label + ']','[' + input.link.editedLabel + ']');
          }
          if (input.table) {
            expect(expectedSource.split('| Review | 12 |')).toHaveLength(2);
            expect(expectedSource.split('| Deploy | 24 |')).toHaveLength(2);
            expectedSource = expectedSource.replace('| Review | 12 |','| Review notes | 12 |').replace('| Deploy | 24 |','| Deploy | 240 |');
          }
          if (input.mergedTable) {
            expect(expectedSource.split('Night shift')).toHaveLength(2);
            expect(expectedSource.split('Pat')).toHaveLength(2);
            expectedSource = expectedSource.replace('Night shift','Night shift handoff').replace('Pat','Pat Chen');
          }
          if (input.wikiLink) {
            const {reference} = input.wikiLink;
            const spelling = text => !reference ? '[[' + text + '|'
              : item.referenceSource === 'shared-definition' ? '[' + text + '][' + reference + ']' : '[' + text + '](';
            expect(expectedSource.split(spelling(firstLabel))).toHaveLength(2);
            expectedSource = expectedSource.replace(spelling(firstLabel),spelling(finalLabel));
          }
          const finalSource = expectedSource + pending + ' Published.';
          if (input.wikiLink?.reference && destination === 'original') {
            handover.referenceSource = handover.saved === finalSource ? item.referenceSource : 'expanded-inline';
            expect([finalSource,expandReference(finalSource)]).toContain(handover.saved);
          } else expect(handover.saved).toBe(finalSource);
          await restored.reload();
          await expect(reader.locator('p').last()).toHaveText(draft + ' Published.');
          await expect(reader.locator('strong')).toHaveText('Sam');
          if (input.table) {
            item.stage = 'verify-saved-reader-table';
            handover.readerHeaders = await readerHeaderAlignment(reader);
            expect(handover.readerHeaders).toEqual(item[sourceEditor + 'ReaderHeaders']);
            const headerAlignments = handover.readerHeaders.map(cell => cell.computed);
            handover.readerMatchesAuthoredAlignment = headerAlignments.every((align,i) => align === input.table.alignments[i]);
            handover.readerTable = await checkTable(reader,true,true,headerAlignments);
            await reader.getByRole('table').filter({hasText:input.table.headings[0]}).screenshot({path:join(output,'reopened-reader-table.png')});
          }
          if (input.mergedTable) {
            handover.readerMergedTable = await checkMergedTable(reader,' handoff',' Chen');
            await reader.getByRole('table').filter({hasText:'Sign-off'}).screenshot({path:join(output,'reopened-merged-table.png')});
          }
          if (input.link) handover.readerLink = await checkLink(reader,input.link.editedLabel);
          if (input.structure) {
            handover.readerStructure = await checkStructure(reader,input.structure.child + input.structure.pending);
            await reader.screenshot({path:join(output,'reopened-structured-wiki.png')});
          }
          if (input.wikiLink) {
            handover.readerPageLinks = await checkWikiLinks(reader,finalLabel);
            await reader.screenshot({path:join(output,'reopened-page-links.png')});
            await reader.getByRole('link',{name:finalLabel,exact:true}).click();
            await expect(restored).toHaveURL(targetURL);
            await expect(restored.getByTestId('wiki-page-content')).toHaveText(input.wikiLink.targetText);
            handover.visitedWiki = restored.url();
          }
          handover.reopened = true;
        } catch (error) {
          const failedTab = clean.pages().at(-1);
          if (failedTab) {
            handover.controls = await failedTab.locator('form.wiki-form').ariaSnapshot({timeout:2000}).catch(() => '');
            await failedTab.screenshot({path:join(output,'handover-interrupted.png')}).catch(() => {});
          }
          throw error;
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
        if (!alreadyScoped) {
          await request(endpoint, {namespace, value:'false'});
          if (before === null && (await readFlag())?.state === 'off') await request(endpoint, {}, 'DELETE');
        }
        const restored = await readFlag();
        try {
          expect(restored).toEqual(before);
          item.restoredFlag = true;
        } catch (error) {
          item.restoredFlag = false;
          item.cleanupFailure = String(error);
          item.status = 'incomplete';
        }
      }
    }
  }
  return [item];
}
