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
    if (data.has('wiki[content]')) item.submissions.requests.push({stage:item.stage, values:data.getAll('wiki[content]'), restoreVersion:data.get('wiki_restore_version')});
  });
  tab.on('pageerror', e => item.pageErrors.push(e.message));
  const reader = tab.getByTestId('wiki-page-content');
  const edit = tab.getByTestId('wiki-edit-button');
  const form = tab.locator('form.wiki-form');
  const surface = form.locator(side === 'original' ? '.ProseMirror[contenteditable=true]' : '.fountain-editor[contenteditable=true]');
  async function openEditor() {
    await edit.click();
    const toggle = form.getByRole('button', { name: 'Switch to rich text editing', exact: true });
    await surface.or(toggle).first().waitFor();
    if (!await surface.isVisible()) await toggle.click();
    await expect(surface).toBeVisible();
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
    await tab.keyboard.press('End');
    await tab.keyboard.insertText(input.addition);
    item.typed = await paragraph.innerText();
    await form.getByTestId('wiki-submit-button').click();
    const confirm = tab.getByTestId('wiki-confirm-message');
    await expect(reader.or(confirm).first()).toBeVisible();
    if (await confirm.isVisible()) {
      await tab.getByTestId('wiki-message-textbox').fill('Verify deployment checklist');
      await confirm.click();
    }
    await expect(reader).toBeVisible();
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
