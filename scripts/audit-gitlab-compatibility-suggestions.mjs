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
      const body=(input.scope==='deletion'?result.sourceModeBeforeEdit:result.sourceModeBeforeEdit.slice(0,closing+1)+fixture.appendLine+result.sourceModeBeforeEdit.slice(closing+1))+'\n\n'+fixture.marker;
      await source.fill(body);result.actions.push(input.scope==='deletion'?'Switch to source; retain the exact captured deletion proposal and add only a prose marker.':'Switch to source; append review line without rewriting the captured replacement; add prose marker.');
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
      if(input.scope==='deletion'){
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
      if(input.scope==='deletion'){
        await page.goto(mr.web_url+'#note_'+note.id);await expect(page.getByTestId('applied-badge')).toBeVisible({timeout:30000});
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
