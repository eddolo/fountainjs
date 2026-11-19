import { expect } from '@playwright/test';
import { join } from 'node:path';
import { recordGitLabSave } from '../integrations/gitlab/testing/save-gesture.mjs';

export async function runGitLabQuickSaveCompatibility(options) {
  const results = [];
  for (const input of options.fixture.cases) results.push(await runCase(options, input));
  return results;
}

async function runCase({ page, project, request, side, runId, output, onProgress }, input) {
  const result = { id: input.id, input, status: 'incomplete', pageErrors: [] };
  const context = await page.context().browser().newContext({
    storageState: await page.context().storageState(), locale: 'en-US', timezoneId: 'UTC',
    viewport: { width: 1280, height: 900 }, recordVideo: { dir: output },
  });
  const actor = await context.newPage();
  actor.on('pageerror', error => result.pageErrors.push(error.message));
  const form = actor.getByTestId('work-item-description-wrapper');
  const editor = form.locator(side === 'original' ? '.ProseMirror[contenteditable="true"]' : '.fountain-editor[contenteditable="true"]');
  async function openEditor() {
    await actor.getByTestId('work-item-edit-form-button').click();
    const toggle = form.getByRole('button', { name: 'Switch to rich text editing', exact: true });
    await editor.or(toggle).first().waitFor({ timeout: 30000 });
    if (!await editor.isVisible()) await toggle.click();
    await editor.waitFor({ timeout: 30000 });
  }
  try {
    onProgress({side, case: input.id, stage: 'open-issue'});
    const issues = '/api/v4/projects/' + project.id + '/issues';
    const issue = await request(issues, {title: input.id + ' ' + runId, description: input.description});
    result.iid = issue.iid;
    const api = issues + '/' + issue.iid;
    await actor.goto(issue.web_url);
    const reader = actor.locator('.js-work-item-description');
    await expect(reader).toHaveText(input.description, {timeout:30000});
    await openEditor();
    const paragraph = editor.locator('p').first();
    await expect(paragraph).toHaveText(input.description);
    result.editorProof = await editor.evaluate(el => ({native: !!el.closest('[data-fountain-integration="native"]'), className: el.className}));
    const save = form.getByRole('button', {name: 'Save changes', exact: true});
    await save.scrollIntoViewIfNeeded();
    await paragraph.click();
    await actor.keyboard.press('End');
    onProgress({side, case: input.id, stage:'type-and-save'});
    result.gesture = await recordGitLabSave({page:actor,editor,button:save,key:input.key,pace:input.pace});
    await expect(editor).toBeHidden({timeout: 30000});
    result.afterSubmit = (await request(api)).description;
    await actor.reload();
    await expect(reader.locator('p').first()).toBeVisible({timeout:30000});
    result.afterReload = (await request(api)).description;
    result.reader = await reader.innerText();
    await actor.screenshot({path: join(output, input.id + '-reader.png'), animations:'disabled'});
    await openEditor();
    await expect(paragraph).toContainText('release notes');
    result.reopened = await editor.locator('p').allTextContents();
    result.status = 'observed';
  } catch (error) {
    result.failure = String(error);
    await actor.screenshot({path: join(output, input.id + '-interrupted.png'), timeout:5000}).catch(() => {});
  } finally {
    await context.close();
  }
  return result;
}
