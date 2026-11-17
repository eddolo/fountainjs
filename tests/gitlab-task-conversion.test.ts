import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,expect,it} from 'vitest';
import rendererFixtures from '../integrations/gitlab/fixtures/task-containers-renderer.json';
import containerFixtures from '../integrations/gitlab/fixtures/compatibility-task-containers.json';
import {MarkdownImporter,Schema,type Node} from 'fountainjs-editor';
import {GitLabContentEditor} from '../integrations/gitlab/services/content_editor';
import {createGitLabSchemaSpec} from '../integrations/gitlab/services/markdown_codec';
import {createGitLabTaskBodyExtractor} from '../integrations/gitlab/services/task_body_extractor.js';
import {prepareGitLabTaskConversion} from '../integrations/gitlab/services/task_conversion_patch.mjs';
const source=readFileSync(new URL('../integrations/gitlab/fixtures/task-conversion-upstream.js',import.meta.url),'utf8');
interface Extracted {newDescription:string;taskDescription:string|undefined;taskTitle:string}
function load(prepared=true):{deleteTaskListItem:(text:string,pos:string)=>Extracted}{
 const code=(prepared?prepareGitLabTaskConversion(source):source).replace(/^import .*;\n/gmu,'').replace(/^export /gmu,'');
 return runInNewContext(code+'\n({deleteTaskListItem})',{createGitLabTaskBodyExtractor,TITLE_LENGTH_MAX:255,COLON:':',HYPHEN:'-',NEWLINE:'\n',__:(value:string)=>value});
}
const code='def identity(value):\n    return value';
function fixture(marker:string,prefix:string,body:string=code){
 const lines=['Before',marker+(marker.endsWith('\t')?'':' ')+'[ ] Convert',...['','```python',...body.split('\n'),'```',''].map(line=>prefix+line),prefix+'- [ ] Keep child','After'];
 return {source:lines.join('\n'),pos:`2:1-${lines.length-1}:100`};
}
describe('source-retaining host checklist extraction',()=>{
 it.each([['-','  '],['*','  '],['+','  '],['10.','    '],['10)','    '],['  -','    '],['-\t','\t']])('preserves fenced Python under %s', (marker,prefix)=>{
  const value=fixture(marker,prefix),result=load().deleteTaskListItem(value.source,value.pos);
  expect(result.taskTitle).toBe('Convert');expect(result.taskDescription).toBe('\n```python\n'+code+'\n```\n');
  expect(result.newDescription).toBe('Before\n'+(marker.startsWith('  ')?'  ':'')+'- [ ] Keep child\nAfter');
 });
 it('reproduces the pinned original loss instead of asserting only the replacement behavior',()=>{
  const value=fixture('-','  ');expect(load(false).deleteTaskListItem(value.source,value.pos).taskDescription).toBe('\n```python\ndef identity(value):\nreturn value\n```\n');
 });
 it('does not mistake a checkbox-looking line inside a fence for a nested task',()=>{
  const value=fixture('-','  ','- [ ] literal source\n    keep indentation');const result=load().deleteTaskListItem(value.source,value.pos);
  expect(result.taskDescription).toBe('\n```python\n- [ ] literal source\n    keep indentation\n```\n');expect(result.newDescription).toBe('Before\n- [ ] Keep child\nAfter');
 });
 it('keeps indented-code task syntax in the child source',()=>{
  const result=load().deleteTaskListItem('- [ ] Convert\n\n      - [ ] source\n  - [ ] Keep child\nKeep sibling','1:1-4:20');
  expect(result.taskDescription).toBe('\n    - [ ] source');expect(result.newDescription).toBe('- [ ] Keep child\nKeep sibling');
 });
 it('keeps tabs, trailing spaces and invisible code points within the technical source',()=>{
  const body='\tvalue = "\u200b\u00a0"  \n\t\treturn value';const value=fixture('-','  ',body);
  expect(load().deleteTaskListItem(value.source,value.pos).taskDescription).toBe('\n```python\n'+body+'\n```\n');
 });
 it('promotes a tab-indented descendant by columns while retaining its relative source',()=>{
  const result=load().deleteTaskListItem('-\t[ ] Convert\n\tDetail\n\t- [ ] Child\n\t  Continued\nSibling','1:1-4:30');
  expect(result.taskDescription).toBe('Detail');expect(result.newDescription).toBe('- [ ] Child\n  Continued\nSibling');
 });
 it('requires a same-character sufficiently long closing fence',()=>{
  const source='- [ ] Convert\n  ````python\n  ~~~~\n  - [ ] still code\n  ```\n  - [ ] also code\n  ````\n  - [ ] Keep child';
  const result=load().deleteTaskListItem(source,'1:1-8:30');expect(result.taskDescription).toBe('````python\n~~~~\n- [ ] still code\n```\n- [ ] also code\n````');expect(result.newDescription).toBe('- [ ] Keep child');
 });
 it('removes only structural tab columns, retaining the remaining indentation',()=>{
  const body=createGitLabTaskBodyExtractor('- [ ] Task');expect(body.strip('\tvalue')).toBe('  value');expect(body.strip('  \tvalue')).toBe('\tvalue');
 });
 it('recognizes CRLF fences without rewriting technical source line endings',()=>{
  const result=load().deleteTaskListItem('- [ ] Convert\r\n  ```python\r\n  - [ ] literal\r\n      tail\r\n  ```\r\n  - [ ] Child\r\nAfter','1:1-6:30');
  expect(result.taskTitle).toBe('Convert');expect(result.taskDescription).toBe('```python\r\n- [ ] literal\r\n    tail\r\n```\r');expect(result.newDescription).toBe('- [ ] Child\r\nAfter');
 });
 it('keeps the existing host extraction path for unrecognized custom prefixes',()=>{
  const source='custom: - [ ] Convert\n  Detail\nAfter';
  expect(load().deleteTaskListItem(source,'1:1-2:20')).toEqual(load(false).deleteTaskListItem(source,'1:1-2:20'));
 });
 it('refuses applying the host patch at an unknown or ambiguous boundary',()=>{
  expect(()=>prepareGitLabTaskConversion(source.replace('taskDescription.push','other.push'))).toThrow();
  expect(()=>prepareGitLabTaskConversion(source+"\n  const firstLineIndentation = firstLine.length - firstLine.trimStart().length;")).toThrow();
 });
});

