import { expect } from '@playwright/test';
import { join } from 'node:path';
import { editorProof, openRich } from './gitlab-audit-editor.mjs';

export async function runContents({ page, side, project, request, fixture, runId, output, mrHandoverFrom }) {
  const [input] = fixture.cases;
  if (input.scope === 'contents-handover' && side === 'original')
    return reopenContentsAfterRollback({page,project,request,input,output,previous:mrHandoverFrom.observations[0]});
  if (['contents-authoring','contents-handover'].includes(input.scope)) return authorContents({page,side,project,request,input,runId,output});
  const item = { id: input.id, input, status: 'incomplete', stage: 'open' };
  const issue = await request('/api/v4/projects/' + project.id + '/issues', { title: input.title + ' ' + runId, description: input.markdown });
  item.iid = issue.iid;
  const api = '/api/v4/projects/' + project.id + '/issues/' + issue.iid;
  if (input.readerPreview) {
    item.previews = [];
    const projectURL = new URL(project.web_url);
    await page.route(url => url.origin === projectURL.origin && url.pathname.startsWith(projectURL.pathname + '/')
      && url.searchParams.has('no_header_anchors'), async route => {
      const req = route.request();
      if (req.method() !== 'POST') return route.continue();
      const url = new URL(req.url());
      url.searchParams.set('no_header_anchors', 'false');
      const response = await route.fetch({url:url.href, maxRedirects:0});
      try {
        const source = req.postDataJSON()?.text;
        if (typeof source === 'string' && source.includes('# Runbook')) {
          const {body} = await response.json();
          item.previews.push({source, status:response.status(), body});
        }
        await route.fulfill({response});
      } finally { await response.dispose(); }
    });
  }
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

async function reopenContentsAfterRollback({page,project,request,input,output,previous}) {
  const item = {id:input.id,input,iid:previous.iid,status:'incomplete',stage:'handover'};
  const api = '/api/v4/projects/' + project.id + '/issues/' + previous.iid;
  const issue = await request(api);
  expect(issue.description).toBe(previous.proseSaved);
  expect(issue.project_id).toBe(project.id);
  try {
    await page.goto(issue.web_url);
    const host = page.getByTestId('work-item-description-wrapper');
    const edit = page.getByTestId('work-item-edit-form-button');
    const reader = page.locator('.js-work-item-description');
    const save = host.getByRole('button',{name:'Save changes',exact:true});
    const source = host.locator('textarea[data-testid="markdown-editor-form-field"]');
    const openSource = async () => {
      await edit.click();
      const toggle = host.getByRole('button',{name:'Switch to plain text editing',exact:true});
      await expect(source.or(toggle).first()).toBeVisible();
      if (!await source.isVisible()) await toggle.click();
      await expect(source).toBeVisible();
    };
    const appendAndSave = async (before, addition) => {
      await openSource();
      await expect(source).toHaveValue(before);
      await source.focus();
      await page.keyboard.press('Control+End');
      await source.press('Enter');
      await source.press('Enter');
      await page.keyboard.insertText(addition);
      const expected = before + '\n\n' + addition;
      await expect(source).toHaveValue(expected);
      await save.click();
      await expect.poll(async () => (await request(api)).description).toBe(expected);
      await page.reload();
      return expected;
    };
    await expect(reader).toContainText(input.note);
    item.initial = issue.description;
    item.stage = 'plain-save-without-headings';
    item.withoutHeading = await appendAndSave(item.initial,input.addition);
    await expect(reader).toContainText(input.addition);
    item.stage = 'plain-save-with-heading';
    item.withHeading = await appendAndSave(item.withoutHeading,'## ' + input.heading);
    const links = reader.locator('ul.section-nav a');
    await expect(links).toHaveText([input.heading]);
    item.readerLinks = await links.allTextContents();
    await edit.click();
    const rich = await openRich(host,'original');
    item.editorProof = await editorProof(rich);
    await expect(rich.locator('.table-of-contents')).toContainText(input.heading);
    await expect(rich).toContainText(input.note);
    await expect(rich).toContainText(input.addition);
    await rich.screenshot({path:join(output,'rollback-outline.png')});
    expect((await request(api)).description).toBe(item.withHeading);
    item.stage = 'complete';
    item.status = 'observed';
  } catch (error) {
    item.failure = String(error);
    await page.screenshot({path:join(output,'rollback-interrupted.png')}).catch(()=>{});
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
    if (input.scope === 'contents-handover') {
      expect(item.emptySaved).toBe('[[_TOC_]]');
      expect(item.proseSaved).toMatch(directive);
      expect(item.proseSaved).toContain(input.note);
      item.stage = 'ready-for-rollback';
      item.status = 'observed';
      return [item];
    }
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

