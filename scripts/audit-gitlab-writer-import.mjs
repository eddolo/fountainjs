import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {expect} from '@playwright/test';
import {editorProof,openRich} from './gitlab-audit-editor.mjs';

function tables(root) {
  return [...root.querySelectorAll('table')].map(table => [...table.rows].map(row => [...row.cells].map(cell => ({
    tag:cell.tagName, colspan:cell.colSpan, rowspan:cell.rowSpan, text:cell.querySelector(':scope > p')?.textContent ?? cell.textContent,
    bold:[...cell.querySelectorAll('strong,b')].map(mark => mark.textContent),
    links:[...cell.querySelectorAll('a[href]')].map(link => ({text:link.textContent,href:link.getAttribute('href')})),
  }))));
}

export async function runWriterImport({page,side,project,request,fixture,runId,output,onProgress}) {
  const [input] = fixture.cases;
  const item = {id:input.id,input,status:'incomplete'};
  const stage = name => {item.stage = name; onProgress({side,case:input.id,stage:name});};
  const host = page.getByTestId('work-item-description-wrapper');
  const edit = page.getByTestId('work-item-edit-form-button');
  const issue = await request('/api/v4/projects/' + project.id + '/issues',{title:input.title + ' ' + runId,description:input.markdown});
  item.iid = issue.iid;
  try {
    stage('prepare-editor');
    await page.goto(issue.web_url);
    await edit.click();
    const editor = await openRich(host,side);
    item.editorProof = await editorProof(editor);
    await editor.getByText(input.paragraph,{exact:true}).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    item.initial = await editor.evaluate(tables);
    stage('copy-in-writer');
    const script = fileURLToPath(new URL('./audit-gitlab-writer-paste.py',import.meta.url));
    const process = spawn('/usr/bin/python3',[script,output,'--copy'],{stdio:['pipe','pipe','inherit']});
    const closed = once(process,'close');
    try {
      const lines = createInterface({input:process.stdout});
      for await (const line of lines) {
        item.writer = JSON.parse(line);
        break;
      }
      if (!item.writer) throw new Error('Writer closed before supplying clipboard contents.');
      await page.bringToFront();
      await editor.focus();
      stage('paste-in-gitlab');
      // Capture only the document payload supplied to this real paste event.
      await editor.evaluate(root => root.addEventListener('paste',event => {
        root.dataset.writerClipboard = JSON.stringify({html:event.clipboardData.getData('text/html'),text:event.clipboardData.getData('text/plain')});
      },{capture:true,once:true}));
      await page.keyboard.press('Control+v');
      item.clipboard = JSON.parse(await editor.getAttribute('data-writer-clipboard'));
      await editor.evaluate(root => root.removeAttribute('data-writer-clipboard'));
      await expect(editor).toContainText('Runbook');
    } finally {
      process.stdin.end();
      const [code] = await closed;
      if (code !== 0) throw new Error('Writer exited with code ' + code);
    }
    item.pasted = await editor.evaluate(tables);
    await editor.screenshot({path:join(output,'writer-imported.png')});
    stage('undo-redo');
    await page.keyboard.press('Control+z');
    item.undo = await editor.evaluate(tables);
    await page.keyboard.press('Control+Shift+z');
    item.redo = await editor.evaluate(tables);
    stage('save-reopen');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    const api = '/api/v4/projects/' + project.id + '/issues/' + issue.iid;
    await expect.poll(async () => (await request(api)).description,{timeout:30000}).not.toBe(input.markdown);
    item.savedMarkdown = (await request(api)).description;
    await page.reload();
    const reader = page.locator('.js-work-item-description');
    await expect(reader).toContainText('Runbook');
    item.reader = await reader.evaluate(tables);
    await edit.click();
    const reopened = await openRich(host,side);
    item.reopenedEditorProof = await editorProof(reopened);
    await expect(reopened).toContainText('Runbook');
    item.reopened = await reopened.evaluate(tables);
    item.blockOrder = await reopened.evaluate(root => [...root.querySelectorAll('h2,p,table')]
      .filter(el => el.tagName === 'TABLE' || (!el.closest('table') && el.textContent))
      .map(el => el.tagName === 'TABLE' ? 'TABLE' : el.textContent));
    await reopened.screenshot({path:join(output,'writer-import-reopened.png')});
    item.status = 'observed';
    stage('complete');
  } catch (error) {
    item.failure = String(error);
    await page.screenshot({path:join(output,'writer-import-interrupted.png')}).catch(()=>{});
  }
  return [item];
}
