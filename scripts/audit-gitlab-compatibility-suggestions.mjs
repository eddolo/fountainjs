import {expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';

/** Both drivers operate real UI; neither receives an editor model/command API. */
function driver(side, page) {
  const original = side === 'original';
  return {
    async rich(form) {
      const switcher=form.getByRole('button',{name:'Switch to rich text editing',exact:true});
      if(await switcher.isVisible()) await switcher.click();
      const editor=form.locator(original?'.ProseMirror[contenteditable="true"]':'.fountain-editor[contenteditable="true"]');
      await expect(editor).toBeVisible({timeout:30000});
      await expect(form.locator(original?'.fountain-editor[contenteditable="true"]':'.ProseMirror[contenteditable="true"]')).toHaveCount(0);
      return {editor,code:editor.locator(original?'pre.content-editor-code-block [data-testid="suggestion-field"]':'pre[data-fountain-gitlab-suggestion] > code')};
    },
    async insert(form) {await form.getByRole('button',{name:'Insert suggestion',exact:true}).click();},
    async source(form) {
      await form.getByRole('button',{name:'Switch to plain text editing',exact:true}).click();
      const source=form.locator('textarea.markdown-area:visible'); await expect(source).toBeVisible(); return source;
    },
  };
}
async function editDeletion({side,page,form,surface,input,output}) {
  const result={replacement:input.replacement,confirmationPresent:false,blockedBeforeConsent:false};
  if(side==='original') {
    // Browser fill selects the enclosing contenteditable, including NodeView
    // decorations. Select the actual source line with real keys instead.
    await surface.code.click();await page.keyboard.press('Home');await page.keyboard.press('Shift+End');
    result.selectedSource=await page.evaluate(()=>window.getSelection()?.toString());
    expect(result.selectedSource).toBe(input.source.split('\n')[input.range.start-1]);
    await page.keyboard.press('Backspace');
    for(const character of input.replacement){
      if(character==='\n')await page.keyboard.press('Enter');else await page.keyboard.insertText(character);
    }
    await new Promise(resolve=>setTimeout(resolve,input.handoffDelayMs));
    const block=surface.editor.locator('pre.content-editor-code-block');
    result.confirmationPresent=await block.getByRole('checkbox').count()>0;
    result.blockedBeforeConsent=await form.getByRole('button',{name:/^(Add comment now|Comment)$/u}).isDisabled();
    result.confirmed=false;
    result.visibleExplanation=await block.innerText();
    result.explicitDeletionExplanation=/\bdelet(?:e|es|ion|ing)\b/iu.test(result.visibleExplanation);
    result.richSource=await surface.code.textContent();
    await form.screenshot({path:join(output,input.id+'-deletion-draft.png'),animations:'disabled',caret:'initial'});
  } else {
    await surface.code.click();await page.getByRole('button',{name:'Edit suggestion',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Suggested replacement',exact:true});await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox',{name:'Replacement source',exact:true}).fill(input.replacement);
    const action=dialog.getByRole('button',{name:/^Apply (suggestion|deletion)$/u});
    const consent=dialog.getByRole('checkbox',{name:'I intend to delete these file lines',exact:true});
    result.visibleExplanation=await dialog.getByRole('alert').innerText();
    result.explicitDeletionExplanation=/\bdelet(?:e|es|ion|ing)\b/iu.test(result.visibleExplanation);
    result.actionLabel=await action.innerText();
    result.confirmationPresent=await consent.count()===1;result.blockedBeforeConsent=await action.isDisabled();
    await dialog.screenshot({path:join(output,input.id+'-deletion-warning.png'),animations:'disabled',caret:'initial'});
    if(result.confirmationPresent){
      await dialog.getByText('I intend to delete these file lines',{exact:true}).click();
      await expect(consent).toBeChecked();result.confirmed=await consent.isChecked();
      await expect(action).toBeEnabled();
    }
    await action.click();await expect(dialog).toBeHidden();
    result.richSource=await surface.code.textContent();
    result.effect=await surface.editor.locator('pre[data-fountain-gitlab-suggestion]').getAttribute('data-fountain-suggestion-effect');
    await form.screenshot({path:join(output,input.id+'-deletion-draft.png'),animations:'disabled',caret:'initial'});
  }
  return result;
}
async function editPostedReview({side,page,form,surface,input,fixture,output}) {
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const snapshot=async()=>{
    const raw=await surface.code.textContent();let range;
    if(side==='original'){
      const values=await surface.editor.locator('[data-testid="code-suggestion-box"] strong').allTextContents();
      if(values.length===2)range={start:Number(values[0]),end:Number(values[1])};
    }else{
      const params=await surface.editor.locator('pre[data-fountain-gitlab-suggestion]').getAttribute('data-fountain-gitlab-suggestion');
      const match=params?.match(/^-(\d+)\+(\d+)$/u);
      if(match)range={start:input.range.end-Number(match[1]),end:input.range.end+Number(match[2])};
    }
    return {source:side==='original'?raw+'\n':raw,range};
  };
  const open=async()=>{
    await surface.code.click();await page.getByRole('button',{name:'Edit suggestion',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Suggested replacement',exact:true});await expect(dialog).toBeVisible();return dialog;
  };
  await pause(input.handoffDelayMs);const result={initial:await snapshot(),undoSteps:[],redoSteps:[]};
  if(side==='original'){
    await surface.code.scrollIntoViewIfNeeded();
    const first = await surface.code.evaluate(code => {
      const text = document.createTreeWalker(code, NodeFilter.SHOW_TEXT).nextNode();
      if (!text?.length) throw new Error('Missing source text in the posted suggestion.');
      const range = document.createRange();
      range.setStart(text,0);
      range.setEnd(text,1);
      const box = range.getBoundingClientRect();
      return {x:box.left + box.width / 2,y:box.top + box.height / 2};
    });
    await page.mouse.click(first.x,first.y);
    await page.keyboard.press('Home');
    for (let line = input.range.start; line < input.range.end; line++) await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+End');
    result.selectedSource=await page.evaluate(()=>window.getSelection()?.toString());
    expect(result.selectedSource).toBe(input.source.split('\n').slice(input.range.start-1,input.range.end).join('\n'));
    await page.keyboard.press('Backspace');
    const lines=input.replacement.slice(0,-1).split('\n');
    for(let index=0;index<lines.length;index++){if(index)await page.keyboard.press('Enter');await page.keyboard.insertText(lines[index]);}
  }else{
    const dialog=await open();await dialog.getByRole('textbox',{name:'Replacement source',exact:true}).fill(input.replacement);
    await dialog.getByRole('button',{name:'Apply suggestion',exact:true}).click();await expect(dialog).toBeHidden();
  }
  await pause(fixture.historyBoundaryDelayMs);result.beforeRange=await snapshot();
  if(side==='original'){
    for (const edge of ['start','end']) {
      const delta = input.editedRange[edge] - input.range[edge];
      const verb = delta > 0 ? 'Increment' : 'Decrement';
      const button = surface.editor.getByRole('button',{name:verb + ' suggestion line ' + edge,exact:true});
      for (let step = 0; step < Math.abs(delta); step++) {
        await button.click();
        await pause(fixture.historyBoundaryDelayMs);
      }
    }
  }else{
    const dialog=await open();await dialog.getByRole('button',{name:'Load original file',exact:true}).click();
    await expect(dialog.getByRole('region',{name:'Original file lines',exact:true})).toContainText('keep();');
    await dialog.getByRole('spinbutton',{name:'First file line',exact:true}).fill(String(input.editedRange.start));
    await dialog.getByRole('spinbutton',{name:'Last file line',exact:true}).fill(String(input.editedRange.end));
    await dialog.screenshot({path:join(output,input.id+'-range-dialog.png'),animations:'disabled',caret:'initial'});
    await dialog.getByRole('button',{name:'Apply suggestion',exact:true}).click();await expect(dialog).toBeHidden();
  }
  await pause(fixture.historyBoundaryDelayMs);result.afterRange=await snapshot();
  await form.screenshot({path:join(output,input.id+'-changed-rich.png'),animations:'disabled',caret:'initial'});
  await surface.code.click();
  for(let count=0;count<4;count++){
    await page.keyboard.press('Control+z');await pause(100);const value=await snapshot();result.undoSteps.push(value);
    if(JSON.stringify(value)===JSON.stringify(result.beforeRange))break;
  }
  result.afterUndo=await snapshot();
  for(let count=0;count<result.undoSteps.length;count++){
    await page.keyboard.press('Control+Shift+z');await pause(100);result.redoSteps.push(await snapshot());
  }
  result.afterRedo=await snapshot();
  await form.screenshot({path:join(output,input.id+'-after-redo.png'),animations:'disabled',caret:'initial'});
  return result;
}
// A separate real GitLab commit changes the line the open suggestion targets.
async function staleReview({page,request,input,fixture,result,project,branch,seed,note,savedNote,mr,base,fileURL,output,stage}) {
  const apply = savedNote.getByTestId('apply-suggestion-dropdown').getByRole('button',{name:'Apply suggestion',exact:true});
  await expect(apply).toBeEnabled();
  await apply.click();
  const message = page.getByTestId('commit-message-field');
  const confirm = page.getByTestId('commit-with-custom-message-button');
  await message.fill('Apply the posted review');
  await expect(confirm).toBeEnabled();
  result.readyToApply = true;
  await stage('commit-newer-target');
  const other = await request('/api/v4/projects/'+project.id+'/repository/commits',{branch,
    commit_message:'Revise the target while the review is open',
    actions:[{action:'update',file_path:input.filePath,content:input.remoteSource,last_commit_id:seed.id}]});
  const file = await request(fileURL);
  expect(other.parent_ids).toEqual([seed.id]);
  expect(file.last_commit_id).toBe(other.id);
  expect(Buffer.from(file.content,'base64').toString('utf8')).toBe(input.remoteSource);
  result.competingCommit = other.id;
  result.verifiedCompetingSource = input.remoteSource;
  const id = result.saved.suggestions[0].id;
  const eligibility = async () => (await request(base+'/notes/'+note.id)).suggestions.find(suggestion => suggestion.id === id);
  if (input.waitForOutdated) await expect.poll(async () => (await eligibility())?.appliable,{timeout:60000}).toBe(false);
  if (input.refresh) {
    await page.goto(mr.web_url+'#note_'+note.id);
    await expect(savedNote.getByText(fixture.marker,{exact:true})).toBeVisible({timeout:30000});
  }
  await stage('review-stale-target');
  // GitLab can rerender the live discussion and close an already-open dropdown.
  // A closed menu alone does not prove that a stale submission was rejected.
  await expect(apply).toBeVisible();
  if (!await confirm.isVisible() && await apply.isDisabled()) {
    const suggestion = await eligibility();
    expect(suggestion?.appliable).toBe(false);
    await expect(apply).toBeDisabled();
    await expect(confirm).toBeHidden();
    result.confirmationOffered = false;
    result.blockedAtControl = {id:suggestion.id,appliable:suggestion.appliable,buttonDisabled:true,confirmationHidden:true};
    await savedNote.getByTestId('apply-suggestion-dropdown').hover();
    const tooltip = page.getByRole('tooltip').filter({hasText:/suggestion|line|changed/i}).first();
    try { await tooltip.waitFor({timeout:2000}); } catch (error) { if (error.name !== 'TimeoutError') throw error; }
    result.tooltip = await tooltip.isVisible() ? await tooltip.innerText() : '';
  } else {
    result.reopenedMenu = !await confirm.isVisible();
    if (result.reopenedMenu) await apply.click();
    await expect(confirm).toBeEnabled();
    result.confirmationOffered = true;
    const [reply] = await Promise.all([
      page.waitForResponse(res => res.request().method()!=='GET' && new URL(res.url()).pathname === '/api/v4/suggestions/'+id+'/apply',{timeout:15000}),
      confirm.click(),
    ]);
    result.applyResponse = {status:reply.status(),path:new URL(reply.url()).pathname};
    await expect.poll(async()=>await savedNote.getByRole('alert').first().isVisible() ||
      await savedNote.getByTestId('applied-badge').isVisible() || !await confirm.isVisible(),{timeout:15000}).toBe(true);
  }
  result.alertText = await savedNote.getByRole('alert').allTextContents();
  result.visibleReview = await savedNote.innerText();
  await savedNote.screenshot({path:join(output,input.id+'-decision.png'),animations:'disabled'});
  const read = async()=>({
    file:await request(fileURL),
    head:(await request('/api/v4/projects/'+project.id+'/repository/branches/'+encodeURIComponent(branch))).commit.id,
    note:await request(base+'/notes/'+note.id),
  });
  const snapshot = item => ({source:Buffer.from(item.file.content,'base64').toString('utf8'),
    sameHead:item.head===other.id && item.file.last_commit_id===other.id, sameNote:item.note.body===note.body,
    applied:item.note.suggestions[0]?.applied, sameSuggestion:item.note.suggestions[0]?.id===result.saved.suggestions[0].id});
  result.afterDecision=snapshot(await read());
  await page.goto(mr.web_url+'#note_'+note.id);
  await expect(savedNote.getByText(fixture.marker,{exact:true})).toBeVisible({timeout:30000});
  result.afterReload=snapshot(await read());
  await savedNote.screenshot({path:join(output,input.id+'-reload.png'),animations:'disabled'});
}

async function openLineForm(page, mr, range) {
  await page.goto(mr.web_url+'/diffs');
  const rowAt=line=>page.locator('tr[data-hunk-lines]').filter({has:page.locator(`[data-position="new"] [data-line-number="${line}"]`)}).first();
  const row=rowAt(range.start),toggle=page.locator('[data-new-discussion-toggle]');
  await expect(row).toBeVisible({timeout:60000});
  await expect(async()=>{await page.mouse.move(10,10);await row.locator(`[data-line-number="${range.start}"]`).first().hover();await expect(toggle).toBeVisible({timeout:1000});})
    .toPass({timeout:30000,intervals:[500,1000,2000]});
  if(range.end===range.start) await toggle.click();
  else {
    await expect(toggle).toHaveAttribute('draggable','true');
    const from=await toggle.boundingBox(),to=await rowAt(range.end).locator('pre').first().boundingBox();
    if(!from||!to)throw new Error('Missing visible line selection endpoints');
    await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();
    await page.mouse.move(from.x+from.width/2+8,from.y+from.height/2,{steps:4});
    await page.mouse.move(to.x+Math.min(40,to.width/2),to.y+to.height/2,{steps:12});
    await page.mouse.move(to.x+Math.min(40,to.width/2)+1,to.y+to.height/2);await page.mouse.up();
  }
  const form=page.locator('form.common-note-form').first();await expect(form).toBeVisible();return form;
}
export async function runGitLabSuggestionCompatibility({side,runId,page,request,project,fixture,output,onProgress}) {
  const ui=driver(side,page),observations=[];
  for(const input of fixture.cases) {
    const result={id:input.id,status:'incomplete',stage:'setup',input,actions:[]};observations.push(result);
    const save=()=>writeFile(join(output,'observations.json'),JSON.stringify(observations,null,2)+'\n');
    const stage=async name=>{result.stage=name;onProgress({side,case:input.id,stage:name});await save();};
    try {
      await stage('setup');
      const branch=`fountain-compat-${runId}-${side}-${input.id}`;
      const seed=await request(`/api/v4/projects/${project.id}/repository/commits`,{branch,start_branch:project.default_branch,
        commit_message:'Seed paired editor compatibility fixture',actions:[{action:'create',file_path:input.filePath,content:input.source}]});
      const mr=await request(`/api/v4/projects/${project.id}/merge_requests`,{source_branch:branch,target_branch:project.default_branch,
        title:fixture.title+' '+input.id,description:'Matched editor compatibility workflow; isolated fixture.'});
      const base=`/api/v4/projects/${project.id}/merge_requests/${mr.iid}`;
      const fileURL=`/api/v4/projects/${project.id}/repository/files/${encodeURIComponent(input.filePath)}?ref=${encodeURIComponent(branch)}`;
      const file=await request(fileURL);expect(Buffer.from(file.content,'base64').toString('utf8')).toBe(input.source);
      result.setup={branch,seedCommit:seed.id,source:file.content,mergeRequest:{iid:mr.iid,url:mr.web_url}};
      const form=await openLineForm(page,mr,input.range);let surface=await ui.rich(form);
      result.editorProof={className:await surface.editor.getAttribute('class'),native:(await form.locator('[data-fountain-integration="native"]').count())>0};
      await stage('insert');await ui.insert(form);await expect(surface.code).toHaveCount(1);
      await expect(surface.code).toBeVisible();result.prefillDOM=await surface.code.textContent();
      result.actions.push('Rich editor: Insert suggestion from actual selected diff lines.');
      if(input.scope==='deletion'){
        await stage('edit-deletion');await new Promise(resolve=>setTimeout(resolve,fixture.editingDelayMs));
        result.deletion=await editDeletion({side,page,form,surface,input,output});
        result.actions.push('Edit the replacement through the actual rich editor controls; observe deletion explanation and confirmation before accepting.');
      }
      const visibleAt=performance.now();
      if(input.handoffDelayMs)await new Promise(resolve=>setTimeout(resolve,input.handoffDelayMs));
      result.stage='inspect-source';onProgress({side,case:input.id,stage:result.stage});
      result.handoffTiming={declaredDelayMs:input.handoffDelayMs,observedVisibleToSwitchMs:performance.now()-visibleAt};
      const source=await ui.source(form);
      result.sourceAtFirstVisible=await source.inputValue();result.sourceInitiallyEnabled=await source.isEnabled();
      await new Promise(resolve=>setTimeout(resolve,fixture.sourceObservationDelayMs));
      result.sourceModeBeforeEdit=await source.inputValue();
      if(input.scope==='handoff'){
        await form.screenshot({path:join(output,input.id+'-source-handoff.png'),animations:'disabled',caret:'initial'});
        result.status='observed';await stage('complete');continue;
      }
      // Preserve the editor's own output, including any observed defect. Only
      // append a deterministic line before its closing fence; never repair it.
      const closing=result.sourceModeBeforeEdit.lastIndexOf('\n```');
      if(closing<0||result.sourceModeBeforeEdit.slice(closing+4).trim()!=='')throw new Error('Unexpected suggestion source carrier');
      const body=(['deletion','review'].includes(input.scope)?result.sourceModeBeforeEdit:result.sourceModeBeforeEdit.slice(0,closing+1)+fixture.appendLine+result.sourceModeBeforeEdit.slice(closing+1))+'\n\n'+fixture.marker;
      await source.fill(body);result.actions.push(['deletion','review'].includes(input.scope)?'Switch to source; retain the exact captured deletion proposal and add only a prose marker.':'Switch to source; append review line without rewriting the captured replacement; add prose marker.');
      await form.screenshot({path:join(output,input.id+'-source-draft.png'),animations:'disabled',caret:'initial'});
      await stage('post');await form.getByRole('button',{name:/^(Add comment now|Comment)$/u}).click();
      let discussion;
      await expect.poll(async()=>{discussion=(await request(`${base}/discussions`)).find(value=>value.notes.some(note=>note.body.includes(fixture.marker)));return Boolean(discussion);},{timeout:30000}).toBe(true);
      const note=discussion.notes.find(value=>value.body.includes(fixture.marker));
      result.saved=await request(`${base}/notes/${note.id}`);expect(result.saved.suggestions).toHaveLength(1);
      result.beforeApplyFile=await request(fileURL);
      result.beforeApplyHead=(await request(`/api/v4/projects/${project.id}/repository/branches/${encodeURIComponent(branch)}`)).commit.id;
      await page.reload();const savedNote=page.locator('#note_'+note.id);await expect(savedNote.getByText(fixture.marker,{exact:true})).toBeVisible({timeout:30000});
      await page.screenshot({path:join(output,input.id+'-posted.png'),fullPage:true,animations:'disabled',caret:'initial'});
      if(input.scope==='stale-review') {
        await staleReview({page,request,input,fixture,result,project,branch,seed,note,savedNote,mr,base,fileURL,output,stage});
        result.status='observed';await stage('complete');continue;
      }
      if(input.scope==='review'){
        await stage('edit-posted-review');await savedNote.getByRole('button',{name:'Edit comment',exact:true}).click();
        const reviewForm=savedNote.locator('form.common-note-form');surface=await ui.rich(reviewForm);await expect(surface.code).toHaveCount(1);
        result.review=await editPostedReview({side,page,form:reviewForm,surface,input,fixture,output});
        await new Promise(resolve=>setTimeout(resolve,input.handoffDelayMs));
        const reviewSource=await ui.source(reviewForm);await new Promise(resolve=>setTimeout(resolve,fixture.sourceObservationDelayMs));
        result.review.sourceBeforeSave=await reviewSource.inputValue();
        await reviewForm.getByRole('button',{name:'Save comment',exact:true}).click();
        await expect.poll(async()=>{result.review.saved=await request(`${base}/notes/${note.id}`);return result.review.saved.body!==result.saved.body;},{timeout:30000}).toBe(true);
        result.beforeApplyFile=await request(fileURL);result.beforeApplyHead=(await request(`/api/v4/projects/${project.id}/repository/branches/${encodeURIComponent(branch)}`)).commit.id;
        result.actions.push('Edit posted source and adjust its file range through real rich controls; undo the range adjustment and redo it; save normally.');
        await page.reload();await expect(savedNote.getByText(fixture.marker,{exact:true})).toBeVisible({timeout:30000});
      }
      if(['deletion','review'].includes(input.scope)){
        await savedNote.getByRole('button',{name:'Edit comment',exact:true}).click();
        const reopenForm=savedNote.locator('form.common-note-form');surface=await ui.rich(reopenForm);
        await expect(surface.code).toHaveCount(1);result.reopenedDOM=await surface.code.textContent();
        await new Promise(resolve=>setTimeout(resolve,input.handoffDelayMs));
        const reopenedSource=await ui.source(reopenForm);await new Promise(resolve=>setTimeout(resolve,fixture.sourceObservationDelayMs));
        result.reopenedSource=await reopenedSource.inputValue();
        await reopenForm.screenshot({path:join(output,input.id+'-reopened-source.png'),animations:'disabled',caret:'initial'});
        await reopenForm.getByRole('button',{name:'Cancel',exact:true}).click();await expect(reopenForm).toBeHidden();
        result.actions.push('Reload the saved proposal; reopen rich editing and inspect exact source; cancel without rewriting it.');
      }
      await stage('apply');await savedNote.getByTestId('apply-suggestion-dropdown').getByRole('button',{name:'Apply suggestion',exact:true}).click();
      await page.getByTestId('commit-message-field').fill('Apply paired editor suggestion');
      await page.getByTestId('commit-with-custom-message-button').click();
      await expect.poll(async()=>{result.appliedFile=await request(fileURL);return result.appliedFile.last_commit_id!==seed.id;},{timeout:30000}).toBe(true);
      result.appliedCommit=await request(`/api/v4/projects/${project.id}/repository/commits/${result.appliedFile.last_commit_id}`);
      result.appliedNote=await request(`${base}/notes/${note.id}`);expect(result.appliedNote.suggestions[0].applied).toBe(true);
      result.actions.push('Normal GitLab Apply suggestion creates a real source commit.');
      if(['deletion','review'].includes(input.scope)){
        await page.goto(mr.web_url+'#note_'+note.id);await expect(page.getByTestId('applied-badge')).toBeVisible({timeout:30000});
        await page.getByTestId('applied-badge').scrollIntoViewIfNeeded();
        await page.screenshot({path:join(output,input.id+'-applied.png'),fullPage:true,animations:'disabled',caret:'initial'});
        result.status='observed';await stage('complete');continue;
      }
      await stage('edit-applied-prose');await page.goto(mr.web_url+'#note_'+note.id);
      await expect(page.getByTestId('applied-badge')).toBeVisible({timeout:30000});
      const appliedNote=page.locator('#note_'+note.id);await appliedNote.getByRole('button',{name:/^Edit comment(?:,|$)/u}).click();
      const editForm=appliedNote.locator('form.common-note-form');surface=await ui.rich(editForm);
      await expect(surface.code).toHaveCount(1);result.reopenedDOM=await surface.code.textContent();
      const proseSource=await ui.source(editForm);result.sourceBeforeProseEdit=await proseSource.inputValue();
      await proseSource.fill(result.sourceBeforeProseEdit+fixture.proseSuffix);
      await editForm.getByRole('button',{name:'Save comment',exact:true}).click();
      await expect.poll(async()=>{result.afterProseNote=await request(`${base}/notes/${note.id}`);return result.afterProseNote.body.endsWith(fixture.proseSuffix);},{timeout:30000}).toBe(true);
      result.afterProseFile=await request(fileURL);
      result.afterProseHead=(await request(`/api/v4/projects/${project.id}/repository/branches/${encodeURIComponent(branch)}`)).commit.id;
      result.actions.push('Reopen the applied note in rich mode; switch to source and change only prose; save.');
      await page.goto(mr.web_url+'#note_'+note.id);await expect(page.getByText(fixture.marker+fixture.proseSuffix,{exact:true})).toBeVisible({timeout:30000});
      result.afterProseAppliedBadge=await page.getByTestId('applied-badge').isVisible();
      await page.screenshot({path:join(output,input.id+'-after-prose.png'),fullPage:true,animations:'disabled',caret:'initial'});
      result.status='observed';await stage('complete');
    } catch(error) {
      result.error=String(error);await page.screenshot({path:join(output,input.id+'-failure.png'),fullPage:true,animations:'disabled'}).catch(()=>{});
      onProgress({side,case:input.id,stage:'incomplete',error:result.error});
    } finally {await save();}
  }
  return observations;
}
