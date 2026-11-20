import { expect, it } from 'vitest';
import * as Y from 'yjs';
import { Schema } from 'fountainjs-editor';
import { createGitLabSchemaSpec } from '../integrations/gitlab/services/markdown_codec';
import { readGitLabWikiRoom, toGitLabWikiJSON } from '../integrations/gitlab/services/wiki_room_document';

const schema = new Schema(createGitLabSchemaSpec());
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
