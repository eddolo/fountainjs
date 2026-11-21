import { expect, it } from 'vitest';
import * as Y from 'yjs';
import { GitLabContentEditor } from '../integrations/gitlab/services/content_editor';
import { Schema } from 'fountainjs-editor';
import rollout from '../integrations/gitlab/fixtures/compatibility-wiki-rollout.json';
import seedPreview from '../integrations/gitlab/fixtures/wiki-structured-seed-render.html?raw';
import { createGitLabSchemaSpec, GitLabMarkdownCodec } from '../integrations/gitlab/services/markdown_codec';
import { readGitLabWikiRoom, sameWikiDocument, toGitLabWikiJSON } from '../integrations/gitlab/services/wiki_room_document';

const schema = new Schema(createGitLabSchemaSpec(undefined,undefined,undefined,true));
it('maps a stock peer’s edit to the actual location even when adjacent letters are identical', async () => {
  const doc = new Y.Doc(), root = doc.getXmlFragment('default');
  const first = new Y.XmlElement('paragraph'), second = new Y.XmlElement('paragraph');
  root.push([first, second]);
  const repeated = new Y.XmlText('aaaaaa');
  first.push([repeated]);
  second.push([new Y.XmlText('Attach here')]);
  const unused = () => { throw new Error('A remote-only test must never seed or write the room'); };
  const service = new GitLabContentEditor({
    renderMarkdown: unused, describeLabels: () => '',
    wikiCollaboration: async () => ({
      provider:{doc,connected:true,whenSynced:Promise.resolve({seed:false}),seed:unused,identityFor:()=>null,
        awareness:{getStates:()=>new Map(),setLocalStateField:()=>{},on:()=>{},off:()=>{}}},
      wire:{types:Y,stockSchema:{nodeFromJSON:unused},updateYFragment:unused},colorFor:()=> '#468',
    }),
  });
  try {
    await service.setSerializedContent('aaaaaa\n\nAttach here');
    const ranges: (readonly number[])[] = [];
    service.editor.subscribe((_state,tr) => {
      if (tr.docChanged) ranges.push(...tr.mapping.maps.map(map => map.ranges));
    });
    repeated.insert(2,'a');
    expect(ranges.splice(0)).toEqual([[3,0,1]]);
    repeated.delete(4,2);
    expect(ranges.splice(0)).toEqual([[5,2,0]]);
    repeated.format(0,2,{bold:{}});
    expect(service.editor.state.doc.child(0).child(0).marks[0].type.name).toBe('strong');
    const firstBlockSize = service.editor.state.doc.child(0).nodeSize;
    expect(ranges.splice(0)).toEqual([[0,firstBlockSize,firstBlockSize]]);
    expect(service.editor.state.doc.child(1).textContent).toBe('Attach here');
  } finally { service.dispose(); doc.destroy(); }
});

it('shows file notices only for known peers, clears departed peers, and keeps notices out of wiki content', async () => {
  const doc = new Y.Doc(), room = doc.getXmlFragment('default');
  const paragraph = new Y.XmlElement('paragraph');
  room.push([paragraph]);
  paragraph.push([new Y.XmlText('Draft')]);
  const peerId = doc.clientID + 1;
  const states = new Map<number,{fountainWikiFiles?:unknown}>();
  let update = () => {};
  const unused = () => { throw new Error('A peer notice must never write or seed a wiki document'); };
  const service = new GitLabContentEditor({
    renderMarkdown:unused, describeLabels:()=> '',
    wikiCollaboration:async () => ({
      provider:{doc,connected:true,whenSynced:Promise.resolve({seed:false}),seed:unused,
        identityFor:id => id === peerId ? {id:2,name:'Author'} : null,
        awareness:{getStates:()=>states,setLocalStateField:()=>{},on:(_event,fn)=>{ update=fn; },off:()=>{}}},
      wire:{types:Y,stockSchema:{nodeFromJSON:unused},updateYFragment:unused},colorFor:()=> '#468',
    }),
  });
  try {
    const seen: (readonly string[])[] = [];
    service.subscribePeerWikiUploads(files => seen.push(files));
    await service.setSerializedContent('Draft');
    const bytes = Y.encodeStateAsUpdate(doc);
    states.set(doc.clientID,{fountainWikiFiles:['local.txt']});
    states.set(peerId+1,{fountainWikiFiles:['unknown.txt']});
    states.set(peerId,{fountainWikiFiles:['a.txt',null,'b.txt']});
    update();
    update();
    expect(seen).toEqual([['a.txt','b.txt']]);
    states.delete(peerId);
    update();
    expect(seen).toEqual([['a.txt','b.txt'],[]]);
    expect(service.getSerializedContent()).toBe('Draft');
    expect(Y.encodeStateAsUpdate(doc)).toEqual(bytes);
  } finally { service.dispose(); doc.destroy(); }
});

