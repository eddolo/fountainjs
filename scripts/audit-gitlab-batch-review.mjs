import {expect} from '@playwright/test';
import {join} from 'node:path';

async function readAppliedBadge(reader) {
  const badge = reader.getByTestId('applied-badge');
  const apply = reader.getByTestId('apply-suggestion-dropdown');
  // The prose and raw suggestion source paint before GitLab mounts the interactive reader.
  await expect(badge.or(apply).first()).toBeVisible({timeout:15000});
  return badge.isVisible();
}

export async function batchReview({page,ui,openLineForm,request,project,fixture,result,input,mr,base,note,seed,branch,fileURL,output,stage}) {
  const batch = result.batch = {};
  await stage('write-second-review');
  const form = await openLineForm(page, mr, {start: input.secondLine, end: input.secondLine}, input.secondFilePath);
  const surface = await ui.rich(form);
  await ui.insert(form);
  const secondSource = input.source.split('\n')[input.secondLine - 1];
  await expect(surface.code).toContainText(secondSource);
  await surface.code.click();
  if (result.editorProof.native) {
    await page.getByRole('button',{name:'Edit suggestion',exact:true}).click();
    const dialog = page.getByRole('dialog',{name:'Suggested replacement',exact:true});
    await dialog.getByRole('textbox',{name:'Replacement source',exact:true}).fill(fixture.secondReplacement);
    await dialog.getByRole('button',{name:'Apply suggestion',exact:true}).click();
    await expect(dialog).toBeHidden();
  } else {
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    expect(await page.evaluate(()=>window.getSelection()?.toString())).toBe(secondSource);
    await page.keyboard.insertText(fixture.secondReplacement);
  }
  await expect(surface.code).toContainText(fixture.secondReplacement);
  await new Promise(resolve=>setTimeout(resolve,input.handoffDelayMs));
  const source = await ui.source(form);
  const expectedCarrier = ['```suggestion:-0+0', fixture.secondReplacement, '```'].join('\n');
  await expect(source).toHaveValue(expectedCarrier);
  batch.secondCarrier = await source.inputValue();
  const secondBody = batch.secondCarrier+'\n\n'+fixture.secondMarker;
  await source.fill(secondBody);
  await form.getByRole('button', {name:/^(Add comment now|Comment)$/u}).click();
  let other;
  await expect.poll(async () => {
    other = (await request(base+'/discussions')).flatMap(d => d.notes).find(n => n.body === secondBody);
    return other?.id;
  }).toBeTruthy();
  const noteIds = [note.id, other.id];
  const readers = noteIds.map(id => page.locator('#note_'+id));
  const adds = readers.map(reader => reader.getByRole('button',{name:'Add suggestion to batch',exact:true}));
  const removes = readers.map(reader => reader.getByRole('button',{name:'Remove from batch',exact:true}));
  const headURL = '/api/v4/projects/'+project.id+'/repository/branches/'+encodeURIComponent(branch);
  const snapshot = async () => {
    const head = (await request(headURL)).commit;
    const files = {};
    let changedPaths;
    if (input.secondFilePath) {
      const repository = '/api/v4/projects/'+project.id+'/repository';
      for (const path of [input.filePath,input.secondFilePath,input.untouchedFilePath]) {
        const file = await request(repository+'/files/'+encodeURIComponent(path)+'?ref='+head.id);
        files[file.file_path] = {source:Buffer.from(file.content,'base64').toString('utf8'),commit:file.last_commit_id};
      }
      const diff = await request(repository+'/commits/'+head.id+'/diff');
      changedPaths = diff.map(entry=>({from:entry.old_path,to:entry.new_path})).sort((a,b)=>a.to.localeCompare(b.to));
    }
    const primary = files[input.filePath];
    const file = primary ? null : await request(fileURL);
    const notes = await Promise.all(noteIds.map(id => request(base+'/notes/'+id)));
    return {head:head.id,parents:head.parent_ids,message:head.title,fileCommit:primary?.commit ?? file.last_commit_id,
      source:primary?.source ?? Buffer.from(file.content,'base64').toString('utf8'), ...(primary ? {files,changedPaths} : {}),
      notes:notes.map(n=>({id:n.id,body:n.body,suggestions:n.suggestions,...(primary ? {position:n.position} : {})}))};
  };
  const queue = async () => Promise.all(removes.map(button=>button.isVisible()));
  await page.goto(mr.web_url+'#note_'+note.id);
  await expect(readers[1].getByText(fixture.secondMarker,{exact:true})).toBeVisible();
  batch.before = await snapshot();
  await stage('queue-and-remove');
  await adds[0].click(); await expect(removes[0]).toBeVisible();
  batch.firstOnly = await queue();
  await adds[1].click(); await expect(removes[1]).toBeVisible();
  batch.both = await queue();
  await removes[0].click(); await expect(adds[0]).toBeVisible();
  batch.secondOnly = await queue();
  await adds[0].click(); await expect(removes[0]).toBeVisible();
  batch.requeued = await queue();
  batch.beforeSubmit = await snapshot();
  const apply = readers[1].getByRole('button',{name:'Apply 2 suggestions',exact:true});
  await apply.click();
  const message = page.getByTestId('commit-message-field').filter({visible:true});
  const confirm = page.getByTestId('commit-with-custom-message-button').filter({visible:true});
  if (input.secondFilePath) {
    const requests = [];
    const observe = req => {
      if (req.method()==='PUT' && /^\/api\/v4\/suggestions\/(?:batch_apply|\d+\/apply)$/u.test(new URL(req.url()).pathname))
        requests.push(new URL(req.url()).pathname);
    };
    page.on('request', observe);
    try {
      await message.fill('Dismiss this pending review');
      await message.press('Escape');
      await expect(message).toBeHidden();
      batch.dismissed = {queue:await queue(),state:await snapshot(),requests};
    } finally { page.off('request',observe); }
    await apply.click();
  }
  await message.fill(fixture.commitMessage);
  await expect(confirm).toBeEnabled();
  await page.screenshot({path:join(output,input.id+'-before-confirmation.png'),animations:'disabled'});
  if (input.competingSource) {
    await stage('change-queued-target');
    const commit = await request('/api/v4/projects/'+project.id+'/repository/commits',{branch,
      commit_message:'Change the second target during review',actions:[{action:'update',file_path:input.secondFilePath ?? input.filePath,content:input.competingSource,last_commit_id:seed.id}]});
    batch.competingCommit = {id:commit.id,parents:commit.parent_ids};
    expect(commit.parent_ids).toEqual([seed.id]);
    await expect.poll(async () => (await request(base)).diff_refs?.head_sha, {timeout:60000}).toBe(commit.id);
    const remote = await snapshot();
    expect(input.secondFilePath ? remote.files[input.secondFilePath].source : remote.source).toBe(input.competingSource);
  }
  await stage('confirm-batch');
  if (await confirm.isVisible() && await confirm.isEnabled()) {
    const [reply] = await Promise.all([
      page.waitForResponse(res => res.request().method()==='PUT' && new URL(res.url()).pathname==='/api/v4/suggestions/batch_apply'),
      confirm.click(),
    ]);
    batch.response = {status:reply.status(),request:reply.request().postDataJSON(),body:await reply.json()};
    const outcome = readers[1].getByTestId('applied-badge').or(page.getByRole('alert').filter({hasText:/suggestion|apply|outdated|branch|change|conflict|commit/i})).first();
    try { await outcome.waitFor({timeout:6000}); } catch (error) { if (error.name!=='TimeoutError') throw error; }
  } else {
    batch.confirmUnavailable = true;
  }
  batch.after = await snapshot();
  batch.alerts = await page.getByRole('alert').filter({visible:true}).allTextContents();
  batch.visibleBadges = await Promise.all(readers.map(reader=>reader.getByTestId('applied-badge').isVisible()));
  await page.screenshot({path:join(output,input.id+'-decision.png'),animations:'disabled'});
  // Keep the failed queue open while a separate reader verifies persisted state.
  const context = input.recoverUnchanged ? await page.context().browser().newContext({
    storageState: await page.context().storageState(), viewport:page.viewportSize(),locale:'en-US',timezoneId:'UTC',
  }) : null;
  try {
    const readerPage = context ? await context.newPage() : page;
    batch.reloadedBadges = [];
    for (const [i, marker] of [fixture.marker,fixture.secondMarker].entries()) {
      await readerPage.goto(mr.web_url+'#note_'+noteIds[i]);
      await readerPage.reload();
      const reader = readerPage.locator('#note_'+noteIds[i]);
      await expect(reader.getByText(marker,{exact:true})).toBeVisible();
      batch.reloadedBadges.push(await readAppliedBadge(reader));
      await reader.screenshot({path:join(output,input.id+'-reloaded-'+(i+1)+'.png'),animations:'disabled'});
    }
    batch.reloaded = await snapshot();
  } finally { await context?.close(); }
  if (input.recoverUnchanged)
    await recoverQueuedReview({page,readers,removes,fixture,input,batch,snapshot,output,stage,mr,noteIds});
}

