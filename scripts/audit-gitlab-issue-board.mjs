import { expect } from '@playwright/test';
import { join } from 'node:path';
import { observePage, openRich, editorProof } from './gitlab-audit-editor.mjs';

async function measureDrawer(save, description) {
  const geometry = await save.evaluate(button => {
    const panel = button.closest('.work-item-detail-panel').getBoundingClientRect();
    const rect = button.getBoundingClientRect();
    const footer = button.closest('form').querySelector('[data-testid="content-editor-footer"]');
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      viewportWidth: window.innerWidth, drawerWidth: Math.round(panel.width),
      saveTop: Math.round(rect.top - panel.top),
      saveVisible: rect.top >= Math.max(0, panel.top) && rect.bottom <= Math.min(innerHeight, panel.bottom) &&
        rect.left >= Math.max(0, panel.left) && rect.right <= Math.min(innerWidth, panel.right) && button.contains(hit),
      footerFits: footer ? footer.scrollWidth <= footer.clientWidth + 1 : null,
    };
  });
  const editor = await description.boundingBox();
  return { ...geometry, editorHeight: Math.round(editor.height) };
}

export async function runGitLabBoardCompatibility({ page, request, project, fixture, runId, side, output, onProgress }) {
  const [input] = fixture.cases;
  const result = { id: input.id, input, status: 'incomplete', facts: {}, pageErrors: [] };
  const facts = result.facts;
  const context = await page.context().browser().newContext({
    storageState: await page.context().storageState(), viewport: { width: 1280, height: 900 },
    locale: 'en-US', timezoneId: 'UTC', recordVideo: { dir: output },
  });
  const actor = await context.newPage();
  const boardLink = actor.getByRole('link', { name: 'Issue boards', exact: true });
  const drawer = actor.getByTestId('work-item-detail-panel');
  const title = input.title + ' ' + runId + ' ' + side;
  const stage = name => { result.stage = name; onProgress({ side, case: input.id, stage: name }); };
  async function readDescription(scope) {
    const reader = scope.locator('.js-work-item-description');
    await expect(reader).toBeVisible({ timeout: 30000 });
    return { text: (await reader.innerText()).trim(), bold: await reader.locator('strong,b').allTextContents() };
  }
  async function goToBoard() {
    const destination = new URL(await boardLink.getAttribute('href'), actor.url());
    await boardLink.click();
    await expect(actor).toHaveURL(url => url.origin === destination.origin && url.pathname === destination.pathname);
  }
  try {
    await observePage(actor, result);
    stage('create-on-board');
    await actor.goto(project.web_url + '/-/work_items');
    await goToBoard();
    const column = actor.getByTestId('board-list').filter({ has: actor.getByTestId('new-issue-btn') }).first();
    await column.getByTestId('new-issue-btn').click();
    const form = column.locator('.board-new-issue-form');
    await form.getByLabel('Title', { exact: true }).fill(title);
    await form.getByRole('button', { name: 'Create issue', exact: true }).click();
    const card = column.getByTestId('board-card').filter({ has: actor.getByText(title, { exact: true }) });
    // Record duplicate cards at creation even if the drawer later settles on one issue.
    await expect(card.first()).toBeVisible({ timeout: 30000 });
    const cardNumbers = () => card.evaluateAll(cards => cards.map(item => Number(item.dataset.itemIid)));
    result.cardNumbersOnCreate = await cardNumbers();
    const [iid] = result.cardNumbersOnCreate;
    if (result.cardNumbersOnCreate.some(number => number !== iid)) throw new Error('Ambiguous issue identity on the board.');
    if (!Number.isSafeInteger(iid) || iid < 1) throw new Error('The created card lacks an issue number.');
    result.iid = iid;
    const api = '/api/v4/projects/' + project.id + '/issues/' + iid;
    const issue = await request(api);
    facts.created = issue.iid === iid && issue.title === title && issue.state === 'opened';
    await expect(drawer).toBeVisible({ timeout: 30000 });
    const ref = drawer.getByTestId('work-item-detail-panel-ref-link');
    const issuePath = new URL(await ref.getAttribute('href'), actor.url()).pathname;
    facts.drawerReference = issuePath.startsWith('/' + project.path_with_namespace + '/-/') && issuePath.endsWith('/' + iid);
    stage('edit-description-in-drawer');
    const editButton = drawer.getByTestId('work-item-edit-form-button');
    await expect(editButton).toBeVisible({ timeout: 30000 });
    result.cardNumbersAtDrawerReady = await cardNumbers();
    facts.singleCardAtDrawerReady = result.cardNumbersAtDrawerReady.length === 1 && result.cardNumbersAtDrawerReady[0] === iid;
    await editButton.click();
    const descriptionForm = drawer.getByTestId('work-item-description-wrapper');
    const description = await openRich(descriptionForm, side);
    result.editorProof = await editorProof(description);
    await description.click();
    await actor.keyboard.insertText(input.prefix);
    await actor.keyboard.press('Control+b');
    await actor.keyboard.insertText(input.bold);
    await actor.keyboard.press('Control+b');
    await expect(description.locator('strong,b')).toHaveText(input.bold);
    const save = descriptionForm.getByRole('button', { name: 'Save changes', exact: true });
    result.layout = { desktop: await measureDrawer(save, description) };
    facts.desktopSaveVisible = result.layout.desktop.saveVisible;
    await drawer.screenshot({ path: join(output, 'board-drawer-edit.png'), animations: 'disabled' });
    const desktop = actor.viewportSize();
    await actor.setViewportSize({ width: 390, height: 844 });
    await save.scrollIntoViewIfNeeded();
    result.layout.narrow = await measureDrawer(save, description);
    facts.narrowSaveVisible = result.layout.narrow.saveVisible;
    if (side === 'fountain') {
      const details = descriptionForm.locator('details').filter({ has: actor.getByText('Rich-text editing limits', { exact: true }) });
      const summary = details.locator('summary');
      const text = details.getByText('Use plain text editing for unsupported references, quick actions, and specialized menus.', { exact: true });
      await expect(text).toBeHidden();
      await summary.focus();
      await actor.keyboard.press('Enter');
      await expect(text).toBeVisible();
      result.layout.expanded = await measureDrawer(save, description);
      expect(result.layout.expanded.footerFits).toBe(true);
      await descriptionForm.screenshot({ path: join(output, 'board-limits-narrow.png'), animations: 'disabled' });
      await actor.keyboard.press('Space');
      await expect(text).toBeHidden();
      await expect(summary).toBeFocused();
      result.layout.keyboardDisclosureVerified = true;
    }
    await actor.setViewportSize(desktop);
    await save.click();
    await expect(description).toBeHidden({ timeout: 30000 });
    facts.drawerRead = await readDescription(drawer);
    facts.savedDescription = (await request(api)).description;
    stage('open-full-issue');
    await ref.click();
    await expect(actor).toHaveURL(url => url.pathname === issuePath);
    await expect(drawer).toBeHidden();
    facts.fullPageRead = await readDescription(actor);
    const activity = actor.getByTestId('detail-layout-activity');
    const comment = await openRich(activity, side);
    result.fullEditorProof = await editorProof(comment);
    await comment.click();
    await actor.keyboard.press('Control+b');
    await actor.keyboard.insertText(input.comment);
    await actor.keyboard.press('Control+b');
    await expect(comment.locator('strong,b')).toHaveText(input.comment);
    await activity.getByRole('button', { name: 'Comment', exact: true }).click();
    const notes = async () => (await request(api + '/notes')).filter(note => !note.system).map(note => note.body);
    await expect.poll(notes, { timeout: 30000 }).not.toEqual([]);
    facts.savedComments = await notes();
    stage('reopen-card-after-reload');
    await goToBoard();
    await actor.reload();
    await expect(card).toBeVisible({ timeout: 30000 });
    result.cardNumbersAfterReload = await cardNumbers();
    facts.sameCard = result.cardNumbersAfterReload.length === 1 && result.cardNumbersAfterReload[0] === iid;
    await card.getByTestId('board-card-title-link').click();
    await expect(drawer).toBeVisible();
    facts.reopenedDescription = await readDescription(drawer);
    const note = drawer.locator('.note-text').filter({ hasText: input.comment });
    await expect(note).toBeVisible({ timeout: 30000 });
    facts.reopenedComment = { text: (await note.innerText()).trim(), bold: await note.locator('strong,b').allTextContents() };
    await note.screenshot({ path: join(output, 'board-reopened-comment.png'), animations: 'disabled' });
    await actor.screenshot({ path: join(output, 'board-reopened.png'), animations: 'disabled' });
    result.status = 'observed';
  } catch (error) {
    result.failure = String(error);
    await actor.screenshot({ path: join(output, 'board-interrupted.png'), timeout: 5000 }).catch(() => {});
  } finally {
    await context.close();
  }
  return [result];
}
