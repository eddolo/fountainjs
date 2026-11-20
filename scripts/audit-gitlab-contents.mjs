import { expect } from '@playwright/test';
import { join } from 'node:path';
import { editorProof, openRich } from './gitlab-audit-editor.mjs';

export async function runContents({ page, side, project, request, fixture, runId, output }) {
  const [input] = fixture.cases;
  if (input.scope === 'contents-authoring') return authorContents({page,side,project,request,input,runId,output});
  const item = { id: input.id, input, status: 'incomplete', stage: 'open' };
  const issue = await request('/api/v4/projects/' + project.id + '/issues', { title: input.title + ' ' + runId, description: input.markdown });
  item.iid = issue.iid;
  const api = '/api/v4/projects/' + project.id + '/issues/' + issue.iid;
  try {
    await page.goto(issue.web_url);
    const host = page.getByTestId('work-item-description-wrapper');
    const edit = page.getByTestId('work-item-edit-form-button');
    await edit.click();
    const editor = await openRich(host, side);
    item.editorProof = await editorProof(editor);
    const outline = editor.locator('.table-of-contents');
    await expect(outline).toContainText(input.heading);
    item.outlineBefore = await outline.innerText();
    const heading = editor.locator('h2').filter({hasText:input.heading});
    await heading.click();
    await page.keyboard.press('End');
    await page.keyboard.insertText(input.suffix);
    const revised = input.heading + input.suffix;
    item.stage = 'edit-heading';
    await expect(outline).toContainText(revised);
    item.outlineAfter = await outline.innerText();
    if (side === 'fountain') {
      await outline.getByRole('button',{name:revised,exact:true}).click();
      item.navigatedTo = await editor.evaluate(root => {
        const anchor = root.ownerDocument.getSelection()?.anchorNode;
        return (anchor?.parentElement?.closest('h2') || (anchor?.nodeType === 1 && anchor.closest('h2')))?.textContent;
      });
    }
    await editor.screenshot({path:join(output,'live-outline.png')});
    item.stage = 'save';
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await expect.poll(async () => (await request(api)).description).toContain(revised);
    item.saved = (await request(api)).description;
    await page.reload();
    const reader = page.locator('.js-work-item-description');
    await expect(reader.locator('ul.section-nav')).toContainText(revised);
    item.readerLinks = await reader.locator('ul.section-nav a').allTextContents();
    await edit.click();
    const reopened = await openRich(host, side);
    item.reopenedEditorProof = await editorProof(reopened);
    const reopenedOutline = reopened.locator('.table-of-contents');
    await expect(reopenedOutline).toContainText(revised);
    item.reopened = await reopenedOutline.innerText();
    item.status = 'observed';
    item.stage = 'complete';
  } catch (error) {
    item.failure = String(error);
    item.controls = await page.getByTestId('work-item-description-wrapper').ariaSnapshot().catch(()=>'');
    await page.screenshot({path:join(output,'interrupted.png')}).catch(()=>{});
  }
  return [item];
}

async function authorContents({page, side, project, request, input, runId, output}) {
  const item = {id:input.id, input, status:'incomplete', stage:'blank'};
  const issues = '/api/v4/projects/' + project.id + '/issues';
  const issue = await request(issues,{title:input.title + ' ' + runId, description:''});
  item.iid = issue.iid;
  const api = issues + '/' + issue.iid;
  const directive = /^\s*(?:\[toc\]|\[\[_toc_\]\])\s*$/imu;
  try {
    await page.goto(issue.web_url);
    const host = page.getByTestId('work-item-description-wrapper');
    const edit = page.getByTestId('work-item-edit-form-button');
    const enterEdit = async () => {
      const form = host.getByTestId('markdown-editor-form-field');
      const rich = host.locator('[contenteditable="true"]');
      await expect(edit.or(form).or(rich).first()).toBeVisible();
      if (!await form.isVisible() && !await rich.isVisible()) await edit.click();
      return openRich(host,side);
    };
    const editor = await enterEdit();
    item.editorProof = await editorProof(editor);
    const outline = editor.locator('.table-of-contents');
    item.startedBlank = (await editor.innerText()).trim() === '' && await outline.count() === 0;
    await editor.click();
    item.stage = 'insert';
    if (side === 'original') await host.getByRole('button',{name:/More options/i}).click();
    await host.getByRole('button',{name:/Table of contents/i}).click();
    await expect(outline).toHaveCount(1);
    item.inserted = await outline.count();
    await editor.focus();
    await page.keyboard.press('Control+z');
    await expect(outline).toHaveCount(0);
    item.undone = await outline.count();
    await page.keyboard.press('Control+Shift+z');
    await expect(outline).toHaveCount(1);
    item.redone = await outline.count();
    await editor.screenshot({path:join(output,'inserted-outline.png')});
    item.stage = 'save-outline-only';
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await expect.poll(async () => (await request(api)).description ?? '').toMatch(directive);
    item.emptySaved = (await request(api)).description;
    await page.reload();
    const reopened = await enterEdit();
    item.emptyEditorProof = await editorProof(reopened);
    // The original editor can mount before its asynchronous preview completes.
    // Give both renderers the same chance to show the empty outline.
    const emptyOutline = reopened.locator('.table-of-contents');
    await emptyOutline.waitFor({state:'visible',timeout:5000}).catch(error => {
      if (error.name !== 'TimeoutError') throw error;
    });
    item.emptyReopened = await emptyOutline.count();
    item.stage = 'edit-without-headings';
    await reopened.focus();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText(input.note);
    await expect(reopened).toContainText(input.note);
    // This case measures outline retention after an edit has reached the host.
    // Rapid Save has its own comparison. Wait for this issue’s normal draft writer.
    await expect.poll(() => page.evaluate(id => localStorage.getItem('autosave/gid://gitlab/WorkItem/' + id),issue.id)).toContain(input.note);
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await expect.poll(async () => (await request(api)).description).toContain(input.note);
    item.proseSaved = (await request(api)).description;
    await page.reload();
    await enterEdit();
    item.stage = 'add-heading';
    await host.getByRole('button',{name:'Switch to plain text editing',exact:true}).click();
    const field = host.getByTestId('markdown-editor-form-field');
    await expect(field).toBeVisible();
    item.sourceOnSwitch = await field.inputValue();
    await field.fill(item.sourceOnSwitch + '\n\n## ' + input.heading + '\n\n' + input.body);
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await expect.poll(async () => (await request(api)).description).toContain(input.body);
    item.saved = (await request(api)).description;
    await page.reload();
    const reader = page.locator('.js-work-item-description');
    await expect(reader).toContainText(input.body);
    item.readerLinks = await reader.locator('ul.section-nav a').allTextContents();
    const final = await enterEdit();
    item.reopenedEditorProof = await editorProof(final);
    await expect(final.getByRole('heading',{name:input.heading})).toBeVisible();
    const finalOutline = final.locator('.table-of-contents');
    if (await finalOutline.count()) await expect(finalOutline).toContainText(input.heading);
    item.finalOutline = await finalOutline.allInnerTexts();
    await final.screenshot({path:join(output,'reopened-outline.png')});
    item.stage = 'complete';
    item.status = 'observed';
  } catch (error) {
    item.failure = String(error);
    item.controls = await page.getByTestId('work-item-description-wrapper').ariaSnapshot().catch(()=>'');
    await page.screenshot({path:join(output,'interrupted.png')}).catch(()=>{});
  }
  return [item];
}

