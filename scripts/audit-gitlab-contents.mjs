import { expect } from '@playwright/test';
import { join } from 'node:path';
import { editorProof, openRich } from './gitlab-audit-editor.mjs';

export async function runContents({ page, side, project, request, fixture, runId, output }) {
  const [input] = fixture.cases;
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
