import {expect,it} from 'vitest';
import {Selection,splitBlock,insertText,undo,redo,Schema} from 'fountainjs-editor';
import {GitLabContentEditor} from '../integrations/gitlab/services/content_editor';
import direction from '../integrations/gitlab/fixtures/direction-live-html.json';
import {GitLabMarkdownCodec,GitLabMarkdownConversionError,createGitLabSchemaSpec} from '../integrations/gitlab/services/markdown_codec';
import captures from '../integrations/gitlab/fixtures/task-live-html.json';

it('keeps a renderer-imported empty task serializable after Enter exits the list',async()=>{
 const fixture=captures.fixtures.find(item=>item.name==='empty')!;
 const service=new GitLabContentEditor({renderMarkdown:async()=>({body:fixture.body}),describeLabels:(_action,count)=>`${count} labels`});
 const issues:unknown[]=[];service.subscribeChange(change=>{if(change.status==='error')issues.push(change.error instanceof GitLabMarkdownConversionError ? change.error.issues : String(change.error));});
 try{
  await service.setSerializedContent(fixture.source);
  service.editor.dispatch(service.editor.createTransaction().setSelection(Selection.cursor([0,1,0,0],0)));
  expect(splitBlock(service.editor)).toBe(true);
  expect(issues).toEqual([]);
  expect(service.status).toBe('ready');
  expect(service.getSerializedContent()).toContain('<div dir="auto">');
  expect(service.getSerializedContent()).toContain('- [ ]');
  expect(insertText(service.editor,'Decision')).toBe(true);
  expect(service.status).toBe('ready');
  expect(service.getSerializedContent()).toContain('Decision');
  expect(undo(service.editor)).toBe(true);
  expect(service.status).toBe('ready');
  expect(redo(service.editor)).toBe(true);
  expect(service.getSerializedContent()).toContain('Decision');
 }finally{service.dispose();}
});

it('reopens the actual GitLab direction-container rendering as a shared context with a task',async()=>{
 const probe=direction.probes.find(item=>item.id==='markdown-container')!;
 const service=new GitLabContentEditor({renderMarkdown:async()=>({body:probe.response.html}),describeLabels:(_action,count)=>`${count} labels`});
 try{
  await service.setSerializedContent(probe.source);
  const scope=service.editor.state.doc.child(0);
  expect(scope.type.name).toBe('direction_scope');expect(scope.attrs.dir).toBe('auto');
  expect(scope.child(0).type.name).toBe('task_list');expect(scope.child(0).child(0).attrs.checked).toBe(false);
  expect(scope.textContent).toContain('Pending');expect(scope.textContent).toContain('Decision');
  expect(service.getSerializedContent()).toBe(probe.source);
 }finally{service.dispose();}
});

it('keeps nested conversion losses and unsupported direction grouping as hard failures',()=>{
 const spec=createGitLabSchemaSpec();
 const schema=new Schema({...spec,nodes:{...spec.nodes,custom_probe:{group:'block',content:'text*',toDOM:()=>['div',{},0]}}});
 const codec=new GitLabMarkdownCodec({renderMarkdown:async()=>({body:''})});
 const paragraph=schema.node('custom_probe',{},[schema.text('Unsupported custom block')]);
 const document=schema.node('doc',{},[schema.node('direction_scope',{dir:'rtl'},[paragraph])]);
 const report=codec.serializeWithReport({doc:document});
 expect(report.issues.some(issue=>issue.stage==='export'&&issue.path?.[0]===0)).toBe(true);
 expect(()=>codec.serialize({doc:document})).toThrow();
 const shared=schema.node('doc',{},[schema.node('direction_scope',{dir:'auto',directionGroup:'external'},[schema.node('paragraph',{},[schema.text('Retain grouping')])])]);
 expect(()=>codec.serialize({doc:shared})).toThrow();
});

it('keeps newly typed scoped slash text literal while retaining fenced source and explicit root commands',()=>{
 const schema=new Schema(createGitLabSchemaSpec());
 const codec=new GitLabMarkdownCodec({renderMarkdown:async()=>({body:''})});
 const paragraph=schema.node('paragraph',{},[schema.text('/close')]);
 const scoped=schema.node('doc',{},[schema.node('direction_scope',{dir:'auto'},[
  paragraph,schema.node('code_block',{language:'python'},[schema.text('/close')]),schema.node('paragraph',{},[schema.text('After')]),
 ])]);
 const markdown=codec.serialize({doc:scoped});
 expect(markdown).toContain('\\/close');
 expect(markdown).toContain('```python\n/close\n```');
 expect(codec.serialize({doc:schema.node('doc',{},[paragraph])})).toBe('/close');
});
