import { expect } from '@playwright/test';
import { join } from 'node:path';
import { editorProof, openRich } from './gitlab-audit-editor.mjs';

export async function runFootnoteLabels({page, side, project, request, fixture, runId, output, mrHandoverFrom}) {
  const [input] = fixture.cases;
  if (mrHandoverFrom) return [await reopenFootnotesInMarkdown({page, project, request, input, output}, mrHandoverFrom.observations[0])];
  const item = {id:input.id, input, status:'incomplete', stage:'seed'};
  try {
    const api = '/api/v4/projects/' + project.id + '/issues';
    const issue = await request(api, {title:input.title + ' ' + runId, description:input.source});
    item.iid = issue.iid;
    item.initial = (await request(api + '/' + issue.iid)).description;
    await page.goto(issue.web_url);
    const host = page.getByTestId('work-item-description-wrapper');
    const edit = page.getByTestId('work-item-edit-form-button');
    await edit.click();
    const editor = await openRich(host, side);
    item.editorProof = await editorProof(editor);
    item.stage = 'edit';
    const paragraph = editor.locator('p').filter({hasText:input.intro}).first();
    await paragraph.click();
    await page.keyboard.press('Home');
    await page.keyboard.insertText(input.edit);
    await expect(paragraph).toContainText(input.edit + input.intro);
    item.edited = await paragraph.innerText();
    await expect.poll(() => page.evaluate(id => localStorage.getItem('autosave/gid://gitlab/WorkItem/' + id), issue.id)).toContain(input.edit);
    item.stage = 'save';
    await host.getByRole('button',{name:'Save changes',exact:true}).click();
    await expect.poll(async () => (await request(api + '/' + issue.iid)).description).toContain(input.edit);
    item.saved = (await request(api + '/' + issue.iid)).description;
    await page.reload();
    const reader = page.locator('.js-work-item-description');
    await expect(reader).toContainText(input.intro);
    item.reader = await reader.innerText();
    item.referenceResolves = await reader.evaluate(root => {
      const link = root.querySelector('a[data-footnote-ref]');
      const note = link && document.getElementById(link.hash.slice(1));
      return Boolean(note && root.contains(note) && note.textContent.includes('Approved by Engineering.'));
    });
    await reader.screenshot({path:join(output,'saved-reader.png')});
    await edit.click();
    const reopened = await openRich(host,side);
    item.reopenedEditorProof = await editorProof(reopened);
    await expect(reopened).toContainText(input.intro);
    await reopened.screenshot({path:join(output,'reopened-editor.png')});
    await host.getByRole('button',{name:'Switch to plain text editing',exact:true}).click();
    const textarea = host.getByTestId('markdown-editor-form-field');
    await expect(textarea).toBeVisible();
    item.sourceOnReopen = await textarea.inputValue();
    item.status = 'observed';
    item.stage = 'complete';
  } catch (error) {
    item.failure = String(error);
    item.controls = await page.getByTestId('work-item-description-wrapper').ariaSnapshot().catch(() => '');
    await page.screenshot({path:join(output,'interrupted.png')}).catch(() => {});
  }
  return [item];
}

async function reopenFootnotesInMarkdown({page, project, request, input, output}, previous) {
  const item = {id:input.id, input, iid:previous.iid, status:'incomplete', stage:'stock-reader'};
  try {
    const api = '/api/v4/projects/' + project.id + '/issues/' + previous.iid;
    const issue = await request(api);
    expect(issue.project_id).toBe(project.id);
    expect(issue.description).toBe(input.edit + input.source);
    expect(issue.description).toBe(previous.saved);
    item.before = issue.description;
    await page.goto(issue.web_url);
    const host = page.getByTestId('work-item-description-wrapper');
    const edit = page.getByTestId('work-item-edit-form-button');
    const source = host.locator('textarea[data-testid="markdown-editor-form-field"]');
    const toggle = host.getByRole('button',{name:'Switch to plain text editing',exact:true});
    async function openMarkdown() {
      await edit.click();
      await expect(source.or(toggle).first()).toBeVisible();
      if (!await source.isVisible()) await toggle.click();
      await expect(source).toBeVisible();
      return source.inputValue();
    }
    item.stage = 'first-markdown-edit';
    item.openedSource = await openMarkdown();
    expect(item.openedSource).toBe(item.before);
    await source.focus();
    await page.keyboard.press('Control+End');
    await source.press('Enter');
    await source.press('Enter');
    const addition = 'Archive verified.';
    await page.keyboard.insertText(addition);
    const expected = item.before + '\n\n' + addition;
    await expect(source).toHaveValue(expected);
    await host.getByRole('button',{name:'Save changes',exact:true}).click();
    await expect.poll(async () => (await request(api)).description).toBe(expected);
    item.saved = (await request(api)).description;
    await page.reload();
    const reader = page.locator('.js-work-item-description');
    await expect(reader).toContainText(addition);
    await expect(reader).toContainText('Approved by Engineering.');
    item.stage = 'reopen';
    item.reopened = await openMarkdown();
    expect(item.reopened).toBe(expected);
    await source.screenshot({path:join(output,'rollback-source.png')});
    item.status = 'observed';
    item.stage = 'complete';
  } catch (error) {
    item.failure = String(error);
    await page.screenshot({path:join(output,'interrupted.png')}).catch(() => {});
  }
  return item;
}
