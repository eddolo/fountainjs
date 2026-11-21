import { expect, it } from 'vitest';
import * as Y from 'yjs';
import { Schema } from 'fountainjs-editor';
import { createGitLabSchemaSpec, GitLabMarkdownCodec } from '../integrations/gitlab/services/markdown_codec';
import { readGitLabWikiRoom, toGitLabWikiJSON } from '../integrations/gitlab/services/wiki_room_document';

const schema = new Schema(createGitLabSchemaSpec(undefined,undefined,undefined,true));
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
    text.format(5,13,{link:{...attrs,isGollumLink:true}});
    const unsupported = Y.encodeStateAsUpdate(doc);
    expect(() => readGitLabWikiRoom(root,schema,Y)).toThrow('isGollumLink');
    expect(Y.encodeStateAsUpdate(doc)).toEqual(unsupported);
  } finally { doc.destroy(); }
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
