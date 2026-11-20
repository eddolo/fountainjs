import {expect} from '@playwright/test';
import {join} from 'node:path';
import {editorProof, openRich} from './gitlab-audit-editor.mjs';

function tableContents(root) {
  return [...root.querySelectorAll('table')].map(table => [...table.rows].map(row => [...row.cells].map(cell => ({
    tag:cell.tagName, span:cell.colSpan, rows:cell.rowSpan,
    text:cell.innerText.trim().replace(/\s+/gu,' '),
  }))));
}

export async function runTableAuthoring({page,side,project,request,fixture,runId,output,onProgress}) {
  const [input] = fixture.cases;
  const item = {id:input.id,input,status:'incomplete'};
  const stage = name => {item.stage = name; onProgress({side,case:item.id,stage:name});};
  const issue = await request('/api/v4/projects/' + project.id + '/issues',{title:input.title + ' ' + runId,description:input.markdown});
  item.iid = issue.iid;
  try {
    const host = page.getByTestId('work-item-description-wrapper');
    const edit = page.getByTestId('work-item-edit-form-button');
    await page.goto(issue.web_url);
    await edit.click();
    const editor = await openRich(host,side);
    item.editorProof = await editorProof(editor);
    const table = editor.locator('table');
    const cell = (r,c) => table.locator('tr').nth(r).locator('th,td').nth(c);
    const collect = () => editor.evaluate(tableContents);
    // Both editors can repaint a table after the menu click or keypress returns.
    // Keep the actual grid, including an unchanged one when a command has no effect.
    const afterChange = async previous => {
      let grid = await collect();
      const deadline = Date.now() + 3000;
      while (JSON.stringify(grid) === JSON.stringify(previous) && Date.now() < deadline) {
        await editor.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve())));
        grid = await collect();
      }
      return grid;
    };
    const menu = page.getByRole('button',{name:side === 'fountain' ? /Table actions/i : /Select action/i});
    const action = async (label, record = false) => {
      await menu.click();
      const entry = page.getByRole('button',{name:label,exact:typeof label === 'string'});
      if (record) await page.screenshot({path:join(output,'table-actions.png'),animations:'disabled'});
      await entry.click();
    };
    stage('choose-table-size');
    await editor.getByText('Owners and dates.',{exact:true}).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    const picker = host.locator('.content-editor-table-dropdown');
    item.picker = await picker.ariaSnapshot();
    await picker.getByRole('button').first().click();
    const size = page.getByRole('button',{name:'Insert a 2×3 table',exact:true});
    await size.hover();
    await size.click();
    await expect(table.locator('tr')).toHaveCount(2);
    item.created = await collect();
    for (const [r,values] of [input.columns,input.body].entries()) {
      for (const [c,text] of values.entries()) {
        await cell(r,c).click();
        await page.keyboard.insertText(text);
      }
    }
    item.filled = await collect();
    stage('resize-table');
    await cell(1,1).locator('p').click();
    await action('Insert row below',true);
    item.addRow = await afterChange(item.filled);
    await cell(1,2).locator('p').click();
    await action('Insert column right');
    item.addColumn = await afterChange(item.addRow);
    await cell(2,3).click();
    await action('Delete column');
    item.deleteColumn = await afterChange(item.addColumn);
    await cell(2,1).click();
    await action('Delete row');
    item.deleteRow = await afterChange(item.deleteColumn);
    stage('merge-split');
    await cell(0,0).locator('p').click();
    await cell(0,1).click({modifiers:['Shift']});
    await expect(table.locator('.selectedCell,[data-fountain-selected-cell="true"]')).toHaveCount(2);
    await action(/^Merge (?:2 )?cells$/i);
    item.merged = await afterChange(item.deleteRow);
    await cell(0,0).locator('p').first().click();
    await action('Split cell');
    item.split = await afterChange(item.merged);
    stage('delete-undo-redo');
    await cell(1,0).locator('p').click();
    await action('Delete table');
    item.deleted = await afterChange(item.split);
    item.remainingProse = await editor.evaluate(root => root.innerText.trim());
    await editor.focus();
    await page.keyboard.press('Control+z');
    item.undo = await afterChange(item.deleted);
    await page.keyboard.press('Control+Shift+z');
    item.redo = await afterChange(item.undo);
    await page.keyboard.press('Control+z');
    item.beforeSave = await afterChange(item.redo);
    stage('save-reopen');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    const api = '/api/v4/projects/' + project.id + '/issues/' + issue.iid;
    await expect.poll(async () => (await request(api)).description).toContain('Friday');
    item.savedMarkdown = (await request(api)).description;
    await page.reload();
    const reader = page.locator('.js-work-item-description');
    await expect(reader).toContainText('Friday');
    item.reader = await reader.evaluate(tableContents);
    await edit.click();
    const reopened = await openRich(host,side);
    await expect(reopened).toContainText('Friday');
    item.reopenedEditorProof = await editorProof(reopened);
    item.reopened = await reopened.evaluate(tableContents);
    await reopened.screenshot({path:join(output,'table-reopened.png'),animations:'disabled'});
    item.status = 'observed';
    stage('complete');
  } catch(error) {
    item.failure = String(error);
    item.controls = await page.getByTestId('work-item-description-wrapper').ariaSnapshot().catch(() => '');
    await page.screenshot({path:join(output,'table-interrupted.png')}).catch(()=>{});
  }
  return [item];
}