it('round-trips the editable caret in an empty wiki paragraph without writing a zero-length ProseMirror text node', () => {
  const doc = new Y.Doc();
  try {
    const room = doc.getXmlFragment('default');
    room.push([new Y.XmlElement('paragraph'),new Y.XmlElement('paragraph')]);
    const recovered = readGitLabWikiRoom(room,schema,Y);
    expect(recovered.child(1).child(0).text).toBe('');
    expect(toGitLabWikiJSON(recovered).content).toEqual([{type:'paragraph'},{type:'paragraph'}]);
    const empty = schema.node('paragraph');
    expect(sameWikiDocument(recovered,schema.node('doc',{},[empty,empty]))).toBe(true);
    const space = schema.node('paragraph',{},[schema.text(' ')]);
    expect(sameWikiDocument(recovered,schema.node('doc',{},[empty,space]))).toBe(false);
    expect(toGitLabWikiJSON(schema.node('doc',{},[space])).content?.[0].content?.[0].text).toBe(' ');
  } finally { doc.destroy(); }
});

it('reads a stock keyboard edit without changing Yjs state or folding distinct formatting runs', () => {
  const doc = new Y.Doc();
  try {
    const root = doc.getXmlFragment('default');
    const paragraph = new Y.XmlElement('paragraph'), text = new Y.XmlText();
    root.push([paragraph]);
    paragraph.push([text]);
    text.applyDelta([{insert:'Press '},{insert:'F15',attributes:{bold:{}}},{insert:'.'}]);
    const bytes = Y.encodeStateAsUpdate(doc);
    const native = readGitLabWikiRoom(root,schema,Y);
    expect(native.child(0).child(1).marks[0].type.name).toBe('strong');
    expect(toGitLabWikiJSON(native)).toEqual({type:'doc',content:[{type:'paragraph',content:[
      {type:'text',text:'Press '},{type:'text',text:'F15',marks:[{type:'bold'}]},{type:'text',text:'.'},
    ]}]});
    expect(Y.encodeStateAsUpdate(doc)).toEqual(bytes);
    text.format(0,1,{custom_annotation:{id:'a'}});
    const unsupported = Y.encodeStateAsUpdate(doc);
    expect(() => readGitLabWikiRoom(root,schema,Y)).toThrow('custom_annotation');
    expect(Y.encodeStateAsUpdate(doc)).toEqual(unsupported);
  } finally { doc.destroy(); }
});

it('retains nested stock wiki bullet markers in the shared draft and saved Markdown', () => {
  const doc = new Y.Doc();
  try {
    const room = doc.getXmlFragment('default');
    const list = (container:Y.XmlFragment, bullet:string, label:string) => {
      const block = new Y.XmlElement<Record<string,string>>('bulletList');
      container.push([block]);
      block.setAttribute('bullet',bullet);
      const item = new Y.XmlElement('listItem'), paragraph = new Y.XmlElement('paragraph');
      block.push([item]);
      item.push([paragraph]);
      paragraph.push([new Y.XmlText(label)]);
      return item;
    };
    const outer = list(room,'*','Verify the service');
    list(outer,'+','Check the logs');
    list(room,'-','Close the incident');
    const document = readGitLabWikiRoom(room,schema,Y);
    const codec = new GitLabMarkdownCodec({wikiRoom:true,renderMarkdown:async () => ({body:''})});
    expect(codec.serialize({doc:document})).toBe('* Verify the service\n  + Check the logs\n\n- Close the incident');
    const json = toGitLabWikiJSON(document);
    expect(json.content?.[0].content?.[0].content?.[1].attrs?.bullet).toBe('+');
    expect(json.content?.[1].attrs?.bullet).toBe('-');
  } finally { doc.destroy(); }
});

