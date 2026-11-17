import {expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';

export const taskMenuGraph=root=>{
 const text=node=>{const copy=node.cloneNode(true);for(const control of copy.querySelectorAll('button,input,ul,ol,svg'))control.remove();return copy.textContent.trim();};
 const tasks=[...root.querySelectorAll('li')].flatMap(item=>{
  const checkbox=[...item.querySelectorAll('input[type="checkbox"]')].find(input=>input.closest('li')===item);if(!checkbox)return [];
  let depth=0;for(let parent=item.parentElement?.closest('li');parent;parent=parent.parentElement?.closest('li'))depth++;
  const inactive=item.getAttribute('data-checked')==='inapplicable'||item.hasAttribute('data-inapplicable')||checkbox.hasAttribute('data-inapplicable')||item.classList.contains('inapplicable');
  return [{text:text(item),state:inactive?'inapplicable':checkbox.checked?'completed':'pending',depth}];
 });
 const prose=[];
 const flow=container=>{
  let inline='';const flush=()=>{if(inline.trim())prose.push(inline.trim());inline='';};
  for(const child of container.childNodes){
   if(child.nodeType===3){inline+=child.textContent;continue;}
   if(child.nodeType!==1)continue;
   const tag=child.tagName;
   if(tag==='P'){flush();prose.push(text(child));}
   else if(tag==='DIV'||tag==='SECTION'){flush();flow(child);}
   else if(tag==='BR'){flush();}
   else if(['H1','H2','H3','H4','H5','H6','UL','OL','BUTTON','INPUT','SVG'].includes(tag)){flush();}
   else inline+=text(child);
  }
  flush();
 };
 flow(root);
 return {headings:[...root.querySelectorAll('h2')].map(text),tasks,prose,
  bold:[...root.querySelectorAll('strong,b')].map(text),strikes:[...root.querySelectorAll('s,del,strike')].filter(node=>!node.classList.contains('inapplicable')).map(text)};
};
export async function runGitLabTaskMenuCompatibility({side,runId,page,request,project,fixture,output,onProgress}){
 const observations=[],pause=()=>new Promise(resolve=>setTimeout(resolve,fixture.settlingMs));
 for(const input of fixture.cases){
  const result={id:input.id,input,status:'incomplete',stage:'setup',graphs:{},actions:[]};observations.push(result);
  const save=()=>writeFile(join(output,'observations.json'),JSON.stringify(observations,null,2)+'\n');
  const stage=async name=>{result.stage=name;onProgress({side,case:input.id,stage:name});await save();};
  try{
   const issue=await request(`/api/v4/projects/${project.id}/issues`,{title:input.title+' '+runId,description:input.markdown});
   const api=`/api/v4/projects/${project.id}/issues/${issue.iid}`;result.setup={iid:issue.iid,url:issue.web_url,description:issue.description};expect(issue.description).toBe(input.markdown);
   const host=page.getByTestId('work-item-description-wrapper'),reader=page.locator('.js-work-item-description');
   const editor=host.locator(side==='original'?'.ProseMirror[contenteditable="true"]':'.fountain-editor[contenteditable="true"]');
   const edit=async()=>{await page.getByTestId('work-item-edit-form-button').click();const switcher=host.getByRole('button',{name:'Switch to rich text editing',exact:true});if(await switcher.isVisible())await switcher.click();await expect(editor).toBeVisible({timeout:30000});await expect(editor.getByRole('heading',{name:'Reader actions',exact:true})).toBeVisible();await pause();};
   const snapshot=async(phase,root)=>{await pause();result.graphs[phase]=await root.evaluate(taskMenuGraph);if(['readerBefore','retainedReader','deletedReader'].includes(phase)){result.readerHTML??={};result.readerHTML[phase]=await root.innerHTML();}await save();};
   const shot=async phase=>{await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:join(output,input.id+'-'+phase+'.png'),animations:'disabled',caret:'initial'});};
   const submit=async phase=>{const before=await request(api),action=page.getByRole('button',{name:'Save changes',exact:true});await action.scrollIntoViewIfNeeded();result[phase+'Reachable']=await action.evaluate(node=>{const b=node.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return node===hit||node.contains(hit);});await action.click();await expect(editor).toBeHidden({timeout:30000});await expect.poll(async()=>{result[phase]=await request(api);return result[phase].description;},{timeout:30000}).not.toBe(before.description);await expect(reader.locator('h2').filter({hasText:'Reader actions'})).toBeVisible();await pause();result.readerReadiness??=[];result.readerReadiness.push({phase,legacyRootCount:await page.getByTestId('work-item-description').count(),legacyExactHeadingCount:await page.getByTestId('work-item-description').getByRole('heading',{name:'Reader actions',exact:true}).count(),heading:await reader.locator('h2').filter({hasText:'Reader actions'}).evaluate(node=>({text:node.textContent,html:node.outerHTML}))});};
   const append=async(text,value)=>{await editor.getByText(text,{exact:true}).click();await pause();await page.keyboard.press('End');await pause();await expect.poll(()=>page.evaluate(()=>{const s=window.getSelection();return {text:s?.anchorNode?.textContent,offset:s?.anchorOffset,collapsed:s?.isCollapsed};})).toEqual({text,offset:text.length,collapsed:true});await page.keyboard.insertText(value);};
   const menu=async(phase,label)=>{
    const checkbox=reader.getByRole('checkbox',{name:input.target.label,exact:true}).nth(input.target.ordinal),item=checkbox.locator('xpath=ancestor::li[1]');
    const before=await request(api);await item.hover();const trigger=item.getByRole('button',{name:'Checklist item actions',exact:true});await trigger.click();
    const receipt=await item.evaluate(node=>{let depth=0;for(let parent=node.parentElement?.closest('li');parent;parent=parent.parentElement?.closest('li'))depth++;const copy=node.cloneNode(true);for(const control of copy.querySelectorAll('button,input,ul,ol,svg'))control.remove();return {text:copy.textContent.trim(),depth,sourcepos:node.getAttribute('data-sourcepos')};});
    result[phase]={target:receipt,before};await shot(phase+'-menu');
    const match=receipt.sourcepos?.match(/^(\d+):(\d+)-(\d+):(\d+)$/u),lines=before.description.split('\n');
    let expected;
    if(match&&match[1]===match[3]){const index=Number(match[1])-1,line=lines[index];if(typeof line==='string'){
     if(phase==='disabled'&&line.includes('[ ]')){lines[index]=line.replace('[ ]','[~]');expected=lines.join('\n');}
     else if(phase==='restored'&&line.includes('[~]')){lines[index]=line.replace('[~]','[ ]');expected=lines.join('\n');}
     else if(phase==='deleted'){lines.splice(index,1);expected=lines.join('\n');}
    }}
    const action=page.getByRole('menuitem',{name:label,exact:true}).or(page.getByRole('button',{name:label,exact:true}));await expect(action).toHaveCount(1);await action.click();
    await expect.poll(async()=>{result[phase].after=await request(api);return result[phase].after.description;},{timeout:30000}).not.toBe(before.description);
    result[phase].sourceDeltaExact=expected!==undefined&&result[phase].after.description===expected;await pause();await save();
   };
   await page.goto(issue.web_url);await edit();await expect(host.locator(side==='original'?'.fountain-editor[contenteditable="true"]':'.ProseMirror[contenteditable="true"]')).toHaveCount(0);
   result.editorProof={native:await host.locator('[data-fountain-integration="native"]').count()>0,className:await editor.getAttribute('class')};
   await snapshot('initial',editor);await append('Reader marker.',' Verified.');await snapshot('authored',editor);await submit('saved');await snapshot('readerBefore',reader);
   await stage('disable-nested-duplicate');await menu('disabled','Disable list item');await snapshot('disabledReader',reader);await shot('disabled-reader');
   await page.reload();await edit();await snapshot('disabledEditor',editor);await shot('disabled-editor');
   await stage('retain-third-state');await append('Reader marker. Verified.',' Retained.');await snapshot('retainedEditor',editor);await submit('retained');result.thirdStateSourceRetained=/\[~\] Repeated task/u.test(result.retained.description);await snapshot('retainedReader',reader);await shot('retained-reader');
   await stage('restore-nested-duplicate');await menu('restored','Enable list item');await snapshot('restoredReader',reader);await shot('restored-reader');
   await stage('delete-nested-duplicate');await menu('deleted','Delete');await snapshot('deletedReader',reader);await shot('deleted-reader');
   await page.reload();await edit();await snapshot('reopenedFinal',editor);await shot('reopened-final');
   result.actions.push('Actual reader menu disable/enable/delete on the nested duplicate, with a rich-editor reopen and unrelated edit while disabled. APIs only create fixtures and inspect results. Source deltas are checked against the exact pre-action text.');
   result.status='observed';await stage('complete');
  }catch(error){result.error=String(error);await page.screenshot({path:join(output,input.id+'-failure.png'),fullPage:true,animations:'disabled'}).catch(()=>{});onProgress({side,case:input.id,stage:'incomplete',error:result.error});await save();}
 }
 return observations;
}
