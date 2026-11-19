import {expect} from '@playwright/test';
import {join} from 'node:path';

export async function submitIssueDrafts({actor,author,editor,authorEditor,wrapper,authorForm,input,result,readSaved,append,output,stage,issue}) {
  result.issueGid = 'gid://gitlab/WorkItem/'+issue.id;
  await append('Shared record.',input.localSuffix);
  const ownerParagraph = authorEditor.getByText('Shared record.',{exact:true});
  await ownerParagraph.click();
  await author.keyboard.press('End');
  await author.keyboard.insertText(input.remoteSuffix);
  await expect(authorEditor.getByText('Shared record.' + input.remoteSuffix,{exact:true})).toBeVisible();
  result.baselineBeforeSaves = await readSaved();
  await stage('both-issue-drafts-ready');
  const participants = [
    {view:actor,form:wrapper,surface:editor,id:result.actor.id,suffix:input.localSuffix},
    {view:author,form:authorForm,surface:authorEditor,id:result.onlineAuthorId,suffix:input.remoteSuffix},
  ];
  const submit = async ({view,form,id,suffix}) => {
    const description = input.markdown.replace('Shared record.','Shared record.'+suffix);
    const [response] = await Promise.all([
      view.waitForResponse(reply => new URL(reply.url()).pathname==='/api/graphql' && reply.request().method()==='POST' &&
        reply.request().postDataJSON()?.variables?.input?.descriptionWidget?.description === description, {timeout:60000}),
      form.getByRole('button',{name:'Save changes',exact:true}).click(),
    ]);
    const body = await response.json();
    const update = body.data?.workItemUpdate;
    await response.finished();
    const time = response.request().timing();
    return {actor:id,description,status:response.status(),updateId:update?.workItem?.id ?? null,
      errors:[...(body.errors ?? []).map(e=>e.message),...(update?.errors ?? [])],
      mutationReturned:!!update,requestStart:time.requestStart,responseEnd:time.responseEnd,
      start:time.startTime+time.requestStart,end:time.startTime+time.responseEnd};
  };
  const submissions = await Promise.allSettled(participants.map(submit));
  result.submissions = submissions.map((s,i)=>s.status==='fulfilled'?s.value:{actor:participants[i].id,error:String(s.reason)});
  result.persisted = await readSaved();
  if (submissions.some(s=>s.status!=='fulfilled')) throw new Error('Could not observe both real issue Save responses.');
  result.decisions = [];
  for (const {view,form,surface,id,suffix} of participants) {
    const alerts = form.getByRole('alert').filter({visible:true});
    const deadline = Date.now()+10000;
    while (await surface.isVisible() && !await alerts.first().isVisible() && Date.now()<deadline)
      await new Promise(resolve=>setTimeout(resolve,200));
    const draftVisible = await surface.getByText('Shared record.'+suffix,{exact:true}).isVisible();
    const warnings = await alerts.allInnerTexts();
    result.decisions.push({actor:id,draftVisible,editable:await surface.isVisible(),warnings});
    await (await surface.isVisible()?surface:view.locator('.js-work-item-description')).scrollIntoViewIfNeeded();
    await view.screenshot({path:join(output,input.id+'-'+id+'-decision.png'),animations:'disabled'});
  }
  // An independent reader reopens the issue while both author tabs are still intact.
  const reader = await author.context().newPage();
  try {
    await reader.goto(issue.web_url);
    const doc = reader.locator('.js-work-item-description');
    await expect(doc.getByText('End marker.',{exact:true})).toBeVisible();
    result.reader = await doc.locator('p').allTextContents();
    result.afterReload = await readSaved();
  } finally { await reader.close(); }
}