it('preserves the rendered and authored destinations of ordinary links in a stock wiki room', () => {
  const doc = new Y.Doc();
  try {
    const root = doc.getXmlFragment('default'), paragraph = new Y.XmlElement('paragraph'), text = new Y.XmlText();
    root.push([paragraph]);
    paragraph.push([text]);
    const attrs = {href:'https://example.org/project/runbook',title:'Publishing steps',canonicalSrc:'./runbook',
      uploading:false,isGollumLink:false,isWikiPage:false,isReference:false};
    text.applyDelta([{insert:'Read '},{insert:'release guide',attributes:{link:attrs}},{insert:'.'}]);
    const roomBytes = Y.encodeStateAsUpdate(doc);
    const document = readGitLabWikiRoom(root,schema,Y);
    expect(document.child(0).child(1).marks[0].attrs).toMatchObject({
      href:attrs.href,title:attrs.title,gitlabCanonicalSrc:attrs.canonicalSrc,
    });
    const codec = new GitLabMarkdownCodec({renderMarkdown:async () => ({body:''})});
    expect(codec.serialize({doc:document})).toBe('Read [release guide](./runbook "Publishing steps").');
    expect(toGitLabWikiJSON(document).content?.[0].content?.[1].marks?.[0]).toMatchObject({
      type:'link',attrs:{href:attrs.href,title:attrs.title,canonicalSrc:attrs.canonicalSrc},
    });
    expect(Y.encodeStateAsUpdate(doc)).toEqual(roomBytes);
    text.format(5,13,{link:{...attrs,isReference:true}});
    const unsupported = Y.encodeStateAsUpdate(doc);
    expect(() => readGitLabWikiRoom(root,schema,Y)).toThrow('isReference');
    expect(Y.encodeStateAsUpdate(doc)).toEqual(unsupported);
  } finally { doc.destroy(); }
});

it('keeps the uploader’s temporary file handle inert until the stock author publishes its resolution', () => {
  const doc = new Y.Doc();
  try {
    const root = doc.getXmlFragment('default'), p = new Y.XmlElement('paragraph'), text = new Y.XmlText();
    root.push([p]); p.push([text]);
    const href = 'blob:http://127.0.0.1:5080/6df42113-b54c-4f32-b7e6-27e906bf99d0';
    const attrs = {uploading:'file12',href,title:null,canonicalSrc:null,isReference:false,isWikiPage:false,isGollumLink:false};
    text.applyDelta([{insert:'evidence.txt',attributes:{link:attrs}}]);
    const version = Y.encodeStateAsUpdate(doc);
    const pending = readGitLabWikiRoom(root,schema,Y);
    const mark = pending.child(0).child(0).marks[0];
    expect(mark.type.name).toBe('gitlab_pending_wiki_file');
    expect(mark.type.spec.toDOM!(mark)).toEqual(['span',{'data-fountain-pending-wiki-file':'true','aria-busy':'true'},0]);
    expect(toGitLabWikiJSON(pending).content?.[0].content?.[0].marks).toEqual([{type:'link',attrs:{uploading:'file12',href}}]);
    const codec = new GitLabMarkdownCodec({wikiRoom:true,renderMarkdown:async () => ({body:''})});
    expect(codec.serializeWithReport({doc:pending})).toMatchObject({markdown:'',issues:[{code:'pending-wiki-upload'}]});
    expect(Y.encodeStateAsUpdate(doc)).toEqual(version);
    text.format(0,text.length,{link:{...attrs,uploading:false,href:'/files/evidence.txt',canonicalSrc:'uploads/evidence.txt'}});
    expect(codec.serialize({doc:readGitLabWikiRoom(root,schema,Y)})).toBe('[evidence.txt](uploads/evidence.txt)');
    text.format(0,text.length,{link:{...attrs,href:'https://example.invalid/'}});
    expect(() => readGitLabWikiRoom(root,schema,Y)).toThrow();
  } finally { doc.destroy(); }
});

it('retains the wiki target independently of the edited display label', async () => {
  const doc = new Y.Doc();
  try {
    const room = doc.getXmlFragment('default'), p = new Y.XmlElement('paragraph'), text = new Y.XmlText();
    room.push([p]); p.push([text]);
    const slug = 'escalation-guide', href = '/project/-/wikis/' + slug;
    const attrs = {href,canonicalSrc:slug,isWikiPage:true,isGollumLink:true,uploading:false,isReference:false,title:null};
    text.applyDelta([{insert:'See '},{insert:'Escalation guide',attributes:{link:attrs}},{insert:' or '},
      {insert:slug,attributes:{link:attrs}},{insert:'.'}]);
    const codec = new GitLabMarkdownCodec({wikiRoom:true,renderMarkdown:async () => ({body:''})});
    const document = readGitLabWikiRoom(room,schema,Y);
    expect(codec.serialize({doc:document})).toBe('See [[Escalation guide|escalation-guide]] or [[escalation-guide]].');
    expect(toGitLabWikiJSON(document).content?.[0].content?.[1].marks?.[0].attrs).toMatchObject({
      href,canonicalSrc:slug,isGollumLink:true,isWikiPage:true,
    });
    const mark = document.child(0).child(1).marks[0];
    const ambiguous = schema.node('doc',{},[schema.node('paragraph',{},[schema.text('A|B',[mark])])]);
    expect(codec.serializeWithReport({doc:ambiguous}).issues.map(issue => issue.code)).toContain('wiki-link-source');
  } finally { doc.destroy(); }
});

