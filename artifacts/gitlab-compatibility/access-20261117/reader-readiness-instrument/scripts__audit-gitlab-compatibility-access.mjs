import {expect} from '@playwright/test';
import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {conflictGraph} from './audit-gitlab-compatibility-conflicts.mjs';

const origin='http://127.0.0.1:5080';
export async function runGitLabAccessCompatibility({side,runId,page,request,project,fixture,output,onProgress}){
 if(project.path_with_namespace!==fixture.projectPath||project.visibility!=='private'||fixture.username!=='fountain_compat_access'||fixture.email!=='fountain-compat-access@example.invalid')throw new Error('Unexpected task access fixture.');
 let password='Fj!'+randomBytes(24).toString('base64url')+'9aZ';
 const users=await request('/api/v4/users?username='+encodeURIComponent(fixture.username));
 let account=users.find(user=>user.username===fixture.username);
 if(account){
  const existing=await request('/api/v4/users/'+account.id);
  if(existing.email!==fixture.email||existing.name!==fixture.accountName||existing.is_admin||existing.state!=='active')throw new Error('Refusing to modify an unowned or inactive account.');
  account=await request('/api/v4/users/'+account.id,{password},'PUT');
 }else account=await request('/api/v4/users',{username:fixture.username,email:fixture.email,name:fixture.accountName,password,skip_confirmation:true,admin:false,can_create_group:false,projects_limit:0});
 const setRole=async level=>{
  const members=await request(`/api/v4/projects/${project.id}/members/all?query=${encodeURIComponent(fixture.username)}`);
  const present=members.find(member=>member.id===account.id);
  const member=present?await request(`/api/v4/projects/${project.id}/members/${account.id}`,{access_level:level},'PUT'):await request(`/api/v4/projects/${project.id}/members`,{user_id:account.id,access_level:level});
  expect(member.access_level).toBe(level);return {id:member.id,username:member.username,accessLevel:member.access_level};
 };
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
   try{
    const signIn=async()=>{await actor.getByLabel('Username or primary email').fill(fixture.username);await actor.getByLabel('Password',{exact:true}).fill(password);await actor.getByRole('button',{name:'Sign in',exact:true}).click();await actor.waitForURL(url=>!url.pathname.includes('sign_in'));};
    await actor.goto(origin+'/users/sign_in');await signIn();
    result.signInDestination=new URL(actor.url()).pathname;
    if(await actor.getByRole('button',{name:'Update password',exact:true}).isVisible()){
     const nextPassword='Fj!'+randomBytes(24).toString('base64url')+'9aZ';
     await actor.getByLabel('Current password',{exact:true}).fill(password);await actor.getByLabel('New password',{exact:true}).fill(nextPassword);await actor.getByLabel('Confirm password',{exact:true}).fill(nextPassword);await actor.getByRole('button',{name:'Update password',exact:true}).click();
     await expect(actor.getByRole('button',{name:'Update password',exact:true})).toBeHidden({timeout:30000});password=nextPassword;result.passwordUpdateCompleted=true;
     if(await actor.getByLabel('Username or primary email').isVisible())await signIn();
    }
    if(await actor.getByRole('button',{name:'Update password',exact:true}).isVisible()||await actor.getByLabel('Username or primary email').isVisible())throw new Error('Task sign-in did not complete.');
    result.authenticatedDestination=new URL(actor.url()).pathname;
    authenticated=true;
   }catch{throw new Error('Task-member sign-in or required password update failed; credentialed details omitted.');}
   actor.on('pageerror',error=>result.actorErrors.push(error.message));
   const token=await actor.locator('meta[name="csrf-token"]').getAttribute('content');
   const actorFetch=(path,data,method='POST')=>{const url=new URL(path,origin);if(url.origin!==origin)throw new Error('LOCAL_ONLY');return actor.request.fetch(url.href,{headers:{'X-CSRF-Token':token},...(data?{method,data}:{})});};
   const actorRead=async(path,data)=>{const response=await actorFetch(path,data);if(!response.ok())throw new Error('Task actor verification '+new URL(path,origin).pathname+' '+response.status());return response.json();};
   const me=await actorRead('/api/v4/user');const adminProof=await request('/api/v4/users/'+me.id);expect(adminProof.is_admin).toBe(false);expect(adminProof.username).toBe(fixture.username);result.actor={id:me.id,username:me.username,isAdmin:adminProof.is_admin};result.adminIdentityProof={id:adminProof.id,username:adminProof.username,isAdmin:adminProof.is_admin};expect(me.id).toBe(account.id);expect(me.username).toBe(fixture.username);expect(me.id).not.toBe(issue.author.id);
   const permission=async()=>{const reply=await actorRead('/api/graphql',{query:'query AccessAudit($path: ID!, $iid: String!) { namespace(fullPath: $path) { workItem(iid: $iid) { id userPermissions { updateWorkItem } } } }',variables:{path:fixture.projectPath,iid:String(issue.iid)}});if(reply.errors)throw new Error('Task actor permission query failed.');return reply.data?.namespace?.workItem?.userPermissions?.updateWorkItem;};
   await actor.goto(issue.web_url);const wrapper=actor.getByTestId('work-item-description-wrapper'),reader=actor.locator('.js-work-item-description');
   await expect(reader.getByRole('heading',{name:'Access review',exact:true})).toBeVisible({timeout:30000});await expect(reader.getByText('End marker.',{exact:true})).toBeVisible({timeout:30000});await pause();result.graphs.initial=await reader.evaluate(conflictGraph);result.permissionBefore=await permission();
   const editor=wrapper.locator(side==='original'?'.ProseMirror[contenteditable="true"]':'.fountain-editor[contenteditable="true"]');
   const shot=async name=>{await actor.evaluate(()=>document.fonts.ready);await actor.screenshot({path:join(output,input.id+'-'+name+'.png'),animations:'disabled',caret:'initial'});};
   const open=async()=>{await actor.getByTestId('work-item-edit-form-button').click();const toggle=wrapper.getByRole('button',{name:'Switch to rich text editing',exact:true});if(await toggle.isVisible())await toggle.click();await expect(editor.getByRole('heading',{name:'Access review',exact:true})).toBeVisible({timeout:30000});await expect(editor.getByText('End marker.',{exact:true})).toBeVisible();await pause();};
   const source=async()=>{if(!(await editor.isVisible()))return null;await wrapper.getByRole('button',{name:'Switch to plain text editing',exact:true}).click();const field=wrapper.getByTestId('markdown-editor-form-field');await expect(field).toBeVisible();const value=await field.inputValue();await wrapper.getByRole('button',{name:'Switch to rich text editing',exact:true}).click();await expect(editor).toBeVisible();await pause();return value;};
   const append=async(text,suffix)=>{await editor.getByText(text,{exact:true}).click();await actor.keyboard.press('End');await pause();await expect.poll(()=>actor.evaluate(()=>{const s=window.getSelection();return {collapsed:s?.isCollapsed,text:s?.anchorNode?.textContent,offset:s?.anchorOffset};})).toEqual({collapsed:true,text,offset:text.length});await actor.keyboard.insertText(suffix);await pause();await expect(editor.getByText(text+suffix,{exact:true})).toBeVisible();};
   if(input.kind==='guest'){
    await stage('guest-readonly');result.editControlAbsent=await actor.getByTestId('work-item-edit-form-button').count()===0;result.editableRootsAbsent=await wrapper.locator('[contenteditable="true"]').count()===0;await shot('reader');
    const denied=await actorFetch(api,{description:input.markdown+'\nUnauthorized write probe.'},'PUT');result.denialStatus=denied.status();result.writeDenied=[403,404].includes(denied.status());result.afterDenied=await request(api);result.serverUnchanged=result.afterDenied.description===input.markdown;
    await actor.reload();await expect(reader.getByText('End marker.',{exact:true})).toBeVisible({timeout:30000});result.graphs.reloaded=await reader.evaluate(conflictGraph);await shot('reloaded');
    await stage('anonymous-private-access');anonymousContext=await page.context().browser().newContext({viewport:{width:1280,height:900},locale:'en-US',timezoneId:'UTC'});const anonymous=await anonymousContext.newPage();const response=await anonymous.goto(issue.web_url);result.anonymousPage={status:response?.status(),path:new URL(anonymous.url()).pathname};result.anonymousContentAbsent=await anonymous.locator('.js-work-item-description').count()===0;result.anonymousEditAbsent=await anonymous.getByTestId('work-item-edit-form-button').count()===0;const apiResponse=await anonymous.request.get(origin+api);result.anonymousAPIStatus=apiResponse.status();result.anonymousAPIDenied=[401,403,404].includes(apiResponse.status());await anonymous.screenshot({path:join(output,input.id+'-anonymous.png'),animations:'disabled'});
    result.actions.push('Actual non-author Guest login and private issue reader; explicit denied REST write is an authorization probe, not a user edit. Anonymous UI/API access checked separately.');
   }else{
    await stage('developer-save');expect(result.permissionBefore).toBe(true);await open();result.editorProof={native:await wrapper.locator('[data-fountain-integration="native"]').count()>0,className:await editor.getAttribute('class')};
    await append('Shared record.',input.confirmedSuffix);result.confirmedSource=await source();await wrapper.getByRole('button',{name:'Save changes',exact:true}).click();await expect(editor).toBeHidden({timeout:30000});await expect.poll(async()=>{result.confirmedSaved=await request(api);return result.confirmedSaved.description;},{timeout:30000}).toBe(result.confirmedSource);await expect(reader.getByText('Shared record.'+input.confirmedSuffix,{exact:true})).toBeVisible();result.graphs.confirmed=await reader.evaluate(conflictGraph);result.initialWriteSucceeded=true;
    await open();await append('Shared record.'+input.confirmedSuffix,input.pendingSuffix);result.pendingSource=await source();result.beforeRevocation=await request(api);result.draftStayedLocal=result.beforeRevocation.description===result.confirmedSaved.description;await shot('draft-before-revocation');
    await stage('revoke-edit-access');result.downgradedMembership=await setRole(10);await expect.poll(async()=>{result.permissionRevoked=await permission();return result.permissionRevoked;},{timeout:30000}).toBe(false);
    actor.on('response',async response=>{if(new URL(response.url()).pathname!=='/api/graphql')return;let body;try{body=response.request().postDataJSON();}catch{return;}if(typeof body?.query!=='string'||!body.variables?.input?.descriptionWidget)return;try{const reply=await response.json();result.mutations.push({stage:result.stage,status:response.status(),operation:body.operationName??null,errors:reply.errors??[],updateErrors:reply.data?.workItemUpdate?.errors??null,updatedId:reply.data?.workItemUpdate?.workItem?.id??null});}catch{/* HTTP evidence remains in the saved backend receipt. */}});
    const submit=wrapper.getByRole('button',{name:'Save changes',exact:true});result.saveVisibleAfterRevocation=await submit.isVisible();if(result.saveVisibleAfterRevocation){await submit.click();await expect.poll(()=>result.mutations.length,{timeout:30000}).toBeGreaterThan(0);}await pause();
    result.afterRevokedSave=await request(api);result.revokedWriteBlocked=result.afterRevokedSave.description===result.confirmedSaved.description;
    result.errorAlerts=await actor.getByRole('alert').allTextContents();result.deniedSaveReported=result.errorAlerts.some(text=>/not authorized|permission|access|not allowed|could not|error/i.test(text));result.retainedSource=await source();result.draftRetainedAfterDenial=result.retainedSource===result.pendingSource;await shot('save-denied');
    await stage('restore-and-recover');result.restoredMembership=await setRole(30);await expect.poll(async()=>{result.permissionRestored=await permission();return result.permissionRestored;},{timeout:30000}).toBe(true);
    await actor.reload();await open();result.recoveredSource=await source();result.draftRecoveredAfterReload=result.recoveredSource===result.pendingSource;result.graphs.recovered=await editor.evaluate(conflictGraph);await shot('recovered-draft');
    await wrapper.getByRole('button',{name:'Save changes',exact:true}).click();await expect(editor).toBeHidden({timeout:30000});await expect.poll(async()=>{result.finalSaved=await request(api);return result.finalSaved.description;},{timeout:30000}).toBe(result.recoveredSource);result.finalSourceExact=result.finalSaved.description===result.pendingSource;
    await actor.reload();await open();result.graphs.final=await editor.evaluate(conflictGraph);result.finalReopenedSource=await source();result.finalReopenExact=result.finalReopenedSource===result.pendingSource;await shot('reopened');
    result.actions.push('Actual Developer rich edit and UI Save prove initial authority. A root API fixture transition downgrades only the task-owned member to Guest while its draft remains open. Attempted UI Save is observed; backend/source and actual errors verify refusal. Restore Developer access, reload the existing autosaved draft without reinjection, Save and reopen.');
   }
   result.status='observed';await stage('complete');
  }catch(error){result.error=String(error);if(authenticated)await actor.screenshot({path:join(output,input.id+'-failure.png'),animations:'disabled'}).catch(()=>{});onProgress({side,case:input.id,stage:'incomplete',error:result.error});await save();}
  finally{await anonymousContext?.close();await actorContext?.close();try{result.cleanupMembership=await setRole(10);}catch{result.cleanupError='Task-member role cleanup failed.';result.status='incomplete';}await save();}
 }
 return observations;
}
