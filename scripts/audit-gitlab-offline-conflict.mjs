import {expect} from '@playwright/test';

export async function exerciseOfflineConflict({actor, author, side, input, result, issue, readSaved, open, append, editor, wrapper, stage, shot}) {
  const draft = input.markdown.replace('Shared record.', 'Shared record.' + input.localSuffix);
  const remote = input.markdown.replace('Shared record.', 'Shared record.' + input.remoteSuffix);
  const selector = side === 'original' ? '.ProseMirror[contenteditable="true"]' : '.fountain-editor[contenteditable="true"]';
  const proof = locator => locator.evaluate(el => ({native:!!el.closest('[data-fountain-integration="native"]'),className:el.className}));
  const owner = await author.request.get('http://127.0.0.1:5080/api/v4/user');
  expect(owner.ok()).toBe(true);
  result.onlineAuthorId = (await owner.json()).id;
  expect(result.onlineAuthorId).toBe(issue.author.id);
  expect(result.onlineAuthorId).not.toBe(result.actor.id);
  await open();
  result.editorProof = await proof(editor);
  await author.goto(issue.web_url);
  await expect(author.locator('.js-work-item-description')).toContainText('End marker.',{timeout:30000});
  await author.getByTestId('work-item-edit-form-button').click();
  const authorForm = author.getByTestId('work-item-description-wrapper');
  const authorEditor = authorForm.locator(selector);
  const toggle = authorForm.getByRole('button',{name:'Switch to rich text editing',exact:true});
  await authorEditor.or(toggle).first().waitFor({timeout:30000});
  if (!await authorEditor.isVisible()) await toggle.click();
  await expect(authorEditor.getByText('End marker.',{exact:true})).toBeVisible();
  result.remoteEditorProof = await proof(authorEditor);
  const failures = [];
  actor.on('requestfailed',req=>{
    if(new URL(req.url()).pathname!=='/api/graphql'||req.method()!=='POST')return;
    const description=req.postDataJSON()?.variables?.input?.descriptionWidget?.description;
    if(typeof description==='string')failures.push({description,error:req.failure()?.errorText});
  });
  await stage('disconnect-and-draft');
  await actor.context().setOffline(true);
  result.wasOffline = await actor.evaluate(()=>!navigator.onLine);
  await append('Shared record.',input.localSuffix);
  const submit = wrapper.getByRole('button',{name:'Save changes',exact:true});
  await submit.click();
  await expect.poll(()=>failures.some(f=>f.description===draft && f.error==='net::ERR_INTERNET_DISCONNECTED')).toBe(true);
  result.failedWrites = failures;
  result.afterFailedSave = await readSaved();
  await stage('author-saves-new-version');
  await authorForm.getByRole('button',{name:'Switch to plain text editing',exact:true}).click();
  const source = authorForm.locator('textarea[data-testid="markdown-editor-form-field"]');
  await expect(source).toHaveValue(input.markdown);
  await source.fill(remote);
  await expect(source).toHaveValue(remote);
  await authorForm.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect.poll(readSaved,{timeout:30000}).toBe(remote);
  result.whileDisconnected = await readSaved();
  result.stillOffline = await actor.evaluate(()=>!navigator.onLine);
  const conflict = wrapper.getByRole('alert').filter({hasText:'Someone edited the description at the same time you did.'});
  result.conflictVisibleBeforeReconnect = await conflict.isVisible();
  await actor.context().setOffline(false);
  await stage('reconnect');
  // Discard after reviewing the server version, or press the ordinary Save
  // immediately on reconnect if the application still offers it.
  result.normalSaveClicked = false;
  if(input.resolution==='overwrite' && await submit.isVisible() && !await conflict.isVisible()){
    await submit.click();
    result.normalSaveClicked = true;
    await expect.poll(async()=>await conflict.isVisible()||!await editor.isVisible(),{timeout:12000}).toBe(true);
  }else {
    try {await conflict.waitFor({timeout:15000});}
    catch(error){if(error.name!=='TimeoutError')throw error;}
  }
  result.beforeDecision = await readSaved();
  result.conflictShown = await conflict.isVisible();
  result.draftShown = await editor.getByText('Shared record.'+input.localSuffix,{exact:true}).isVisible();
  result.currentVersion = null;
  if(result.conflictShown){
    await conflict.locator('summary').click();
    result.currentVersion = await conflict.getByTestId('conflicted-description').inputValue();
  }
  await shot('decision');
  result.explicitDecision = false;
  if(input.resolution==='overwrite' && result.conflictShown){
    await conflict.getByRole('button',{name:'Save and overwrite',exact:true}).click();
    result.explicitDecision=true;
  }else if(input.resolution==='discard' && await editor.isVisible()){
    await wrapper.getByRole('button',{name:result.conflictShown?'Discard changes':'Cancel',exact:true}).click();
    await actor.getByRole('dialog').getByRole('button',{name:'Discard changes',exact:true}).click();
    result.explicitDecision=result.conflictShown;
  }
  if(result.explicitDecision) await expect(editor).toBeHidden({timeout:30000});
  result.afterDecision = await readSaved();
  await actor.reload();
  const reader = actor.locator('.js-work-item-description');
  await expect(reader).toContainText('End marker.',{timeout:30000});
  result.reader = await reader.locator('p').allTextContents();
  await shot('reloaded');
}