it('retains the author’s shared link definition after a remote wiki edit recreates every node', async () => {
  const definition = '[on-call]: /wiki/on-call "Team guide"';
  const source = ['See [the team][on-call].','Use [this guide][on-call].',definition,'Status: ready.'].join('\n\n');
  const html = ['See <a href="/wiki/on-call" title="Team guide">the team</a>.',
    'Use <a href="/wiki/on-call" title="Team guide">this guide</a>.','Status: ready.']
    .map(text => '<p dir="auto">' + text + '</p>').join('\n');
  const codec = new GitLabMarkdownCodec({wikiRoom:true,renderMarkdown:async () => ({body:html})});
  const seed = await codec.deserialize({schema,markdown:source,signal:new AbortController().signal,wikiRoomSeed:true});
  const remote = schema.nodeFromJSON(seed.document.toJSON());
  expect(codec.serialize({doc:remote})).toBe(source);
  const edited = remote.copy([...remote.content.slice(0,-1),schema.node('paragraph',{},[schema.text('Status: ready. Reviewed.')])]);
  expect(codec.serialize({doc:edited})).toBe(source + ' Reviewed.');
  expect(codec.serialize({doc:schema.node('doc',{},[schema.node('paragraph',{},[schema.text('Other document')])])})).toBe('Other document');
});

it('seeds stock-compatible structures from the real wiki preview', async () => {
  const markdown = rollout.cases[0].source;
  const codec = new GitLabMarkdownCodec({wikiRoom:true,renderMarkdown:async () => ({body:seedPreview})});
  const {document} = await codec.deserialize({schema,markdown,signal:new AbortController().signal,wikiRoomSeed:true});
  const stock = toGitLabWikiJSON(document);
  expect(stock.content?.map(node => node.type)).toEqual(['heading','paragraph','bulletList','blockquote','paragraph','table','table','paragraph']);
  expect(stock.content?.[5].attrs?.isMarkdown).toBe(true);
  expect(stock.content?.[6].attrs?.isMarkdown).toBe(false);
  expect(stock.content?.[5].content?.[0].content?.[1].attrs?.align).toBe('right');
  expect(stock.content?.[6].content?.[1].content?.[0].content).toHaveLength(2);
  expect(stock.content?.[4].content?.[1].marks?.[0]).toMatchObject({type:'link',attrs:{title:'Publishing steps'}});

  const mixed = markdown.replace('* Verify','- Verify').replace('* Check','+ Check');
  const {document:withMarkers} = await codec.deserialize({schema,markdown:mixed,signal:new AbortController().signal,wikiRoomSeed:true});
  const list = toGitLabWikiJSON(withMarkers).content?.[2];
  expect(list?.attrs?.bullet).toBe('-');
  expect(list?.content?.[0].content?.[1].attrs?.bullet).toBe('+');

  const {document:mismatch} = await codec.deserialize({schema,markdown:markdown.replace('Release handover','Other heading'),
    signal:new AbortController().signal,wikiRoomSeed:true});
  expect(() => toGitLabWikiJSON(mismatch)).toThrow('heading.align');
});

