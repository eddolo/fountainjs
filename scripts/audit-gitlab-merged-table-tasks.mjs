import { expect } from '@playwright/test';
import { join } from 'node:path';
import { alignedCheckboxRollbackPassed } from '../integrations/gitlab/testing/checkbox-rollback.mjs';
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
  const items = [];
  for (const input of fixture.cases) items.push(await recoverCheckboxes({page,side,project,request,input,runId,output}));
  return items;
}

function measureCheckboxes(table) {
  return [...table.querySelectorAll('input[type=checkbox]')].map(box => {
    const cell = box.closest('td,th').getBoundingClientRect(), control = box.getBoundingClientRect();
    const center = control.left + control.width / 2 - cell.left;
    return {width:cell.width,center,alignment:center > cell.width * .7 ? 'right' : center < cell.width * .3 ? 'left' : 'center'};
  });
}

async function recoverCheckboxes({page,side,project,request,input,runId,output}) {
  const imageName = name => join(output,(input.alignment ? input.alignment + '-' : '') + name + '.png');
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
    if (input.alignment) item.initialPositions = await table.evaluate(measureCheckboxes);
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
      await page.screenshot({path:imageName('merge-recovery')});
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
    if (input.alignment) item.readerPositions = await reader.evaluate(measureCheckboxes);
    await reader.screenshot({path:imageName('saved-checkboxes')});
    await edit.click();
    const reopened = await openRich(host,side);
    item.reopenedEditorProof = await editorProof(reopened);
    item.reopened = await reopened.locator('table').evaluate(recoveryState);
    if (input.alignment) item.reopenedPositions = await reopened.locator('table').evaluate(measureCheckboxes);
    item.status = 'observed';
  } catch(error) {
    item.failure = String(error);
    await page.screenshot({path:imageName('checkboxes-interrupted')}).catch(()=>{});
  }
  return item;
}

async function inspectStockTable(reader) {
  const table = await reader.evaluate(recoveryState);
  const cells = await reader.evaluate(el => [...el.rows].map(row => [...row.cells].map(cell => ({
    tag:cell.tagName, span:cell.colSpan, rowSpan:cell.rowSpan,
    alignment:cell.style.textAlign || cell.getAttribute('align') || '',
    label:cell.textContent.trim().replace(/\s+/gu,' '),
    states:[...cell.querySelectorAll('input[type=checkbox]')].map(box =>
      box.hasAttribute('data-inapplicable') || box.closest('li.inapplicable') ? 'inapplicable' : box.checked),
  }))));
  return {table,cells};
}

export async function verifyCheckboxRollback({candidate,report,page,project,request,output}) {
  const result = {formatVersion:3,candidateBuild:candidate.buildIdentity.expected,records:[],passed:false};
  report.rollback = result;
  for (const input of report.fixture.cases) for (const writer of [candidate,report]) {
    const item = writer.observations.find(entry => entry.id === input.id);
    const record = {writer:writer.side,case:input.id,iid:item.iid};
    result.records.push(record);
    try {
      const api = '/api/v4/projects/' + project.id + '/issues/' + item.iid;
      const issue = await request(api);
      expect(issue.title).toBe(input.title + ' ' + report.runId + '-a' + report.attempt);
      expect(item.status).toBe('observed');
      record.before = issue.description;
      expect(record.before).toBe(item.savedMarkdown);
      await page.goto(issue.web_url);
      const reader = page.locator('.js-work-item-description table');
      record.beforeReader = await inspectStockTable(reader);
      record.beforePositions = await reader.evaluate(measureCheckboxes);
      const image = stage => join(output,writer.side + '-' + input.alignment + '-rollback-' + stage + '.png');
      await reader.screenshot({path:image('before'),animations:'disabled'});
      const edit = page.getByTestId('work-item-edit-form-button');
      const host = page.getByTestId('work-item-description-wrapper');
      const save = host.getByRole('button',{name:'Save changes',exact:true});
      await edit.click();
      const source = host.locator('textarea[data-testid="markdown-editor-form-field"]');
      const plain = host.getByRole('button',{name:'Switch to plain text editing',exact:true});
      await expect(source.or(plain).first()).toBeVisible();
      if (!await source.isVisible()) await plain.click();
      await expect(source).toHaveValue(record.before);
      await source.focus();
      await page.keyboard.press('Control+End');
      await page.keyboard.insertText(' Markdown follow-up.');
      await expect(source).toHaveValue(record.before + ' Markdown follow-up.');
      await save.click();
      await expect(source).toBeHidden();
      await page.reload();
      record.afterMarkdown = (await request(api)).description;
      record.markdownReader = await inspectStockTable(reader);
      expect(record.afterMarkdown).toBe(record.before + ' Markdown follow-up.');
      await edit.click();
      const editor = await openRich(host,'original');
      record.richEditor = await editorProof(editor);
      record.richDraft = await editor.locator('table').evaluate(recoveryState);
      await editor.getByText('Status: waiting. Reviewed. Markdown follow-up.',{exact:true}).click();
      await page.keyboard.press('End');
      await page.keyboard.insertText(' Rich follow-up.');
      await expect(editor).toContainText('Markdown follow-up. Rich follow-up.');
      await save.click();
      await expect(editor).toBeHidden();
      await page.reload();
      record.afterRich = (await request(api)).description;
      record.richReader = await inspectStockTable(reader);
      record.afterPositions = await reader.evaluate(measureCheckboxes);
      await reader.screenshot({path:image('after'),animations:'disabled'});
      await edit.click();
      const reopened = await openRich(host,'original');
      record.reopened = await reopened.locator('table').evaluate(recoveryState);
    } catch (error) {
      record.failure = String(error);
    }
  }
  result.passed = alignedCheckboxRollbackPassed(candidate,report);
  return result;
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
