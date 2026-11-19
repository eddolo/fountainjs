import {expect} from '@playwright/test';
import {join} from 'node:path';
import {prepareGitLabAuditMember} from './gitlab-audit-member.mjs';

export async function withBatchReviewer({page,observeContext,request,project,fixture,result,output}, review) {
  const member = await prepareGitLabAuditMember({request,project,fixture});
  const browser = page.context().browser();
  const options = {viewport:page.viewportSize(),locale:'en-US',timezoneId:'UTC'};
  const login = await browser.newContext(options);
  const roles = result.batch.roles = {};
  try {
    roles.initial = await member.setRole(30);
    await member.signInMember(await login.newPage(),result);
    const context = await browser.newContext({...options,storageState:await login.storageState(),recordVideo:{dir:output}});
    let video;
    try {
      await observeContext(context,'Reviewer');
      const reviewer = await context.newPage();
      video = reviewer.video();
      const who = await reviewer.request.get('http://127.0.0.1:5080/api/v4/user');
      if (!who.ok()) throw new Error('Could not identify the recorded reviewer session (HTTP '+who.status()+').');
      const {id,username} = await who.json();
      roles.actor = {id,username};
      expect(id).toBe(member.account.id);
      await review(reviewer,member.setRole);
    } finally {
      await context.close();
      if (video) {
        await video.saveAs(join(output,'reviewer-handoff.webm'));
        await video.delete();
      }
    }
  } finally {
    try { await login.close(); } finally { roles.cleanup = await member.setRole(10); }
  }
}

export async function refreshReviewerRole({page,fixture,readers,adds,removes,apply,message,confirm,setRole,batch,snapshot,output,stage}) {
  const roles = batch.roles;
  const observeControls = async (controls = {readers,adds,removes,apply,confirm}) => ({
    confirmEnabled:await controls.confirm.isVisible() && await controls.confirm.isEnabled(),
    notes:await Promise.all(controls.readers.map(async (reader,i) => {
      const single = reader.getByRole('button',{name:'Apply suggestion',exact:true});
      return {
        header:await reader.getByText('Suggested change',{exact:true}).isVisible(),
        canAdd:await controls.adds[i].isVisible() && await controls.adds[i].isEnabled(),
        canApply:await single.isVisible() && await single.isEnabled(),
        queued:await controls.removes[i].isVisible(),
      };
    })),
    canApplyBatch:await controls.apply.isVisible() && await controls.apply.isEnabled(),
  });
  const requests = [];
  const accessReads = [];
  let phase = 'developer';
  const capture = response => {
    if (response.request().method()!=='GET' || !new URL(response.url()).pathname.includes('/repository/branches/')) return;
    const receipt = {phase,status:response.status()};
    accessReads.push(response.json().then(data=>({...receipt,canPush:data.can_push})).catch(()=>receipt));
  };
  page.on('response',capture);
  const watch = req => {
    if (req.method()==='PUT' && new URL(req.url()).pathname.startsWith('/api/v4/suggestions/')) requests.push(new URL(req.url()).pathname);
  };
  page.on('request',watch);
  try {
    await expect(message).toBeVisible();
    await expect(confirm).toBeEnabled();
    await message.fill(fixture.commitMessage);
    roles.draftBefore = await message.inputValue();
    roles.queued = await observeControls();
    await stage('reviewer-becomes-reporter');
    roles.lowered = await setRole(20);
    phase = 'reporter';
    // Capture the open form at a bounded interval, then inspect a fresh reader in the same session.
    const since = performance.now();
    await new Promise(resolve=>setTimeout(resolve,3000));
    roles.open = await observeControls();
    roles.sampleMs = Math.round(performance.now()-since);
    roles.accessNotice = await readers[1].getByRole('status').filter({hasText:'Write access to the source branch is unavailable.'}).isVisible();
    await page.screenshot({path:join(output,'reporter-open.png'),animations:'disabled'});
    const fresh = await page.context().newPage();
    try {
      const ids = await Promise.all(readers.map(reader=>reader.getAttribute('id')));
      const freshReaders = ids.map(id=>fresh.locator('#'+id));
      await fresh.goto(page.url());
      for (const reader of freshReaders) await expect(reader.getByText('Suggested change',{exact:true})).toBeVisible();
      roles.fresh = await observeControls({readers:freshReaders,
        adds:freshReaders.map(reader=>reader.getByRole('button',{name:'Add suggestion to batch',exact:true})),
        removes:freshReaders.map(reader=>reader.getByRole('button',{name:'Remove from batch',exact:true})),
        apply:freshReaders[1].getByRole('button',{name:'Apply 2 suggestions',exact:true}),
        confirm:fresh.getByTestId('commit-with-custom-message-button').filter({visible:true})});
      roles.saved = await snapshot();
      await fresh.screenshot({path:join(output,'reporter-reloaded.png'),animations:'disabled'});
    } finally { await fresh.close(); }
    await page.bringToFront();
    await stage('restore-developer-review');
    roles.restored = await setRole(30);
    phase = 'restored';
    const recheck = readers[1].getByRole('button',{name:'Check access again',exact:true});
    roles.recheckOffered = await recheck.isVisible();
    if (roles.recheckOffered) await recheck.click();
    await expect(apply).toBeEnabled();
    if (!await message.isVisible()) await apply.click();
    await expect(confirm).toBeEnabled();
    roles.returned = await observeControls();
    roles.draftAfter = await message.inputValue();
    await page.screenshot({path:join(output,'developer-restored.png'),animations:'disabled'});
    roles.requestsBeforeConfirmation = requests;
  } finally {
    page.off('request',watch);
    page.off('response',capture);
    roles.accessReads = await Promise.all(accessReads);
  }
}