it('round-trips a shared GitLab table with aligned headers and body cells', () => {
  const doc = new Y.Doc();
  try {
    const root = doc.getXmlFragment('default');
    const table = new Y.XmlElement<Record<string,any>>('table');
    root.push([table]);
    table.setAttribute('isMarkdown',true);
    for (const [index,values] of [['Stage','Hours'],['Review','12']].entries()) {
      const row = new Y.XmlElement('tableRow');
      table.push([row]);
      values.forEach((value,column) => {
        const cell = new Y.XmlElement<Record<string,any>>(index ? 'tableCell' : 'tableHeader');
        row.push([cell]);
        cell.setAttribute('align',column ? 'right' : 'center');
        cell.setAttribute('colspan',1);
        cell.setAttribute('rowspan',1);
        const paragraph = new Y.XmlElement('paragraph');
        cell.push([paragraph]);
        paragraph.push([new Y.XmlText(value)]);
      });
    }
    const bytes = Y.encodeStateAsUpdate(doc);
    const document = readGitLabWikiRoom(root,schema,Y);
    expect(document.child(0).child(0).child(1).child(0).attrs.align).toBe('right');
    const codec = new GitLabMarkdownCodec({wikiRoom:true,renderMarkdown:async () => ({body:''})});
    expect(codec.serialize({doc:document})).toBe('| Stage | Hours |\n|:-----:|------:|\n| Review | 12 |');
    const stock = toGitLabWikiJSON(document).content![0];
    expect(stock.attrs).toEqual({isMarkdown:true});
    expect(stock.content![0].content![0]).toMatchObject({type:'tableHeader',attrs:{align:'center',colspan:1,rowspan:1}});
    expect(stock.content![1].content![1]).toMatchObject({type:'tableCell',attrs:{align:'right'}});
    expect(Y.encodeStateAsUpdate(doc)).toEqual(bytes);

    const nativeTable = document.child(0), header = nativeTable.child(0), firstCell = header.child(0);
    const mixed = firstCell.copy([...firstCell.content,schema.node('paragraph',{align:'right'},[schema.text('Second')])]);
    const edited = document.copy([nativeTable.copy([header.copy([mixed,header.child(1)]),nativeTable.child(1)])]);
    expect(() => toGitLabWikiJSON(edited)).toThrow('mixed or unsupported cell alignment');
    expect(Y.encodeStateAsUpdate(doc)).toEqual(bytes);
  } finally { doc.destroy(); }
});

it('writes merged wiki cells and distinct paragraphs in the pinned GitLab source format', () => {
  const paragraph = (text: string) => schema.node('paragraph',{},[schema.text(text)]);
  const header = schema.node('table_header',{colspan:2},[paragraph('Sign-off')]);
  const team = schema.node('table_cell',{rowspan:2},[paragraph('Operations'),paragraph('Night shift handoff')]);
  const cell = (text: string) => schema.node('table_cell',{},[paragraph(text)]);
  const table = schema.node('table',{gitlabIsMarkdown:false},[
    schema.node('table_row',{},[header]),
    schema.node('table_row',{},[team,cell('Lee')]),
    schema.node('table_row',{},[cell('Pat Chen')]),
  ]);
  const codec = new GitLabMarkdownCodec({wikiRoom:true,renderMarkdown:async () => ({body:''})});
  expect(codec.serialize({doc:schema.node('doc',{},[table])})).toBe([
    '<table>','<tr>','<th colspan="2">Sign-off</th>','</tr>','<tr>',
    '<td rowspan="2">','','Operations','','Night shift handoff','</td>',
    '<td>Lee</td>','</tr>','<tr>','<td>Pat Chen</td>','</tr>','</table>',
  ].join('\n'));

  // A line consisting of an ordered-list marker cannot be emitted as a bare paragraph.
  const literal = schema.node('table_cell',{rowspan:2},[paragraph('1.'),paragraph('<td>')]);
  const rich = table.copy([table.child(0),table.child(1).copy([literal,cell('Lee')]),table.child(2)]);
  expect(codec.serialize({doc:schema.node('doc',{},[rich])})).toContain('<p>1.</p><p>&lt;td&gt;</p>');
});

it('retains heading levels and refuses unrepresentable attributes in both directions', () => {
  const doc = new Y.Doc();
  try {
    const root = doc.getXmlFragment('default');
    const heading = new Y.XmlElement<Record<string,any>>('heading');
    root.push([heading]);
    heading.setAttribute('level',3);
    const native = readGitLabWikiRoom(root,schema,Y);
    expect(toGitLabWikiJSON(native).content?.[0]).toEqual({type:'heading',attrs:{level:3}});
    heading.setAttribute('sourceId','external-42');
    expect(() => readGitLabWikiRoom(root,schema,Y)).toThrow('heading.sourceId');
    const centered = schema.node('doc',{},[schema.node('paragraph',{align:'center'},[schema.text('Draft')])]);
    expect(() => toGitLabWikiJSON(centered)).toThrow('paragraph.align');
  } finally { doc.destroy(); }
});
