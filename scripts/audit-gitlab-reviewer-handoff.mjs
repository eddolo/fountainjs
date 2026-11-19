import {expect} from '@playwright/test';
import {join} from 'node:path';
import {prepareGitLabAuditMember} from './gitlab-audit-member.mjs';

export async function withBatchReviewer({page,request,project,fixture,result,output}, review) {
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

export async function refreshReviewerRole({page,readers,adds,removes,apply,message,confirm,setRole,batch,snapshot,output,stage}) {
  const roles = batch.roles;
  const observeControls = async () => ({
    confirmEnabled:await confirm.isVisible() && await confirm.isEnabled(),
    notes:await Promise.all(readers.map(async (reader,i) => {
      const single = reader.getByRole('button',{name:'Apply suggestion',exact:true});
      return {
        header:await reader.getByText('Suggested change',{exact:true}).isVisible(),
        canAdd:await adds[i].isVisible() && await adds[i].isEnabled(),
        canApply:await single.isVisible() && await single.isEnabled(),
        queued:await removes[i].isVisible(),
      };
    })),
    canApplyBatch:await apply.isVisible() && await apply.isEnabled(),
  });
  const requests = [];
  const watch = req => {
    if (req.method()==='PUT' && new URL(req.url()).pathname.startsWith('/api/v4/suggestions/')) requests.push(new URL(req.url()).pathname);
  };
  page.on('request',watch);
  try {
    await expect(message).toBeVisible();
    await expect(confirm).toBeEnabled();
    roles.queued = await observeControls();
    await stage('reviewer-becomes-reporter');
    roles.lowered = await setRole(20);
    // Capture the open form at a bounded interval, then inspect a fresh reader in the same session.
    const since = performance.now();
    await new Promise(resolve=>setTimeout(resolve,3000));
    roles.open = await observeControls();
    roles.sampleMs = Math.round(performance.now()-since);
    await page.screenshot({path:join(output,'reporter-open.png'),animations:'disabled'});
    const refresh = async () => {
      await page.reload();
      for (const reader of readers) await expect(reader.getByText('Suggested change',{exact:true})).toBeVisible();
    };
    await refresh();
    roles.fresh = await observeControls();
    roles.saved = await snapshot();
    await page.screenshot({path:join(output,'reporter-reloaded.png'),animations:'disabled'});
    await stage('restore-developer-review');
    roles.restored = await setRole(30);
    await refresh();
    roles.returned = await observeControls();
    for (const [i,add] of adds.entries()) {
      if (!await removes[i].isVisible()) await add.click();
      await expect(removes[i]).toBeVisible();
    }
    await apply.click();
    await expect(message).toBeVisible();
    roles.requestsBeforeConfirmation = requests;
  } finally { page.off('request',watch); }
}
