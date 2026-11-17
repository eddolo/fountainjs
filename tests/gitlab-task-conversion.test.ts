import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,expect,it} from 'vitest';
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
 it('keeps the existing host extraction path for unverified quoted prefixes',()=>{
  const source='> - [ ] Convert\n> \n>   ```python\n>   def identity(value):\n>       return value\n>   ```\nAfter';
  expect(load().deleteTaskListItem(source,'1:3-6:20')).toEqual(load(false).deleteTaskListItem(source,'1:3-6:20'));
 });
 it('refuses applying the host patch at an unknown or ambiguous boundary',()=>{
  expect(()=>prepareGitLabTaskConversion(source.replace('taskDescription.push','other.push'))).toThrow();
  expect(()=>prepareGitLabTaskConversion(source+"\n  const firstLineIndentation = firstLine.length - firstLine.trimStart().length;")).toThrow();
 });
});
