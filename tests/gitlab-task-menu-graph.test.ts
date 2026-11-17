/** @vitest-environment jsdom */
import {expect,it} from 'vitest';
import readerDOM from '../integrations/gitlab/fixtures/task-reader-live-dom.json';
import fixtures from '../integrations/gitlab/fixtures/task-live-html.json';
// @ts-expect-error Private browser audit helper has no published type declaration.
import {taskMenuGraph} from '../scripts/audit-gitlab-compatibility-task-menu.mjs';
const body=(html:string)=>new DOMParser().parseFromString(html,'text/html').body;
it('distinguishes captured not-applicable state from ordinary disabled reader inputs',()=>{
 const fixture=fixtures.fixtures.find(item=>item.name==='inapplicable')!;
 expect(taskMenuGraph(body(fixture.body)).tasks.map((task:{state:string})=>task.state)).toEqual(['inapplicable','pending','completed']);
});
it('keeps captured authored strike while excluding the generated not-applicable decoration',()=>{
 const fixture=fixtures.fixtures.find(item=>item.name==='inapplicable-marked')!;
 const graph=taskMenuGraph(body(fixture.body));expect(graph.tasks[0].state).toBe('inapplicable');expect(graph.strikes).toEqual(['authored strike']);
});
it('reads equivalent orphan HTML prose and paragraph wrappers in flow order',()=>{
 const a=body('<div><h2>Reader actions</h2><div><ul><li>Task</li></ul></div>Reader marker. Verified.<div><p>Next paragraph.</p></div></div>');
 const b=body('<div><h2>Reader actions</h2><div><ul><li>Task</li></ul></div><p>Reader marker. Verified.</p><div><p>Next paragraph.</p></div></div>');
 expect(taskMenuGraph(a).prose).toEqual(['Reader marker. Verified.','Next paragraph.']);expect(taskMenuGraph(a)).toEqual(taskMenuGraph(b));
});
it.each(readerDOM.cases)('observes the real reader DOM without losing equivalent prose: $name',fixture=>{
 expect(taskMenuGraph(body(fixture.html))).toEqual(fixture.expectedGraph);
});
