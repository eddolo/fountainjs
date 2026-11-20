import { expect } from '@playwright/test';
import { join } from 'node:path';

export async function runWikiHistory({ side, runId, page, request, project, fixture, output }) {
  const observations = [];
  for (const input of fixture.cases) {
    observations.push(await checkWikiPage({ side, runId, page, request, project, input, output }));
  }
  return observations;
}

async function checkWikiPage({ side, runId, page, request, project, input, output }) {
  const item = { id: input.id, input, status: 'incomplete', stage: 'seed' };
  // Wiki slugs are unique. Each build gets its own page with the same starting source.
  const title = input.title + '-' + side + '-' + runId;
  const api = '/api/v4/projects/' + project.id + '/wikis';
  const seed = await request(api, { title, content: input.source, format: 'markdown' });
  const slug = encodeURIComponent(seed.slug);
  const url = project.web_url + '/-/wikis/' + slug;
  const read = async (version) => (await request(api + '/' + slug + (version ? '?version=' + version : ''))).content;
  const actor = await page.context().browser().newContext({
    storageState: await page.context().storageState(), viewport: { width: 1280, height: 900 },
    locale: 'en-US', timezoneId: 'UTC', recordVideo: { dir: output },
  });
  const tab = await actor.newPage();
  item.pageErrors = [];
  item.submissions = { fields: [], requests: [] };
  await tab.exposeFunction('recordWikiContentField', receipt => item.submissions.fields.push(receipt));
  await tab.addInitScript(() => {
    document.addEventListener('formdata', event => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.matches('form.wiki-form,form.wiki-restore-version-form')) return;
      const values = event.formData.getAll('wiki[content]').filter(value => typeof value === 'string');
      void window.recordWikiContentField({form:form.classList.contains('wiki-form') ? 'edit' : 'restore', values});
    }, true);
  });
  tab.on('request', navigation => {
    if (navigation.method() !== 'POST' || !navigation.isNavigationRequest()) return;
    const target = new URL(navigation.url());
    if (target.origin !== new URL(url).origin || target.pathname !== new URL(url).pathname) return;
    const data = new URLSearchParams(navigation.postData() ?? '');
    if (data.has('wiki[content]')) item.submissions.requests.push({stage:item.stage, values:data.getAll('wiki[content]'), restoreVersion:data.get('wiki_restore_version'), richSource:data.get('wiki_rich_source')});
  });
  tab.on('pageerror', e => item.pageErrors.push(e.message));
  const reader = tab.getByTestId('wiki-page-content');
  const edit = tab.getByTestId('wiki-edit-button');
  const form = tab.locator('form.wiki-form');
  const surfaceSelector = side === 'original' ? '.ProseMirror[contenteditable=true]' : '.fountain-editor[contenteditable=true]';
  const surface = form.locator(surfaceSelector);
  async function openEditor(target = tab) {
    await target.getByTestId('wiki-edit-button').click();
    const editor = target.locator('form.wiki-form').locator(surfaceSelector);
    const toggle = target.locator('form.wiki-form').getByRole('button', { name: 'Switch to rich text editing', exact: true });
    await editor.or(toggle).first().waitFor();
    if (!await editor.isVisible()) await toggle.click();
    await expect(editor).toBeVisible();
    return editor;
  }
  async function saveEdit(target, message) {
    await target.getByTestId('wiki-submit-button').click();
    const confirm = target.getByTestId('wiki-confirm-message');
    const content = target.getByTestId('wiki-page-content');
    await expect(content.or(confirm).first()).toBeVisible();
    if (await confirm.isVisible()) {
      await target.getByTestId('wiki-message-textbox').fill(message);
      await confirm.click();
    }
    await expect(content).toBeVisible();
  }
  async function openHistory() {
    const history = tab.getByTestId('page-history-button');
    if (!await history.isVisible()) await tab.getByTestId('wiki-more-dropdown').getByRole('button').first().click();
    await history.click();
    const table = tab.getByTestId('wiki-history-table');
    await expect(table.locator('tbody tr').first()).toBeVisible();
    return table.locator('tbody tr').evaluateAll(rows => rows.map(row => {
      const link = row.cells[0].querySelector('a');
      return { version: link.textContent.trim(), sha: new URL(link.href).searchParams.get('version_id'), message: row.cells[2].innerText.trim() };
    }));
  }
  try {
    item.slug = seed.slug;
    item.initialSource = await read();
    await tab.goto(url);
    item.stage = 'edit';
    await openEditor();
    item.editorProof = await surface.evaluate(el => ({ native: !!el.closest('[data-fountain-integration=native]'), className: el.className }));
    item.mountedContent = await form.locator('input[type=hidden][name="wiki[content]"]').last().inputValue();
    const paragraph = surface.locator('p').filter({ hasText: input.paragraph });
    await paragraph.click();
    if (input.insertBefore) {
      await tab.keyboard.press('Home');
      await tab.keyboard.insertText(input.insertBefore);
      await tab.keyboard.press('Enter');
    }
    await tab.keyboard.press('End');
    await tab.keyboard.insertText(input.addition);
    item.typed = await paragraph.innerText();
    await saveEdit(tab, 'Verify deployment checklist');
    await tab.reload();
    await expect(reader.locator('p').last()).toBeVisible();
    item.editedSource = await read();
    item.editedReader = await reader.locator('p').last().innerText();
    await openEditor();
    item.reopened = await surface.locator('p').filter({hasText: input.paragraph}).innerText();
    await form.getByTestId('wiki-cancel-button').click();
    await expect(reader).toBeVisible();
    item.stage = 'history';
    item.before = await openHistory();
    await tab.getByTestId('wiki-history-table').getByRole('link', {name:'v1',exact:true}).click();
    const restore = tab.getByTestId('wiki-restore-version-button');
    await expect(restore).toBeVisible();
    item.oldReader = await reader.locator('p').last().innerText();
    await restore.click();
    const modal = tab.getByRole('dialog').filter({has:tab.locator('#wiki-restore-version-commit-message')});
    await modal.getByRole('button',{name:'Cancel',exact:true}).click();
    await expect(modal).toBeHidden();
    item.afterCancelSource = await read();
    item.stage = 'restore';
    await restore.click();
    if (input.scope === 'wiki-restore-conflict') {
      item.stage = 'stale restore';
      item.openLock = await modal.locator('[name="wiki[last_commit_sha]"]').inputValue();
      const writer = await actor.newPage();
      writer.on('pageerror', error => item.pageErrors.push(error.message));
      await writer.goto(url);
      const other = await openEditor(writer);
      const line = other.locator('p').filter({ hasText: input.paragraph });
      await line.click();
      await writer.keyboard.press('End');
      await writer.keyboard.insertText(input.competingEdit);
      await saveEdit(writer, input.writerMessage);
      item.writerSource = await read();
      item.writerReader = await writer.getByTestId('wiki-page-content').locator('p').last().innerText();
      await writer.close();
      await modal.getByRole('textbox').fill(input.restoreMessage);
      await Promise.all([
        tab.waitForNavigation({waitUntil:'domcontentloaded'}),
        modal.getByRole('button', {name:'Restore',exact:true}).click(),
      ]);
      const notice = tab.getByText(/Someone edited the page the same time you did/i).first();
      await expect(notice.or(edit).or(form).first()).toBeVisible();
      item.noticeVisible = await notice.isVisible();
      if (item.noticeVisible) item.noticeText = await notice.innerText();
      const latestLink = tab.getByRole('link', {name:/^the page\b/i});
      item.noticeLinksToCurrentPage = false;
      item.reviewedFromNotice = null;
      if (await latestLink.isVisible()) {
        const [latestPage] = await Promise.all([tab.waitForEvent('popup'), latestLink.click()]);
        try {
          await latestPage.getByTestId('wiki-page-content').waitFor();
          item.noticeDestination = latestPage.url();
          item.noticeLinksToCurrentPage = latestPage.url() === url;
          item.reviewedFromNotice = await latestPage.getByTestId('wiki-page-content').locator('p').last().innerText();
        } finally {
          await latestPage.close();
        }
      }
      await tab.screenshot({path:join(output, input.id + '-stale.png')});
      item.afterStale = await read();
      await tab.goto(url);
      item.latestReader = await reader.locator('p').last().innerText();
      item.afterStaleHistory = await openHistory();
      await tab.getByTestId('wiki-history-table').getByRole('link',{name:'v1',exact:true}).click();
      await restore.click();
      item.retryLock = await modal.locator('[name="wiki[last_commit_sha]"]').inputValue();
      item.stage = 'restore';
    }
    await modal.getByRole('textbox').fill(input.restoreMessage);
    await modal.getByRole('button', {name:'Restore',exact:true}).click();
    await expect(edit).toBeVisible({timeout:30000});
    await tab.reload();
    await expect(reader.locator('p').last()).toBeVisible();
    item.restoredSource = await read();
    item.restoredReader = await reader.locator('p').last().innerText();
    item.restoredOwner = await reader.locator('strong').allTextContents();
    await tab.screenshot({path:join(output, input.id + '-restored.png')});
    item.after = await openHistory();
    item.revisions = [];
    for (const row of item.after) {
      if (!/^[a-f0-9]{40}$/.test(row.sha)) throw new Error('Missing wiki revision SHA in history link for ' + row.version);
      item.revisions.push({sha:row.sha, source:await read(row.sha)});
    }
    await tab.screenshot({path:join(output, input.id + '-history.png')});
    item.status = 'observed';
  } catch (error) {
    item.failure = String(error);
    await tab.screenshot({path:join(output, input.id + '-interrupted.png')}).catch(() => {});
  } finally {
    await actor.close();
  }
  return item;
}
