import { expect } from '@playwright/test';
import { join } from 'node:path';
import { observePage } from './gitlab-audit-editor.mjs';

function descriptionMutation(req) {
  if (new URL(req.url()).pathname !== '/api/graphql' || req.method() !== 'POST') return;
  const body = req.postDataJSON();
  return body?.variables?.input?.descriptionWidget?.description;
}

export async function runGitLabReconnectCompatibility(options) {
  const observations = [];
  for (const input of options.fixture.cases) observations.push(await runCase(options, input));
  return observations;
}

async function runCase({side, runId, project, request, page, output, onProgress}, input) {
  const result = {id:input.id, input, status:'incomplete', failures:[], pageErrors:[]};
  const context = await page.context().browser().newContext({storageState:await page.context().storageState(),
    viewport:{width:1280,height:900}, locale:'en-US',timezoneId:'UTC',recordVideo:{dir:output}});
  const actor = await context.newPage();
  await observePage(actor,result);
  actor.on('requestfailed', req => {
    const description = descriptionMutation(req);
    if (typeof description === 'string') result.failures.push({description, error:req.failure()?.errorText});
  });
  const reader = actor.locator('.js-work-item-description');
  const form = actor.getByTestId('work-item-description-wrapper');
  const editor = form.locator(side==='original'?'.ProseMirror[contenteditable="true"]':'.fountain-editor[contenteditable="true"]');
  const save = form.getByRole('button',{name:'Save changes',exact:true});
  const paragraphs = () => editor.locator('p').allTextContents();
  const snapshot = name => actor.screenshot({path:join(output,input.id+'-'+name+'.png'),animations:'disabled'});
  async function openEditor() {
    await actor.getByTestId('work-item-edit-form-button').click();
    const toggle = form.getByRole('button',{name:'Switch to rich text editing',exact:true});
    await editor.or(toggle).first().waitFor({timeout:30000});
    if (!await editor.isVisible()) await toggle.click();
    await expect(editor.locator('p').first()).toContainText(input.description);
  }
  try {
    const issues = '/api/v4/projects/'+project.id+'/issues';
    const issue = await request(issues,{title:input.id+' '+runId,description:input.description});
    result.iid = issue.iid;
    const saved = async () => (await request(issues+'/'+issue.iid)).description;
    await actor.goto(issue.web_url);
    await expect(reader).toHaveText(input.description,{timeout:30000});
    await openEditor();
    result.editorProof = await editor.evaluate(el=>({native:!!el.closest('[data-fountain-integration="native"]'),className:el.className}));
    await editor.locator('p').first().click();
    await actor.keyboard.press('End');
    onProgress({side,case:input.id,stage:'go-offline-and-edit'});
    await context.setOffline(true);
    result.offline = await actor.evaluate(()=>!navigator.onLine);
    await actor.keyboard.insertText(input.suffix);
    await expect(editor.locator('p').first()).toHaveText(input.description+input.suffix);
    // Let ordinary draft propagation finish. The paired quick-save suite tests
    // short typing-to-submit intervals separately.
    await actor.waitForTimeout(550);
    await save.click();
    await expect.poll(()=>result.failures.length,{timeout:15000}).toBeGreaterThan(0);
    const alerts = actor.getByRole('alert').filter({hasText:/could not be saved|failed to save|unable to save|could not save/i});
    try { await alerts.first().waitFor({timeout:4000}); }
    catch (error) { if (error.name !== 'TimeoutError') throw error; }
    result.saveWarning = await alerts.first().isVisible();
    result.warningText = await alerts.allTextContents();
    result.draftAfterFailure = await paragraphs();
    result.serverWhileOffline = await saved();
    await snapshot('failed-save');
    onProgress({side,case:input.id,stage:'restore-connection'});
    await context.setOffline(false);
    if (input.reloadBeforeRetry) {
      await actor.reload();
      await expect(reader).toHaveText(input.description,{timeout:30000});
    }
    if (!await editor.isVisible()) await openEditor();
    result.serverBeforeRetry = await saved();
    result.recoveredDraft = await paragraphs();
    await expect(save).toBeEnabled();
    await save.click();
    await expect(editor).toBeHidden({timeout:30000});
    result.afterRetry = await saved();
    await actor.reload();
    await expect(reader.locator('p').first()).toBeVisible({timeout:30000});
    result.reader = await reader.innerText();
    result.afterReload = await saved();
    await snapshot('reloaded');
    result.status = 'observed';
  } catch (error) {
    result.failure = String(error);
    await snapshot('interrupted').catch(()=>{});
  } finally {
    await context.close();
  }
  return result;
}