function ownership(document:Node){
 const tasks:{depth:number;quoteDepth:number}[]=[];const codes:string[]=[];let quotes=0;
 const visit=(node:Node,depth:number,quoteDepth:number)=>{
  if(node.type.name==='task_item')tasks.push({depth,quoteDepth});
  if(node.type.name==='code_block')codes.push(node.textContent);
  if(node.type.name==='blockquote')quotes++;
  for(const child of node.content)visit(child,depth+(['task_item','list_item'].includes(node.type.name)?1:0),quoteDepth+(node.type.name==='blockquote'?1:0));
 };visit(document,0,0);return {tasks,codes,quotes};
}
describe('source-position conversion through real renderer container boundaries',()=>{
 it.each(rendererFixtures.fixtures)('keeps $id source, promoted descendants and outer ownership',async capture=>{
  const input=containerFixtures.cases.find(item=>item.id===capture.id)!;
  const service=new GitLabContentEditor({describeLabels:()=>'',renderMarkdown:async markdown=>{expect(markdown).toBe(capture.source);return {body:capture.html};}});
  try{
   await service.setSerializedContent(capture.source);
   const initial=ownership(service.editor.state.doc),expectedDepths=input.expectedParent.tasks.map(task=>task.depth),target=input.targetOrdinal??1,depth=expectedDepths[target];expectedDepths[target]=depth+1;expectedDepths.splice(target,0,depth);
   expect(initial.tasks.map(task=>task.depth)).toEqual(expectedDepths);expect(initial.tasks.map(task=>task.quoteDepth)).toEqual(input.expectedInitialQuotes.taskQuoteDepths);expect(initial.codes).toEqual([input.expectedCode]);
   const result=load().deleteTaskListItem(capture.source,capture.targetSourcepos);
   expect(result.taskTitle).toBe('Convert this item');expect(result.taskDescription!.replace(/^\n+|\n+$/gu,'')).toBe(input.expectedDescription);
   const parent=ownership(MarkdownImporter.parse(result.newDescription,new Schema(createGitLabSchemaSpec())));
   expect(parent.tasks.map(task=>task.depth)).toEqual(input.expectedParent.tasks.map(task=>task.depth));expect(parent.tasks.map(task=>task.quoteDepth)).toEqual(input.expectedParent.taskQuoteDepths);expect(parent.quotes).toBe(input.expectedParent.quoteBlockCount);expect(parent.codes).toEqual([]);
  }finally{service.dispose();}
 });
 it('keeps a quote authored inside the task while removing only its outer quote',()=>{
  const result=load().deleteTaskListItem('> - [ ] Convert\n>   > Inner quotation\n>   - [ ] Keep child\nAfter','1:3-3:30');
  expect(result.taskTitle).toBe('Convert');expect(result.taskDescription).toBe('> Inner quotation');expect(result.newDescription).toBe('> - [ ] Keep child\nAfter');
 });
 it('keeps lazy quoted paragraph text and literal code tabs',()=>{
  const result=load().deleteTaskListItem('> - [ ] Convert\n>   Detail\ncontinued\n>   ```python\n>   \tvalue\n>   ```\n>   - [ ] Keep child','1:3-7:30');
  expect(result.taskDescription).toBe('Detail\ncontinued\n```python\n\tvalue\n```');expect(result.newDescription).toBe('> - [ ] Keep child');
 });
 it('retains inline outer containers and CRLF source endings',()=>{
  const result=load().deleteTaskListItem('- > - [ ] Convert\r\n  >   ```python\r\n  >   value\r\n  >   ```\r\n  >   - [ ] Child\r\nAfter','1:5-5:30');
  expect(result.taskTitle).toBe('Convert');expect(result.taskDescription).toBe('```python\r\nvalue\r\n```\r');expect(result.newDescription).toBe('- >\r\n  > - [ ] Child\r\nAfter');
 });
 it('removes a quoted leaf without deleting the enclosing siblings',()=>{
  const result=load().deleteTaskListItem('> - [ ] Keep before\n> - [ ] Delete\n> - [x] Keep after','2:3-2:16');expect(result.newDescription).toBe('> - [ ] Keep before\n> - [x] Keep after');
 });
 it('retains the legacy path for unverified tabbed quote prefixes',()=>{
  const source='>\t- [ ] Convert\n>\t  Detail';expect(load().deleteTaskListItem(source,'1:3-2:20')).toEqual(load(false).deleteTaskListItem(source,'1:3-2:20'));
 });
});