async function recoverQueuedReview({page,readers,removes,fixture,input,batch,snapshot,output,stage,mr,noteIds}) {
  const recovery = batch.recovery = {};
  await stage('recover-unchanged-target');
  // Preserve the failed queue in this tab. Only the reviewer can remove an item.
  recovery.queuedAfterRefusal = await Promise.all(removes.map(button=>button.isVisible()));
  await removes[1].click();
  await expect(removes[1]).toBeHidden();
  recovery.remaining = await Promise.all(removes.map(button=>button.isVisible()));
  recovery.before = await snapshot();
  await readers[0].getByRole('button',{name:'Apply suggestion',exact:true}).click();
  await page.getByTestId('commit-message-field').filter({visible:true}).fill(fixture.recoveryMessage);
  const confirm = page.getByTestId('commit-with-custom-message-button').filter({visible:true});
  const id = batch.before.notes[0].suggestions[0].id;
  const [response] = await Promise.all([
    page.waitForResponse(res=>res.request().method()==='PUT' && new URL(res.url()).pathname==='/api/v4/suggestions/'+id+'/apply'),
    confirm.click(),
  ]);
  recovery.response = {status:response.status(), path:new URL(response.url()).pathname, request:response.request().postDataJSON()};
  if (response.ok()) await expect(readers[0].getByTestId('applied-badge')).toBeVisible();
  recovery.after = await snapshot();
  recovery.badges = [];
  for (const [index, marker] of [fixture.marker,fixture.secondMarker].entries()) {
    await page.goto(mr.web_url+'#note_'+noteIds[index]); await page.reload();
    await expect(readers[index].getByText(marker,{exact:true})).toBeVisible();
    recovery.badges.push(await readAppliedBadge(readers[index]));
    await readers[index].screenshot({path:join(output,input.id+'-recovered-'+(index+1)+'.png'),animations:'disabled'});
  }
  recovery.reloaded = await snapshot();
  await page.screenshot({path:join(output,input.id+'-recovered.png'),animations:'disabled'});
}
