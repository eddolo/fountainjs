import {expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';

/** Read rendered task semantics; never access private editor state. */
export const taskEditingGraph=root=>{
 const text=node=>{const copy=node.cloneNode(true);for(const control of copy.querySelectorAll('button,input,ul,ol'))control.remove();return copy.textContent.trim();};
 const tasks=[...root.querySelectorAll('li')].flatMap(item=>{
  const checkbox=[...item.querySelectorAll('input[type="checkbox"]')].find(input=>input.closest('li')===item);if(!checkbox)return [];
  let depth=0;for(let parent=item.parentElement?.closest('li');parent;parent=parent.parentElement?.closest('li'))depth++;
  return [{text:text(item),checked:checkbox.checked,depth}];
 });
 return {headings:[...root.querySelectorAll('h2')].map(text),tasks,
  prose:[...root.querySelectorAll('p')].filter(node=>!node.closest('li')).map(text),
  bold:[...root.querySelectorAll('strong,b')].map(text)};
};
export async function runGitLabTaskCompatibility({side,runId,page,request,project,fixture,output,onProgress}){
 const observations=[],pause=()=>new Promise(resolve=>setTimeout(resolve,fixture.settlingMs));
 for(const input of fixture.cases){
  const result={id:input.id,input,status:'incomplete',stage:'setup',graphs:{},actions:[]};observations.push(result);
  const save=()=>writeFile(join(output,'observations.json'),JSON.stringify(observations,null,2)+'\n');
  const stage=async name=>{result.stage=name;onProgress({side,case:input.id,stage:name});await save();};
  try{
   const issue=await request(`/api/v4/projects/${project.id}/issues`,{title:input.title+' '+runId,description:input.markdown});
   const api=`/api/v4/projects/${project.id}/issues/${issue.iid}`;result.setup={iid:issue.iid,url:issue.web_url,description:issue.description};expect(issue.description).toBe(input.markdown);
   await page.goto(issue.web_url);await page.getByTestId('work-item-edit-form-button').click();
   const host=page.getByTestId('work-item-description-wrapper');
   const rich=async()=>{const switcher=host.getByRole('button',{name:'Switch to rich text editing',exact:true});if(await switcher.isVisible())await switcher.click();};await rich();
   const editor=host.locator(side==='original'?'.ProseMirror[contenteditable="true"]':'.fountain-editor[contenteditable="true"]');
   await expect(editor).toBeVisible({timeout:30000});await expect(host.locator(side==='original'?'.fountain-editor[contenteditable="true"]':'.ProseMirror[contenteditable="true"]')).toHaveCount(0);
   result.editorProof={native:await host.locator('[data-fountain-integration="native"]').count()>0,className:await editor.getAttribute('class')};
   const ready=async phase=>{await expect(editor.getByRole('heading',{name:'Task editing review',exact:true})).toBeVisible();await expect(editor.locator('input[type="checkbox"]')).toHaveCount(4);result.documentReady??={};result.documentReady[phase]=true;};
   const snapshot=async phase=>{await pause();result.graphs[phase]=await editor.evaluate(taskEditingGraph);await save();};
   const shot=async phase=>{await editor.scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:join(output,input.id+'-'+phase+'.png'),caret:'initial',animations:'disabled'});};
   const caret=()=>editor.evaluate(root=>{const s=window.getSelection();return {inside:root.contains(s?.anchorNode),activeInside:root.contains(document.activeElement),collapsed:s?.isCollapsed,text:s?.anchorNode?.textContent,offset:s?.anchorOffset};});
   await ready('initial');await snapshot('initial');await shot('initial');
   await stage('toggle');await editor.locator('input[type="checkbox"]').first().click();await snapshot('toggled');
   // A checkbox may own browser focus; return to its text before editor shortcuts.
   await editor.getByText('Draft brief',{exact:true}).click();await pause();await page.keyboard.press('Control+z');await snapshot('toggleUndo');
   await page.keyboard.press('Control+Shift+z');await snapshot('toggleRedo');
   await stage('new-task');await editor.getByText('Share draft',{exact:true}).click();await pause();await page.keyboard.press('End');await pause();await expect.poll(caret).toMatchObject({inside:true,activeInside:true,collapsed:true,text:'Share draft',offset:11});result.beforeEnter=await caret();
   await page.keyboard.press('Enter');await snapshot('newEmpty');
   result.emptyTaskLayout=await editor.evaluate(root=>{const all=[...root.querySelectorAll('li')].filter(item=>[...item.querySelectorAll('input[type="checkbox"]')].some(input=>input.closest('li')===item));const a=all.at(-2)?.getBoundingClientRect(),b=all.at(-1)?.getBoundingClientRect();return {previous:a&&{top:a.top,bottom:a.bottom,height:a.height},next:b&&{top:b.top,bottom:b.bottom,height:b.height},taskCount:all.length,visible:Boolean(all.length===5&&a&&b&&b.height>=12&&b.top>=a.bottom-1)};});
   result.emptyCaret=await caret();await shot('new-empty');await page.keyboard.insertText('Follow up');await snapshot('newFilled');
   await stage('remove-task');await page.keyboard.press('Home');await pause();await page.keyboard.press('Shift+End');await pause();result.selectedForRemoval=await page.evaluate(()=>window.getSelection()?.toString());expect(result.selectedForRemoval).toBe('Follow up');
   await page.keyboard.press('Backspace');await snapshot('cleared');await page.keyboard.press('Backspace');await snapshot('lifted');await shot('lifted');
   await page.keyboard.press('Control+z');await snapshot('liftUndo');await page.keyboard.press('Control+Shift+z');await snapshot('liftRedo');
   await stage('exit-list');await editor.getByText('Share draft',{exact:true}).click();await pause();await page.keyboard.press('End');await pause();
   await expect.poll(caret).toMatchObject({inside:true,activeInside:true,collapsed:true,text:'Share draft',offset:11});
   await page.keyboard.press('Enter');await snapshot('newBeforeExit');await page.keyboard.press('Enter');await snapshot('exited');
   result.exitCaret=await editor.evaluate(root=>{const s=window.getSelection(),node=s?.anchorNode,element=node?.nodeType===Node.ELEMENT_NODE?node:node?.parentElement;return {inside:root.contains(node),activeInside:root.contains(document.activeElement),collapsed:s?.isCollapsed,text:node?.textContent,offset:s?.anchorOffset,inTask:Boolean(element?.closest('li'))};});
   await shot('exited');await page.keyboard.insertText('Decision recorded.');await snapshot('final');await shot('final');
   result.actions.push('Actual checkbox click; Ctrl+Z/redo; Enter creates an empty task; text entry and selected-text deletion; Backspace removes the empty task; undo/redo; explicit Enter twice exits the list before ordinary paragraph entry.');
   await stage('save-reopen');const submit=page.getByRole('button',{name:'Save changes',exact:true});await submit.scrollIntoViewIfNeeded();result.saveButtonReachable=await submit.evaluate(node=>{const b=node.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return node===hit||node.contains(hit);});await submit.click();
   await expect.poll(async()=>{result.saved=await request(api);return result.saved.description!==input.markdown;},{timeout:30000}).toBe(true);
   await page.reload();await page.getByTestId('work-item-edit-form-button').click();await rich();await expect(editor).toBeVisible();await ready('reopened');await snapshot('reopened');await shot('reopened');
   result.status='observed';await stage('complete');
  }catch(error){result.error=String(error);await page.screenshot({path:join(output,input.id+'-failure.png'),fullPage:true,animations:'disabled'}).catch(()=>{});onProgress({side,case:input.id,stage:'incomplete',error:result.error});await save();}
 }
 return observations;
}
