import { expect } from '@playwright/test';
import { join } from 'node:path';
import { editorProof, openRich } from './gitlab-audit-editor.mjs';

function snapshot(table) {
  const cell = table.rows[1].cells[1];
  return {
    spans: [table.rows[0].cells[0].colSpan, table.rows[1].cells[0].rowSpan],
    checks: [...cell.querySelectorAll('input[type="checkbox"]')].map(input => {
      const li = input.closest('li');
      return input.hasAttribute('data-inapplicable') || li?.matches('.inapplicable,[data-inapplicable=true],[data-checked=inapplicable]') ? 'inapplicable' : input.checked;
    }),
    labels: [...cell.querySelectorAll('li')].map(item => {
      const copy = item.cloneNode(true);
      copy.querySelectorAll('button,label,input').forEach(control => control.remove());
      return copy.textContent.trim();
    }),
    paragraphs: [...cell.querySelectorAll('p,[data-fountain-node="paragraph"]')]
      .filter(p => !p.closest('li') && !p.querySelector('p,[data-fountain-node="paragraph"]'))
      .map(p => p.textContent),
    neighbors: [table.rows[0].cells[0], table.rows[1].cells[0], table.rows[2].cells[0]].map(c => c.textContent.trim()),
  };
}

function recoveryState(table) {
  return {
    spans:[...table.rows].map(row => [...row.cells].map(cell => cell.colSpan)),
    states:[...table.querySelectorAll('input[type=checkbox]')].map(box =>
      box.matches('[data-inapplicable]') || box.closest('li')?.matches('.inapplicable,[data-inapplicable=true],[data-checked=inapplicable]') ?
        'inapplicable' : box.checked),
  };
}

export async function runTableCheckboxRecovery({page,side,project,request,fixture,runId,output}) {
  const [input] = fixture.cases;
  const item = {id:input.id,input,status:'incomplete'};
  const api = '/api/v4/projects/' + project.id + '/issues';
  const issue = await request(api,{title:input.title + ' ' + runId,description:input.markdown});
  item.iid = issue.iid;
  try {
    await page.goto(issue.web_url);
    const edit = page.getByTestId('work-item-edit-form-button');
    const host = page.getByTestId('work-item-description-wrapper');
    await edit.click();
    const editor = await openRich(host,side);
    item.editorProof = await editorProof(editor);
    const table = editor.locator('table');
    const save = host.getByRole('button',{name:'Save changes',exact:true});
    const menu = page.getByRole('button',{name:side === 'fountain' ? /Table actions/i : /Select action/i});
    const row = table.locator('tr').nth(1);
    item.before = await table.evaluate(recoveryState);
    await editor.getByText('Status: waiting.',{exact:true}).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Reviewed.');
    // Select the two checkbox cells by their padding, away from the inputs.
    await row.locator('td').nth(1).click({position:{x:3,y:3}});
    await row.locator('td').nth(2).click({position:{x:3,y:3},modifiers:['Shift']});
    await expect(table.locator('.selectedCell,[data-fountain-selected-cell="true"]')).toHaveCount(2);
    await menu.click();
    await page.getByRole('button',{name:/^Merge (?:2 )?cells$/i}).click();
    await expect(row.locator('td')).toHaveCount(2);
    item.merged = await table.evaluate(recoveryState);
    if (side === 'fountain') {
      const error = host.getByTestId('content-editor-error');
      await expect(error).toContainText('Convert table checkboxes to checklist items');
      item.guidance = await error.innerText();
      await page.screenshot({path:join(output,'merge-recovery.png')});
      if (await save.isEnabled()) await save.click();
      await expect(editor).toBeVisible();
      expect((await request(api + '/' + issue.iid)).description).toBe(input.markdown);
      await row.getByText('Backups',{exact:true}).click();
      await menu.click();
      await page.getByRole('button',{name:'Convert table checkboxes to checklist items',exact:true}).click();
      await expect(error).toBeHidden();
      item.converted = await table.evaluate(recoveryState);
      await page.keyboard.press('Control+z');
      await expect(error).toContainText('Convert table checkboxes to checklist items');
      await page.keyboard.press('Control+Shift+z');
      await expect(error).toBeHidden();
      item.redone = await table.evaluate(recoveryState);
    }
    await save.click();
    await expect(editor).toBeHidden({timeout:30000});
    item.savedMarkdown = (await request(api + '/' + issue.iid)).description;
    await page.reload();
    const reader = page.locator('.js-work-item-description table');
    item.reader = await reader.evaluate(recoveryState);
    await reader.screenshot({path:join(output,'saved-checkboxes.png')});
    await edit.click();
    const reopened = await openRich(host,side);
    item.reopenedEditorProof = await editorProof(reopened);
    item.reopened = await reopened.locator('table').evaluate(recoveryState);
    item.status = 'observed';
  } catch(error) {
    item.failure = String(error);
    await page.screenshot({path:join(output,'checkboxes-interrupted.png')}).catch(()=>{});
  }
  return [item];
}

export async function runMergedTableTasks({page,side,project,request,fixture,runId,output}) {
  const [input] = fixture.cases;
  const item = {id:input.id,input,status:'incomplete'};
  const api = '/api/v4/projects/' + project.id + '/issues';
  const issue = await request(api,{title:input.title + ' ' + runId,description:input.markdown});
  item.iid = issue.iid;
  try {
    await page.goto(issue.web_url);
    const edit = page.getByTestId('work-item-edit-form-button');
    const host = page.getByTestId('work-item-description-wrapper');
    await edit.click();
    const editor = await openRich(host,side);
    item.editorProof = await editorProof(editor);
    const table = editor.locator('table');
    const cell = table.locator('tr').nth(1).locator('td').nth(1);
    item.before = await table.evaluate(snapshot);
    await cell.locator('input[type="checkbox"]').first().click();
    await cell.getByText('Keep the receipt.',{exact:true}).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Filed.');
    item.edited = await table.evaluate(snapshot);
    await editor.screenshot({path:join(output,'edited-checklist.png')});
    await host.getByRole('button',{name:'Save changes',exact:true}).click();
    await expect(editor).toBeHidden({timeout:30000});
    item.savedMarkdown = (await request(api + '/' + issue.iid)).description;
    await page.reload();
    const reader = page.locator('.js-work-item-description table');
    item.reader = await reader.evaluate(snapshot);
    await reader.screenshot({path:join(output,'saved-checklist.png')});
    await edit.click();
    const reopened = await openRich(host,side);
    item.reopenedEditorProof = await editorProof(reopened);
    item.reopened = await reopened.locator('table').evaluate(snapshot);
    item.status = 'observed';
  } catch (error) {
    item.failure = String(error);
    await page.screenshot({path:join(output,'checklist-interrupted.png')}).catch(()=>{});
  }
  return [item];
}
