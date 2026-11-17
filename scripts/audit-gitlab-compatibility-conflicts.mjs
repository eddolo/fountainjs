import {expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';

export const conflictGraph=root=>{
 const copy=root.cloneNode(true);for(const anchor of copy.querySelectorAll('a.anchor'))anchor.remove();
 return {headings:[...copy.querySelectorAll('h2')].map(n=>n.textContent.trim()),
  prose:[...copy.querySelectorAll('p')].filter(n=>!n.closest('li')).map(n=>n.textContent.trim()),
  bold:[...copy.querySelectorAll('strong,b')].map(n=>n.textContent),
  links:[...copy.querySelectorAll('a[href]')].map(n=>({text:n.textContent,href:n.getAttribute('href')})),
  codes:[...copy.querySelectorAll('pre code')].map(n=>n.textContent.replace(/\n$/u,''))};
};
export async function runGitLabConflictCompatibility({side,runId,page,request,project,fixture,output,onProgress}){
 const observations=[],pause=()=>new Promise(resolve=>setTimeout(resolve,fixture.settlingMs));
 for(const input of fixture.cases){
  const result={id:input.id,input,status:'incomplete',stage:'setup',graphs:{},actions:[]};observations.push(result);
  const save=()=>writeFile(join(output,'observations.json'),JSON.stringify(observations,null,2)+'\n');
  const stage=async name=>{result.stage=name;onProgress({side,case:input.id,stage:name});await save();};
  let remoteContext;
  try{
   const issue=await request(`/api/v4/projects/${project.id}/issues`,{title:input.title+' '+runId,description:input.markdown});
   const api=`/api/v4/projects/${project.id}/issues/${issue.iid}`;expect(issue.description).toBe(input.markdown);
   result.setup={iid:issue.iid,url:issue.web_url,description:issue.description};
   // Authentication state is copied only in memory, before either session authors a draft.
   remoteContext=await page.context().browser().newContext({storageState:await page.context().storageState(),viewport:{width:1280,height:900},deviceScaleFactor:1,locale:'en-US',timezoneId:'UTC'});
   const remote=await remoteContext.newPage();remote.on('pageerror',error=>{(result.remoteErrors??=[]).push(error.message);});
   result.independentContexts=remote.context()!==page.context();
   const wrapper=target=>target.getByTestId('work-item-description-wrapper');
   const editor=target=>wrapper(target).locator(side==='original'?'.ProseMirror[contenteditable="true"]':'.fountain-editor[contenteditable="true"]');
   const open=async target=>{await target.getByTestId('work-item-edit-form-button').click();const toggle=wrapper(target).getByRole('button',{name:'Switch to rich text editing',exact:true});if(await toggle.isVisible())await toggle.click();await expect(editor(target).getByRole('heading',{name:'Concurrent review',exact:true})).toBeVisible({timeout:30000});await expect(editor(target).getByText('End marker.',{exact:true})).toBeVisible({timeout:30000});await pause();};
   const proof=async target=>({native:await wrapper(target).locator('[data-fountain-integration="native"]').count()>0,className:await editor(target).getAttribute('class')});
   const source=async target=>{await wrapper(target).getByRole('button',{name:'Switch to plain text editing',exact:true}).click();const field=wrapper(target).getByTestId('markdown-editor-form-field');await expect(field).toBeVisible();const value=await field.inputValue();await wrapper(target).getByRole('button',{name:'Switch to rich text editing',exact:true}).click();await expect(editor(target)).toBeVisible();await pause();return value;};
   const append=async(target,text,suffix)=>{await editor(target).getByText(text,{exact:true}).click();await target.keyboard.press('End');await pause();await expect.poll(()=>target.evaluate(()=>{const s=window.getSelection();return {collapsed:s?.isCollapsed,text:s?.anchorNode?.textContent,offset:s?.anchorOffset};})).toEqual({collapsed:true,text,offset:text.length});await target.keyboard.insertText(suffix);await pause();await expect(editor(target).getByText(text+suffix,{exact:true})).toBeVisible();};
   const shot=async(target,name)=>{await target.evaluate(()=>document.fonts.ready);await target.screenshot({path:join(output,input.id+'-'+name+'.png'),animations:'disabled',caret:'initial'});};
   await page.goto(issue.web_url);await open(page);result.editorProof=await proof(page);result.graphs.initial=await editor(page).evaluate(conflictGraph);
   await remote.goto(issue.web_url);await open(remote);result.remoteEditorProof=await proof(remote);result.graphs.remoteInitial=await editor(remote).evaluate(conflictGraph);
   await stage('local-draft');await append(page,'Shared record.',input.localSuffix);result.graphs.local=await editor(page).evaluate(conflictGraph);result.localSource=await source(page);
   result.serverBeforeRemote=await request(api);
   await stage('remote-save');await append(remote,'Shared record.',input.remoteSuffix);result.remoteSource=await source(remote);await wrapper(remote).getByRole('button',{name:'Save changes',exact:true}).click();await expect(editor(remote)).toBeHidden({timeout:30000});
   await expect.poll(async()=>{result.remoteSaved=await request(api);return result.remoteSaved.description;},{timeout:30000}).toBe(result.remoteSource);
   const remoteReader=remote.locator('.js-work-item-description');await expect(remoteReader.getByText('Shared record.'+input.remoteSuffix,{exact:true})).toBeVisible();result.graphs.remoteSaved=await remoteReader.evaluate(conflictGraph);await shot(remote,'remote-saved');
   await stage('observe-conflict');const conflict=wrapper(page).getByRole('alert').filter({hasText:'Someone edited the description at the same time you did.'});
   result.conflictObserved=await conflict.isVisible();const deadline=Date.now()+fixture.conflictObservationMs;while(!result.conflictObserved&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,500));result.conflictObserved=await conflict.isVisible();}
   result.serverBeforeResolution=await request(api);result.noAutomaticOverwrite=result.serverBeforeResolution.description===result.remoteSaved.description;
   result.localSourceAfterRemote=await source(page);result.localDraftRetained=result.localSourceAfterRemote===result.localSource;
   result.conflictSourceExact=false;result.conflictSourceReadonly=false;
   if(result.conflictObserved){await conflict.locator('summary').filter({hasText:'View current version'}).click();const current=conflict.getByTestId('conflicted-description');await expect(current).toBeVisible();result.conflictSource=await current.inputValue();result.conflictSourceExact=result.conflictSource===result.remoteSaved.description;result.conflictSourceReadonly=await current.getAttribute('readonly')!==null;await current.scrollIntoViewIfNeeded();}
   await shot(page,'conflict');await stage('resolve-'+input.resolution);
   const showDecision=async control=>{
    await control.scrollIntoViewIfNeeded();await expect(control).toBeVisible();
    result.decisionControl=await control.evaluate(node=>{const r=node.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);let visible=r.top>=-1&&r.bottom<=innerHeight+1&&r.left>=-1&&r.right<=innerWidth+1;for(let p=node.parentElement;p;p=p.parentElement){if(/auto|scroll|hidden|clip/u.test(getComputedStyle(p).overflowY)){const b=p.getBoundingClientRect();if(r.top<b.top-1||r.bottom>b.bottom+1)visible=false;}}return {label:node.textContent.trim(),fullyVisible:visible,unobstructed:node===hit||node.contains(hit),rect:{top:r.top,bottom:r.bottom,left:r.left,right:r.right}};});
    expect(result.decisionControl.fullyVisible).toBe(true);expect(result.decisionControl.unobstructed).toBe(true);await shot(page,'decision');
   };
   if(input.resolution==='overwrite'){
    const overwrite=wrapper(page).getByRole('button',{name:'Save and overwrite',exact:true});result.explicitOverwrite=await overwrite.isVisible();const action=result.explicitOverwrite?overwrite:wrapper(page).getByRole('button',{name:'Save changes',exact:true});await showDecision(action);await action.click();
    await expect(editor(page)).toBeHidden({timeout:30000});await expect.poll(async()=>{result.resolvedSaved=await request(api);return result.resolvedSaved.description;},{timeout:30000}).toBe(result.localSource);
   }else{
    const cancel=wrapper(page).getByRole('button',{name:result.conflictObserved?'Discard changes':'Cancel',exact:true});await showDecision(cancel);await cancel.click();const confirm=page.getByRole('dialog');await expect(confirm.getByRole('button',{name:'Discard changes',exact:true})).toBeVisible();await confirm.getByRole('button',{name:'Discard changes',exact:true}).click();await expect(editor(page)).toBeHidden({timeout:30000});result.resolvedSaved=await request(api);
   }
   result.resolutionSourceExact=result.resolvedSaved.description===(input.resolution==='overwrite'?result.localSource:result.remoteSaved.description);
   await page.reload();const reader=page.locator('.js-work-item-description');await expect(reader.getByText('Shared record.'+(input.resolution==='overwrite'?input.localSuffix:input.remoteSuffix),{exact:true})).toBeVisible({timeout:30000});result.graphs.resolved=await reader.evaluate(conflictGraph);await shot(page,'resolved');
   await stage('fresh-session');await open(page);result.freshWarningAbsent=await wrapper(page).getByTestId('conflicted-description').count()===0;result.freshSource=await source(page);result.freshSourceMatchesServer=result.freshSource===result.resolvedSaved.description;
   const baseline='Shared record.'+(input.resolution==='overwrite'?input.localSuffix:input.remoteSuffix);await append(page,baseline,input.resumeSuffix);result.resumedSource=await source(page);result.normalSaveReachable=await wrapper(page).getByRole('button',{name:'Save changes',exact:true}).isVisible();
   await wrapper(page).getByRole('button',{name:'Save changes',exact:true}).click();await expect(editor(page)).toBeHidden({timeout:30000});await expect.poll(async()=>{result.finalSaved=await request(api);return result.finalSaved.description;},{timeout:30000}).toBe(result.resumedSource);
   await page.reload();await open(page);await expect(editor(page).getByText(baseline+input.resumeSuffix,{exact:true})).toBeVisible();result.graphs.final=await editor(page).evaluate(conflictGraph);result.finalSource=await source(page);result.finalSourceMatchesServer=result.finalSource===result.finalSaved.description;await shot(page,'reopened');
   await wrapper(page).getByRole('button',{name:'Cancel',exact:true}).click();
   result.actions.push('Two independent authenticated browser contexts, same root actor; both open actual rich editor before typing. Local draft, remote UI Save, bounded observation, current-version disclosure, explicit discard/overwrite, fresh edit, normal Save/reload. API writes establish fixtures only.');
   result.status='observed';await stage('complete');
  }catch(error){result.error=String(error);await page.screenshot({path:join(output,input.id+'-failure.png'),animations:'disabled'}).catch(()=>{});onProgress({side,case:input.id,stage:'incomplete',error:result.error});await save();}
  finally{await remoteContext?.close();}
 }
 return observations;
}
