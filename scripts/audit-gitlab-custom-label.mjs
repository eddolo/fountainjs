import { expect } from '@playwright/test';
import { join } from 'node:path';
import { editorProof, openRich } from './gitlab-audit-editor.mjs';

export async function runCustomLabel({page, project, side, request, fixture, runId, output}) {
  const [input] = fixture.cases;
  const item = {id:input.id, input, status:'incomplete', stage:'seed'};
  try {
    const projectAPI = '/api/v4/projects/' + project.id;
    const labels = await request(projectAPI + '/labels?search=' + encodeURIComponent(input.label));
    const label = labels.find(record => record.name === input.label)
      ?? await request(projectAPI + '/labels', {name:input.label, color:'#428BCA'});
    item.labelId = label.id;
    const issue = await request(projectAPI + '/issues', {title:input.title + ' ' + runId, description:input.source});
    item.iid = issue.iid;
    const api = projectAPI + '/issues/' + issue.iid;
    await page.goto(issue.web_url);
    const reader = page.locator('.js-work-item-description');
    const readerLabel = reader.locator('a[data-reference-type="label"]');
    await expect(readerLabel).toContainText(input.label);
    item.initialURL = await readerLabel.getAttribute('href');
    const edit = page.getByTestId('work-item-edit-form-button');
    const host = page.getByTestId('work-item-description-wrapper');
    await edit.click();
    const editor = await openRich(host,side);
    item.editorProof = await editorProof(editor);
    const labelNode = root => side === 'fountain' ? root.locator('[data-fountain-custom-label]') : root.getByText(input.label,{exact:true}).last();
    await expect(labelNode(editor)).toBeVisible();
    item.renderedLabel = await labelNode(editor).innerText();
    if (side === 'fountain') item.customToken = await labelNode(editor).getAttribute('data-fountain-custom-label');
    item.stage = 'edit';
    await editor.locator('p').first().click();
    await page.keyboard.press('Home');
    await page.keyboard.insertText(input.edit);
    await expect(editor).toContainText(input.edit.trim());
    await page.keyboard.press('Control+z');
    await expect(editor).not.toContainText(input.edit.trim());
    item.undone = await labelNode(editor).isVisible();
    await page.keyboard.press('Control+Shift+z');
    await expect(editor).toContainText(input.edit.trim());
    item.redone = await labelNode(editor).isVisible();
    const shortcut = root => root.locator(side === 'fountain' ? 'kbd[data-fountain-custom-shortcut]' : 'kbd');
    const key = shortcut(editor);
    await expect(key).toHaveText(input.shortcut);
    await key.scrollIntoViewIfNeeded();
    const point = await key.evaluate(el => {
      const range = document.createRange();
      range.setStart(el.firstChild, 0);
      range.setEnd(el.firstChild, 1);
      const rect = range.getBoundingClientRect();
      return {x:rect.right - 0.25, y:rect.top + rect.height / 2};
    });
    await page.mouse.click(point.x, point.y);
    const caret = await key.evaluate(el => {
      const selection = el.ownerDocument.getSelection();
      return {inside:el.contains(selection.anchorNode), offset:selection.anchorOffset, collapsed:selection.isCollapsed};
    });
    item.shortcutCaret = caret;
    expect(caret).toEqual({inside:true, offset:1, collapsed:true});
    await page.keyboard.insertText('1');
    await expect(key).toHaveText(input.updatedShortcut);
    await page.keyboard.press('Control+z');
    await expect(key).toHaveText(input.shortcut);
    item.shortcutUndo = await key.innerText();
    await page.keyboard.press('Control+Shift+z');
    await expect(key).toHaveText(input.updatedShortcut);
    item.shortcutRedo = await key.innerText();
    await expect.poll(() => page.evaluate(id => localStorage.getItem('autosave/gid://gitlab/WorkItem/' + id), issue.id)).toContain('<kbd>' + input.updatedShortcut + '</kbd>');
    await editor.screenshot({path:join(output,'edited-label.png')});
    item.stage = 'save';
    await host.getByRole('button',{name:'Save changes',exact:true}).click();
    await expect.poll(async () => (await request(api)).description).toContain(input.edit.trim());
    item.saved = (await request(api)).description;
    await page.reload();
    await expect(readerLabel).toContainText(input.label);
    item.readerURL = await readerLabel.getAttribute('href');
    item.readerShortcut = await reader.locator('kbd').innerText();
    await edit.click();
    const reopened = await openRich(host,side);
    item.reopenedEditorProof = await editorProof(reopened);
    await expect(labelNode(reopened)).toBeVisible();
    item.reopened = await labelNode(reopened).innerText();
    item.reopenedShortcut = await shortcut(reopened).innerText();
    if (side === 'fountain') item.reopenedToken = await labelNode(reopened).getAttribute('data-fountain-custom-label');
    await host.getByRole('button',{name:'Switch to plain text editing',exact:true}).click();
    item.reopenedSource = await host.locator('textarea[data-testid="markdown-editor-form-field"]').inputValue();
    item.status = 'observed';
    item.stage = 'complete';
  } catch (error) {
    item.failure = String(error);
    item.controls = await page.getByTestId('work-item-description-wrapper').ariaSnapshot().catch(() => '');
    await page.screenshot({path:join(output,'interrupted.png')}).catch(() => {});
  }
  return [item];
}
