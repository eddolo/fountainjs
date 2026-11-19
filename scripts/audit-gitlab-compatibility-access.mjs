import {expect} from '@playwright/test';
import {prepareGitLabAuditMember} from './gitlab-audit-member.mjs';
import {writeFile} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {exerciseOfflineConflict} from './audit-gitlab-offline-conflict.mjs';
import {conflictGraph} from './audit-gitlab-compatibility-conflicts.mjs';

const origin='http://127.0.0.1:5080';
export async function runGitLabAccessCompatibility({side,runId,page,request,project,fixture,output,onProgress}){
 const {account,setRole,signInMember}=await prepareGitLabAuditMember({request,project,fixture});
 if(fixture.workflow==='non-author-full-membership-removal'&&fixture.cases.some(input=>input.kind!=='revocation'||input.revocationMode!=='remove-membership'))throw new Error('Invalid membership removal fixture.');
 const observations=[],pause=()=>new Promise(resolve=>setTimeout(resolve,fixture.settlingMs));
 for(const input of fixture.cases){
  const result={id:input.id,input,status:'incomplete',stage:'setup',graphs:{},actions:[],actorErrors:[],mutations:[]};observations.push(result);
  const save=()=>writeFile(join(output,'observations.json'),JSON.stringify(observations,null,2)+'\n');
  const stage=async name=>{result.stage=name;onProgress({side,case:input.id,stage:name});await save();};
  let actorContext,anonymousContext,actor,authenticated=false;
  try{
   result.membership=await setRole(input.initialAccessLevel);
   const issue=await request(`/api/v4/projects/${project.id}/issues`,{title:input.title+' '+runId,description:input.markdown});expect(issue.description).toBe(input.markdown);
   const api=`/api/v4/projects/${project.id}/issues/${issue.iid}`;result.setup={iid:issue.iid,url:issue.web_url,description:issue.description,authorId:issue.author.id};
   actorContext=await page.context().browser().newContext({viewport:{width:1280,height:900},deviceScaleFactor:1,locale:'en-US',timezoneId:'UTC'});actor=await actorContext.newPage();
   await signInMember(actor,result);authenticated=true;
   if(input.revocationMode==='remove-membership'||['offline-conflict','simultaneous-issue'].includes(input.kind)){
    // Authentication is completed without recording. Reuse its live session in
    // memory, then record only the task document workflow.
    const storageState=await actorContext.storageState();await actorContext.close();
    actorContext=await page.context().browser().newContext({storageState,viewport:{width:1280,height:900},deviceScaleFactor:1,locale:'en-US',timezoneId:'UTC',recordVideo:{dir:join(output,'videos'),size:{width:1280,height:900}}});
    actor=await actorContext.newPage();result.recording={authenticationExcluded:true};await actor.goto(issue.web_url);
   }
   actor.on('pageerror',error=>result.actorErrors.push(error.message));
   const token=await actor.locator('meta[name="csrf-token"]').getAttribute('content');
   const actorFetch=(path,data,method='POST')=>{const url=new URL(path,origin);if(url.origin!==origin)throw new Error('LOCAL_ONLY');return actor.request.fetch(url.href,{headers:{'X-CSRF-Token':token},...(data?{method,data}:{})});};
   const actorRead=async(path,data)=>{const response=await actorFetch(path,data);if(!response.ok())throw new Error('Task actor verification '+new URL(path,origin).pathname+' '+response.status());return response.json();};
   const me=await actorRead('/api/v4/user');const adminProof=await request('/api/v4/users/'+me.id);expect(adminProof.is_admin).toBe(false);expect(adminProof.username).toBe(fixture.username);result.actor={id:me.id,username:me.username,isAdmin:adminProof.is_admin};result.adminIdentityProof={id:adminProof.id,username:adminProof.username,isAdmin:adminProof.is_admin};expect(me.id).toBe(account.id);expect(me.username).toBe(fixture.username);expect(me.id).not.toBe(issue.author.id);
   const permission=async()=>{const reply=await actorRead('/api/graphql',{query:'query AccessAudit($path: ID!, $iid: String!) { namespace(fullPath: $path) { workItem(iid: $iid) { id userPermissions { updateWorkItem } } } }',variables:{path:fixture.projectPath,iid:String(issue.iid)}});if(reply.errors)throw new Error('Task actor permission query failed.');return reply.data?.namespace?.workItem?.userPermissions?.updateWorkItem;};
   await actor.goto(issue.web_url);const wrapper=actor.getByTestId('work-item-description-wrapper'),reader=actor.locator('.js-work-item-description');
   await expect(reader.locator('h2')).toHaveText('Access review',{timeout:30000});await expect(reader.getByText('End marker.',{exact:true})).toBeVisible({timeout:30000});await pause();result.initialReaderHTML=await reader.innerHTML();result.graphs.initial=await reader.evaluate(conflictGraph);result.permissionBefore=await permission();
   const editor=wrapper.locator(side==='original'?'.ProseMirror[contenteditable="true"]':'.fountain-editor[contenteditable="true"]');
   const shot=async name=>{await actor.evaluate(()=>document.fonts.ready);await actor.screenshot({path:join(output,input.id+'-'+name+'.png'),animations:'disabled',caret:'initial'});};
   const loading=()=>wrapper.getByTestId('content-editor-container').getByRole('status',{name:'Loading',exact:true});
   const open=async(expectSeed=true)=>{await actor.getByTestId('work-item-edit-form-button').click();const toggle=wrapper.getByRole('button',{name:'Switch to rich text editing',exact:true});if(await toggle.isVisible())await toggle.click();await expect(editor).toBeVisible({timeout:30000});if(input.revocationMode==='remove-membership')await expect(loading()).toHaveCount(0,{timeout:30000});if(expectSeed){await expect(editor.getByRole('heading',{name:'Access review',exact:true})).toBeVisible();await expect(editor.getByText('End marker.',{exact:true})).toBeVisible();}await pause();};
   const source=async()=>{
    if(!(await editor.isVisible()))return null;
    await wrapper.getByRole('button',{name:'Switch to plain text editing',exact:true}).click();const field=wrapper.getByTestId('markdown-editor-form-field');await expect(field).toBeVisible();const value=await field.inputValue();await wrapper.getByRole('button',{name:'Switch to rich text editing',exact:true}).click();
    if(input.revocationMode==='remove-membership'){
     // A terminal conversion error is an observed failure, not a missing receipt.
     await expect.poll(async()=>await editor.isVisible()||await wrapper.getByTestId('content-editor-error').isVisible()||await actor.getByRole('alert').filter({hasText:/An error occurred while trying to render the rich text editor/}).isVisible(),{timeout:30000}).toBe(true);
     await expect(loading()).toHaveCount(0,{timeout:30000});await pause();const retained=wrapper.getByRole('textbox',{name:'Retained document Markdown',exact:true});
     const native=wrapper.locator('[data-fountain-integration="native"]');
     const inspection={loadingCount:await loading().count(),richVisible:await editor.isVisible(),errorCode:await native.count()?await native.getAttribute('data-fountain-error'):null,alerts:await actor.getByRole('alert').allTextContents(),recoverySource:await retained.count()?await retained.inputValue():null};
     (result.sourceInspections??=[]).push(inspection);
    }else{await expect(editor).toBeVisible();await pause();}
    return value;
   };
   const append=async(text,suffix)=>{await editor.getByText(text,{exact:true}).click();await actor.keyboard.press('End');await pause();await expect.poll(()=>actor.evaluate(()=>{const s=window.getSelection();return {collapsed:s?.isCollapsed,text:s?.anchorNode?.textContent,offset:s?.anchorOffset};})).toEqual({collapsed:true,text,offset:text.length});await actor.keyboard.insertText(suffix);await pause();await expect(editor.getByText(text+suffix,{exact:true})).toBeVisible();};
   if(['offline-conflict','simultaneous-issue'].includes(input.kind)){
    await exerciseOfflineConflict({actor,author:page,side,input,result,issue,readSaved:async()=>(await request(api)).description,open,append,editor,wrapper,stage,shot,output});
   }else if(input.kind==='guest'){
    await stage('guest-readonly');result.editControlAbsent=await actor.getByTestId('work-item-edit-form-button').count()===0;result.editableRootsAbsent=await wrapper.locator('[contenteditable="true"]').count()===0;await shot('reader');
    const denied=await actorFetch(api,{description:input.markdown+'\nUnauthorized write probe.'},'PUT');result.denialStatus=denied.status();result.writeDenied=[403,404].includes(denied.status());result.afterDenied=await request(api);result.serverUnchanged=result.afterDenied.description===input.markdown;
    await actor.reload();await expect(reader.getByText('End marker.',{exact:true})).toBeVisible({timeout:30000});result.graphs.reloaded=await reader.evaluate(conflictGraph);await shot('reloaded');
    await stage('anonymous-private-access');anonymousContext=await page.context().browser().newContext({viewport:{width:1280,height:900},locale:'en-US',timezoneId:'UTC'});const anonymous=await anonymousContext.newPage();const response=await anonymous.goto(issue.web_url);result.anonymousPage={status:response?.status(),path:new URL(anonymous.url()).pathname};result.anonymousContentAbsent=await anonymous.locator('.js-work-item-description').count()===0;result.anonymousEditAbsent=await anonymous.getByTestId('work-item-edit-form-button').count()===0;const apiResponse=await anonymous.request.get(origin+api);result.anonymousAPIStatus=apiResponse.status();result.anonymousAPIDenied=[401,403,404].includes(apiResponse.status());await anonymous.screenshot({path:join(output,input.id+'-anonymous.png'),animations:'disabled'});
    result.actions.push('Actual non-author Guest login and private issue reader; explicit denied REST write is an authorization probe, not a user edit. Anonymous UI/API access checked separately.');
   }else{
    await stage('developer-save');expect(result.permissionBefore).toBe(true);await open();result.editorProof={native:await wrapper.locator('[data-fountain-integration="native"]').count()>0,className:await editor.getAttribute('class')};
    await append('Shared record.',input.confirmedSuffix);result.confirmedSource=await source();await wrapper.getByRole('button',{name:'Save changes',exact:true}).click();await expect(editor).toBeHidden({timeout:30000});await expect.poll(async()=>{result.confirmedSaved=await request(api);return result.confirmedSaved.description;},{timeout:30000}).toBe(result.confirmedSource);await expect(reader.getByText('Shared record.'+input.confirmedSuffix,{exact:true})).toBeVisible();result.graphs.confirmed=await reader.evaluate(conflictGraph);result.initialWriteSucceeded=true;
    await open();if(input.pendingMode==='empty'){await stage('clear-pending-draft');await editor.getByRole('heading',{name:'Access review',exact:true}).click();await actor.keyboard.press('Control+a');result.clearSelection=await editor.evaluate(root=>{const selection=document.getSelection();return {text:selection?.toString(),anchorInside:root.contains(selection?.anchorNode??null),focusInside:root.contains(selection?.focusNode??null)};});expect(result.clearSelection.anchorInside).toBe(true);expect(result.clearSelection.focusInside).toBe(true);expect(result.clearSelection.text).toContain('End marker.');await actor.keyboard.press('Backspace');await expect(editor).toHaveText('');await pause();await shot('empty-draft-cleared');}else await append('Shared record.'+input.confirmedSuffix,input.pendingSuffix);result.pendingSource=await source();result.beforeRevocation=await request(api);result.draftStayedLocal=result.beforeRevocation.description===result.confirmedSaved.description;await shot('draft-before-revocation');
    await stage('revoke-edit-access');
    if(input.revocationMode==='remove-membership'){
     const access=async()=>{
      const rest=await actorFetch(api),graph=await actorFetch('/api/graphql',{query:'query RemovalAccess($path: ID!, $iid: String!) { namespace(fullPath: $path) { workItem(iid: $iid) { id widgets { ... on WorkItemWidgetDescription { description } } } } }',variables:{path:fixture.projectPath,iid:String(issue.iid)}});
      let restBody,graphBody;try{restBody=await rest.json();}catch{}try{graphBody=await graph.json();}catch{}
      const item=graphBody?.data?.namespace?.workItem;
      return {restJSON:!!restBody&&typeof restBody==='object'&&!Array.isArray(restBody),graphqlEnvelope:!!graphBody&&(Object.hasOwn(graphBody,'data')||Array.isArray(graphBody.errors)&&graphBody.errors.length>0),restStatus:rest.status(),restDescription:restBody?.description??null,graphqlStatus:graph.status(),graphqlErrors:graphBody?.errors??[],itemPresent:!!item,graphqlDescription:item?.widgets?.find(widget=>Object.hasOwn(widget,'description'))?.description??null};
     };
     result.accessBeforeRemoval=await access();expect(result.accessBeforeRemoval.restStatus).toBe(200);expect(result.accessBeforeRemoval.restDescription).toBe(result.confirmedSource);expect(result.accessBeforeRemoval.graphqlStatus).toBe(200);expect(result.accessBeforeRemoval.graphqlErrors).toEqual([]);expect(result.accessBeforeRemoval.graphqlDescription).toBe(result.confirmedSource);
     await request(`/api/v4/projects/${project.id}/members/${account.id}`,{},'DELETE');
     result.membersAfterRemoval=(await request(`/api/v4/projects/${project.id}/members/all?query=${encodeURIComponent(fixture.username)}`)).map(member=>({id:member.id,username:member.username,accessLevel:member.access_level}));expect(result.membersAfterRemoval.some(member=>member.id===account.id)).toBe(false);
     await expect.poll(async()=>{result.accessAfterRemoval=await access();return [403,404].includes(result.accessAfterRemoval.restStatus)&&result.accessAfterRemoval.graphqlStatus===200&&!result.accessAfterRemoval.itemPresent;},{timeout:30000}).toBe(true);
     const session=await actorRead('/api/v4/user');result.sessionAfterRemoval={id:session.id,username:session.username};expect(session.id).toBe(account.id);
    }else{result.downgradedMembership=await setRole(10);await expect.poll(async()=>{result.permissionRevoked=await permission();return result.permissionRevoked;},{timeout:30000}).toBe(false);}
    actor.on('response',async response=>{if(new URL(response.url()).pathname!=='/api/graphql')return;let body;try{body=response.request().postDataJSON();}catch{return;}if(typeof body?.query!=='string'||!body.variables?.input?.descriptionWidget)return;try{const reply=await response.json();result.mutations.push({stage:result.stage,status:response.status(),operation:body.operationName??null,errors:reply.errors??[],updateErrors:reply.data?.workItemUpdate?.errors??null,updatedId:reply.data?.workItemUpdate?.workItem?.id??null,canUpdate:reply.data?.workItemUpdate?.workItem?.userPermissions?.updateWorkItem??null});}catch{/* HTTP evidence remains in the saved backend receipt. */}});
    const submit=wrapper.getByRole('button',{name:'Save changes',exact:true});result.saveVisibleAfterRevocation=await submit.isVisible();if(result.saveVisibleAfterRevocation){await submit.click();await expect.poll(()=>result.mutations.length,{timeout:30000}).toBeGreaterThan(0);}await pause();
    result.afterRevokedSave=await request(api);result.revokedWriteBlocked=result.afterRevokedSave.description===result.confirmedSaved.description;
    if(input.revocationMode==='remove-membership'){result.graphs.deniedBeforeInspection=await editor.isVisible()?await editor.evaluate(conflictGraph):null;await shot('save-denied-before-source');}
    result.errorAlerts=await actor.getByRole('alert').allTextContents();result.deniedSaveReported=result.errorAlerts.some(text=>/not authorized|permission|access|not allowed|could not|error/i.test(text));result.retainedSource=await source();result.draftRetainedAfterDenial=result.retainedSource===result.pendingSource;if(input.revocationMode==='remove-membership'){result.deniedInspection=result.sourceInspections.at(-1);result.graphs.deniedAfterInspection=await editor.isVisible()?await editor.evaluate(conflictGraph):null;result.errorAlertsAfterInspection=await actor.getByRole('alert').allTextContents();}await shot('save-denied');
    if(input.revocationMode==='remove-membership'){const probe=await actorFetch(api,{description:result.confirmedSource+'\nUnauthorized membership write probe.'},'PUT');result.removedRESTWriteStatus=probe.status();result.afterRESTProbe=await request(api);result.noFalseConflict=!result.errorAlerts.some(text=>text.includes('Someone edited the description at the same time you did.'));}
    await stage('restore-and-recover');result.restoredMembership=await setRole(30);await expect.poll(async()=>{result.permissionRestored=await permission();return result.permissionRestored;},{timeout:30000}).toBe(true);
    await actor.reload();await open(input.pendingMode!=='empty');result.recoveredSource=await source();result.draftRecoveredAfterReload=result.recoveredSource===result.pendingSource;result.graphs.recovered=await editor.evaluate(conflictGraph);await shot('recovered-draft');
    await wrapper.getByRole('button',{name:'Save changes',exact:true}).click();await expect(editor).toBeHidden({timeout:30000});await expect.poll(async()=>{result.finalSaved=await request(api);return input.pendingMode==='empty'&&result.recoveredSource===''?input.allowedEmptyStoredValues.includes(result.finalSaved.description):result.finalSaved.description===result.recoveredSource;},{timeout:30000}).toBe(true);result.finalSourceExact=result.finalSaved.description===result.pendingSource;if(input.pendingMode==='empty')result.finalEmptyStored=input.allowedEmptyStoredValues.includes(result.finalSaved.description);
    await actor.reload();await open(input.pendingMode!=='empty');result.graphs.final=await editor.evaluate(conflictGraph);result.finalReopenedSource=await source();result.finalReopenExact=result.finalReopenedSource===result.pendingSource;await shot('reopened');
    if(input.revocationMode==='remove-membership')result.actions.push('The root fixture operator removes only the task-owned non-author member. Actual REST/GraphQL positive controls precede removal; denied reads and a live session follow it. UI Save and a separate denied REST write are observed. Developer access is restored before reload, draft recovery, Save and reopen; no draft is reinjected.');
    else result.actions.push('Actual Developer rich edit and UI Save prove initial authority. A root API fixture transition downgrades only the task-owned member to Guest while its draft remains open. Attempted UI Save is observed; backend/source and actual errors verify refusal. Restore Developer access, reload the existing autosaved draft without reinjection, Save and reopen.');
   }
   result.status='observed';await stage('complete');
  }catch(error){result.error=String(error);if(authenticated)await actor.screenshot({path:join(output,input.id+'-failure.png'),animations:'disabled'}).catch(()=>{});onProgress({side,case:input.id,stage:'incomplete',error:result.error});await save();}
  finally{const video=actor?.video();await anonymousContext?.close();await actorContext?.close();if(video)result.recording.path=relative(output,await video.path()).replaceAll('\\','/');try{result.cleanupMembership=await setRole(10);}catch{result.cleanupError='Task-member role cleanup failed.';result.status='incomplete';}await save();}
 }
 return observations;
}
