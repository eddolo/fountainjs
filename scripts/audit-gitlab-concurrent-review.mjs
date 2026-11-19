import {expect} from '@playwright/test';
import {join} from 'node:path';
import {prepareGitLabAuditMember} from './gitlab-audit-member.mjs';

const origin = 'http://127.0.0.1:5080';

export async function concurrentReview({page,request,project,fixture,result,input,mr,base,note,branch,fileURL,output,stage}) {
  const member = await prepareGitLabAuditMember({request,project,fixture});
  const peer = await page.context().browser().newContext({viewport:{width:1280,height:900},locale:'en-US',timezoneId:'UTC'});
  try {
    result.membership = await member.setRole(30);
    const developer = await peer.newPage();
    await member.signInMember(developer,result);
    const viewers = [page,developer];
    const suggestion = result.saved.suggestions[0];
    const applyPath = '/api/v4/suggestions/'+suggestion.id+'/apply';
    const reviews = viewers.map(view => view.locator('#note_'+note.id));
    const messages = ['Apply review as issue owner','Apply review as project developer'];
    const participants = [];
    for (const [index,view] of viewers.entries()) {
      const me = await view.request.get(origin+'/api/v4/user');
      expect(me.ok()).toBe(true);
      const {id,username} = await me.json();
      participants.push({id,username,message:messages[index]});
      await view.goto(mr.web_url+'#note_'+note.id);
      await expect(reviews[index].getByText(fixture.marker,{exact:true})).toBeVisible();
      const dropdown = reviews[index].getByTestId('apply-suggestion-dropdown');
      await dropdown.getByRole('button',{name:'Apply suggestion',exact:true}).click();
      await view.getByTestId('commit-message-field').fill(messages[index]);
      await expect(view.getByTestId('commit-with-custom-message-button')).toBeEnabled();
    }
    expect(participants[1].id).toBe(member.account.id);
    expect(participants[1].id).not.toBe(participants[0].id);
    result.reviewers = participants;
    await stage('both-reviewers-ready');
    async function submit(view,index) {
      const noteReads = [];
      view.on('response', reply => {
        if (reply.request().method()==='GET' && new URL(reply.url()).pathname===base+'/notes/'+note.id) {
          noteReads.push(reply.json().then(record=>({status:reply.status(),noteId:record.id,
            suggestion:record.suggestions?.find(s=>s.id===suggestion.id)?.applied})).catch(()=>({status:reply.status()})));
        }
      });
      const [response] = await Promise.all([
        view.waitForResponse(r=>r.request().method()==='PUT' && new URL(r.url()).pathname===applyPath,{timeout:120000}),
        view.getByTestId('commit-with-custom-message-button').click(),
      ]);
      await response.finished();
      const timing = response.request().timing();
      const alert = reviews[index].getByRole('alert').first();
      const badge = reviews[index].getByTestId('applied-badge');
      await expect.poll(async()=>await alert.isVisible() || await badge.isVisible(),{timeout:20000}).toBe(true);
      const screenshot = input.id+'-'+participants[index].username+'-decision.png';
      await reviews[index].evaluate(element=>element.scrollIntoView({block:'center'}));
      await reviews[index].screenshot({path:join(output,screenshot),animations:'disabled'});
      return {actor:participants[index].id,path:applyPath,status:response.status(),
        start:timing.startTime+timing.requestStart,end:timing.startTime+timing.responseEnd,
        requestStart:timing.requestStart,responseEnd:timing.responseEnd,
        alert:await alert.isVisible()?await alert.innerText():'',badge:await badge.isVisible(),
        applyVisible:await reviews[index].getByRole('button',{name:'Apply suggestion',exact:true}).isVisible(),
        noteReads:await Promise.all(noteReads)};
    }
    // Each signed-in reviewer clicks the actual confirmation once.
    const attempts = await Promise.allSettled(viewers.map(submit));
    result.submissions = attempts.map((attempt,index) => attempt.status==='fulfilled' ? attempt.value :
      {actor:participants[index].id,error:'Confirmation observation failed: '+String(attempt.reason)});
    await stage('read-committed-review');
    const snapshot = async () => {
      const file = await request(fileURL);
      const {commit} = await request('/api/v4/projects/'+project.id+'/repository/branches/'+encodeURIComponent(branch));
      const current = await request(base+'/notes/'+note.id);
      return {source:Buffer.from(file.content,'base64').toString('utf8'),fileCommit:file.last_commit_id,
        head:commit.id,parents:commit.parent_ids,message:commit.message.trimEnd(),noteId:current.id,body:current.body,
        suggestions:current.suggestions.map(s=>({id:s.id,applied:s.applied}))};
    };
    result.afterDecision = await snapshot();
    result.reloadedReviewers = await Promise.all(viewers.map(async(view,index)=>{
      await view.reload();
      await expect(reviews[index].getByText(fixture.marker,{exact:true})).toBeVisible();
      return {actor:participants[index].id,badge:await reviews[index].getByTestId('applied-badge').isVisible(),
        canApply:await reviews[index].getByRole('button',{name:'Apply suggestion',exact:true}).isVisible() &&
          await reviews[index].getByRole('button',{name:'Apply suggestion',exact:true}).isEnabled()};
    }));
    result.afterReload = await snapshot();
    if (result.submissions.some(submission=>submission.error)) throw new Error('Missing confirmation observation; retained both file and note snapshots.');
  } finally {
    try { await peer.close(); } finally { result.cleanupMembership = await member.setRole(10); }
  }
}
