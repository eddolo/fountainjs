import {expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {taskEditingGraph} from './audit-gitlab-compatibility-tasks.mjs';

export async function runGitLabTaskRecoveryCompatibility({side,runId,page,request,project,fixture,output,onProgress}){
 const observations=[],pause=()=>new Promise(resolve=>setTimeout(resolve,fixture.settlingMs));
 for(const input of fixture.cases){
  const result={id:input.id,input,status:'incomplete',stage:'setup',graphs:{},actions:[]};observations.push(result);
  const save=()=>writeFile(join(output,'observations.json'),JSON.stringify(observations,null,2)+'\n');
  const stage=async name=>{result.stage=name;onProgress({side,case:input.id,stage:name});await save();};
  try{
   const issue=await request(`/api/v4/projects/${project.id}/issues`,{title:input.title+' '+runId,description:input.markdown});
   const api=`/api/v4/projects/${project.id}/issues/${issue.iid}`;result.setup={iid:issue.iid,url:issue.web_url,description:issue.description};expect(issue.description).toBe(input.markdown);expect(issue.state).toBe('opened');
   const host=page.getByTestId('work-item-description-wrapper');
   const editor=host.locator(side==='original'?'.ProseMirror[contenteditable="true"]':'.fountain-editor[contenteditable="true"]');
   const edit=async()=>{await page.getByTestId('work-item-edit-form-button').click();const switcher=host.getByRole('button',{name:'Switch to rich text editing',exact:true});if(await switcher.isVisible())await switcher.click();await expect(editor).toBeVisible({timeout:30000});await expect(editor.getByRole('heading',{name:'Task recovery',exact:true})).toBeVisible();await pause();};
   const snapshot=async phase=>{await pause();result.graphs[phase]=await editor.evaluate(taskEditingGraph);await save();};
   const shot=async phase=>{if(await editor.isVisible())await editor.scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:join(output,input.id+'-'+phase+'.png'),animations:'disabled',caret:'initial'});};
   const submit=async phase=>{const action=page.getByRole('button',{name:'Save changes',exact:true});await action.scrollIntoViewIfNeeded();result[phase+'Reachable']=await action.evaluate(node=>{const b=node.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return node===hit||node.contains(hit);});await action.click();await expect(editor).toBeHidden({timeout:30000});await expect.poll(async()=>{result[phase]=await request(api);return result[phase].description;},{timeout:30000}).not.toBe(result[phase==='saved'?'setup':'saved'].description);};
   await page.goto(issue.web_url);await edit();await expect(host.locator(side==='original'?'.fountain-editor[contenteditable="true"]':'.ProseMirror[contenteditable="true"]')).toHaveCount(0);
   result.editorProof={native:await host.locator('[data-fountain-integration="native"]').count()>0,className:await editor.getAttribute('class')};
   await snapshot('initial');await shot('initial');
   await stage('delete-populated-task');await editor.getByText('Remove this task',{exact:true}).click();await pause();await page.keyboard.press('Home');await pause();await page.keyboard.press('Shift+End');await pause();
   result.selectedTaskText=await page.evaluate(()=>window.getSelection()?.toString());expect(result.selectedTaskText).toBe('Remove this task');
   await page.keyboard.press('Backspace');await snapshot('cleared');await page.keyboard.press('Backspace');await snapshot('removed');await shot('removed');
   await page.keyboard.press('Control+z');await snapshot('removeUndo');await page.keyboard.press('Control+z');await snapshot('textUndo');
   await page.keyboard.press('Control+Shift+z');await snapshot('textRedo');await page.keyboard.press('Control+Shift+z');await snapshot('removeRedo');
   await stage('command-boundary');await editor.getByText('Write literal here.',{exact:true}).click();await pause();await page.keyboard.press('Home');await pause();await page.keyboard.press('Shift+End');await pause();
   result.selectedParagraph=await page.evaluate(()=>window.getSelection()?.toString());expect(result.selectedParagraph).toBe('Write literal here.');
   await page.keyboard.insertText('/close');await snapshot('final');await shot('before-save');
   await stage('save-reopen');await submit('saved');await page.reload();await edit();await snapshot('reopened');await shot('reopened');
   await stage('reopened-checkbox');const first=editor.locator('input[type="checkbox"]').first();result.reopenedCheckbox={visible:await first.isVisible(),enabled:await first.isEnabled()};await first.click();await snapshot('toggled');
   await editor.getByText('Keep first',{exact:true}).click();await pause();await page.keyboard.press('Control+z');await snapshot('toggleUndo');await page.keyboard.press('Control+Shift+z');await snapshot('toggleRedo');
   await submit('toggledSaved');await shot('reader-before');
   await stage('reader-checkbox');const checkbox=page.getByRole('checkbox',{name:'Check option: Keep last',exact:true});
   result.readerCheckbox={count:await checkbox.count()};result.readerCheckbox.visible=result.readerCheckbox.count===1&&await checkbox.isVisible();result.readerCheckbox.enabled=result.readerCheckbox.visible&&await checkbox.isEnabled();
   result.readerBefore=await request(api);
   if(result.readerCheckbox.enabled){await checkbox.click();await expect.poll(async()=>{result.readerAfter=await request(api);return result.readerAfter.task_completion_status?.completed_count;},{timeout:30000}).toBe(3).catch(()=>{});}
   result.readerAfter=await request(api);result.readerPersisted=result.readerAfter.task_completion_status?.count===4&&result.readerAfter.task_completion_status?.completed_count===3;await shot('reader-after');
   await page.reload();await edit();await snapshot('readerReopened');await shot('reader-reopened');
   result.actions.push('Real keyboard deletion, two undo/redo steps, literal versus active /close input, normal Save/reopen, actual reopened checkbox and reader checkbox clicks. APIs only establish fixtures and inspect persisted state.');
   result.status='observed';await stage('complete');
  }catch(error){result.error=String(error);await page.screenshot({path:join(output,input.id+'-failure.png'),fullPage:true,animations:'disabled'}).catch(()=>{});onProgress({side,case:input.id,stage:'incomplete',error:result.error});await save();}
 }
 return observations;
}
