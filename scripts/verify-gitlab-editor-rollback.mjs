import { recordGitLabSave, matchesSaveGesture } from '../integrations/gitlab/testing/save-gesture.mjs';
import { expect } from '@playwright/test';
import { buildIdentityError } from '../integrations/gitlab/testing/build-identity.mjs';

// Pair each candidate-authored record with an independently stock-authored control.
export async function verifyGitLabRollback({ candidate, report, page, project, request, output }) {
  if (candidate.side !== 'fountain' || buildIdentityError(candidate) || buildIdentityError(report) ||
      candidate.runId !== report.runId || candidate.attempt !== report.attempt ||
      !['original','prepared'].includes(report.side) || candidate.suite !== 'composers' || report.suite !== candidate.suite ||
      JSON.stringify(candidate.browser) !== JSON.stringify(report.browser) ||
      JSON.stringify(candidate.harnessHashes) !== JSON.stringify(report.harnessHashes) || candidate.fixtureHash !== report.fixtureHash ||
      !candidate.collectionComplete || candidate.errors?.length !== 0 || candidate.observations.some(item => item.pageErrors?.length) ||
      candidate.backend.project.id !== project.id || candidate.deployment.imageId !== report.deployment.imageId ||
      JSON.stringify(candidate.deployment.backendMounts) !== JSON.stringify(report.deployment.backendMounts)) {
    throw new Error('Rollback requires the matching successful candidate run on the same persistent GitLab volumes.');
  }
  const records = [];
  const richFirst = report.side === 'prepared';
  const result = {formatVersion: 2, firstEditMode: richFirst ? 'rich' : 'markdown', candidateBuild: candidate.buildIdentity.expected, records, passed: false};
  report.rollback = result;
  const subjects = report.fixture.cases.flatMap(input => [candidate, report].map(writer => ({input, writer})));
  for (const {input, writer} of subjects) {
    const item = writer.observations.find(o => o.id === input.id);
    if (item?.status !== 'observed' || !Number.isSafeInteger(item.iid) || item.iid < 1) throw new Error('Missing audit issue.');
    const api = '/api/v4/projects/' + project.id + '/issues/' + item.iid;
    const evidence = {case: input.id, iid: item.iid, writer: writer.side};
    records.push(evidence);
    const issue = await request(api);
    const description = input.description + input.suffix;
    const notes = async () => (await request(api + '/notes')).filter(n => !n.system).map(n => n.body);
    const expectedNotes = ['**' + input.comment + '**'];
    expect(issue.title).toBe(input.title + ' ' + candidate.runId + '-a' + candidate.attempt);
    evidence.before = issue.description;
    evidence.beforeNotes = await notes();
    if (issue.description !== description || JSON.stringify(evidence.beforeNotes) !== JSON.stringify(expectedNotes)) {
      evidence.baselineFailure = 'Saved content differs from the expected rollback fixture';
      evidence.writerPersisted = item.facts.afterSave;
      continue;
    }
    await page.goto(issue.web_url);
    const reader = page.locator('.js-work-item-description');
    const activity = page.getByTestId('detail-layout-activity');
    await expect(reader).toHaveText(description);
    await expect(activity.locator('strong,b').filter({hasText: input.comment}).first()).toBeVisible();
    await page.getByTestId('work-item-edit-form-button').click();
    const form = page.getByTestId('work-item-description-wrapper');
    const source = form.locator('textarea[data-testid="markdown-editor-form-field"]');
    const plain = form.getByRole('button', {name:'Switch to plain text editing', exact:true});
    const save = form.getByRole('button', {name:'Save changes', exact:true});
    let richBaseline = description;
    if (!richFirst) {
      await source.or(plain).first().waitFor({timeout:30000});
      if (!await source.isVisible()) await plain.click();
      await expect(source).toHaveValue(description);
      const firstEdit = description + ' First Markdown save.';
      await source.focus();
      await page.keyboard.press('Control+End');
      await page.keyboard.insertText(' First Markdown save');
      evidence.firstMarkdownGesture = await recordGitLabSave({page, editor:source, button:save, key:'.', pace:'immediate'});
      await expect(source).toBeHidden({timeout:30000});
      await page.reload();
      evidence.firstMarkdownAfterReload = (await request(api)).description;
      await expect(reader).toHaveText(evidence.firstMarkdownAfterReload);
      evidence.firstMarkdownNotes = await notes();
      evidence.firstMarkdownPassed = matchesSaveGesture(evidence.firstMarkdownGesture,'.',firstEdit,'immediate','markdown') &&
        evidence.firstMarkdownAfterReload === firstEdit && JSON.stringify(evidence.firstMarkdownNotes) === JSON.stringify(expectedNotes);
      await page.screenshot({path: output + '/' + writer.side + '-' + input.id + '-first-markdown-save.png', animations:'disabled'});
      await page.getByTestId('work-item-edit-form-button').click();
      richBaseline = evidence.firstMarkdownAfterReload;
    }
    const stock = form.locator('.ProseMirror[contenteditable="true"]');
    const toggle = form.getByRole('button', {name: 'Switch to rich text editing', exact: true});
    await stock.or(toggle).first().waitFor({ timeout: 30000 });
    if (!await stock.isVisible()) await toggle.click();
    await expect(stock).toHaveText(richBaseline);
    await stock.locator('p').click();
    await page.keyboard.press('End');
    const suffix = ' Checked after rollback.';
    const prefix = richBaseline + suffix.slice(0,-1);
    await page.keyboard.insertText(suffix.slice(0,-1));
    await expect(stock).toHaveText(prefix);
    await expect(save).toBeEnabled();
    evidence.gesture = await recordGitLabSave({page,editor:stock,button:save,key:'.',pace:'immediate'});
    evidence.quickSaveMeasured = matchesSaveGesture(evidence.gesture,'.',richBaseline + suffix,'immediate');
    evidence.typed = evidence.gesture.paragraphs?.join('\n');
    try {
      await expect(stock).toBeHidden({timeout: 30000});
    } catch (error) {
      evidence.openDraft = await stock.innerText();
      evidence.formAlerts = await form.getByRole('alert').allTextContents();
      evidence.persistedAfterRefusal = (await request(api)).description;
      await page.screenshot({path: output + '/' + writer.side + '-' + input.id + '-save-still-open.png'});
      throw error;
    }
    evidence.afterSubmit = (await request(api)).description;
    evidence.readerAfterSubmit = await reader.innerText();
    await page.reload();
    await expect(reader).toHaveText(evidence.afterSubmit);
    evidence.quickSaveAfterReload = (await request(api)).description;
    evidence.quickSavePassed = evidence.quickSaveMeasured && evidence.quickSaveAfterReload === richBaseline + suffix;
    if (richFirst) {
      await expect(activity.locator('strong,b').filter({hasText: input.comment}).first()).toBeVisible();
      await page.screenshot({path: output + '/' + writer.side + '-' + input.id + '-first-rich-save.png', animations:'disabled'});
      if (evidence.quickSavePassed) {
        // Delete the persisted final period in a fresh editing session.
        await page.getByTestId('work-item-edit-form-button').click();
        await stock.or(toggle).first().waitFor({timeout:30000});
        if (!await stock.isVisible()) await toggle.click();
        await expect(stock).toHaveText(richBaseline + suffix);
        await stock.locator('p').click();
        // Observe the native caret without changing the editor selection or its timing.
        await stock.evaluate(editor => {
          const caret = () => {
            const selection = editor.ownerDocument.getSelection();
            if (!selection?.rangeCount || !editor.contains(selection.focusNode)) return null;
            const before = editor.ownerDocument.createRange();
            before.selectNodeContents(editor);
            before.setEnd(selection.focusNode, selection.focusOffset);
            return { offset: before.toString().length, collapsed: selection.isCollapsed };
          };
          const positions = { afterClick: caret() };
          window.__rollbackDeletionCaret = positions;
          editor.addEventListener('keyup', event => {
            if (event.key === 'End') positions.afterEnd = caret();
          }, { capture: true });
          editor.addEventListener('keydown', event => {
            if (event.key === 'Backspace') positions.beforeBackspace = caret();
          }, { capture: true });
        });
        await page.keyboard.press('Control+End');
        evidence.deletionGesture = await recordGitLabSave({page, editor:stock, button:save, key:'Backspace', pace:'immediate'});
        evidence.deletionCaret = await page.evaluate(() => window.__rollbackDeletionCaret);
        await expect(stock).toBeHidden({timeout:30000});
        await page.reload();
        evidence.afterDeletion = (await request(api)).description;
        await expect(reader).toHaveText(evidence.afterDeletion);
        evidence.deletionPassed = matchesSaveGesture(evidence.deletionGesture,'Backspace',prefix,'immediate') &&
          evidence.deletionCaret?.beforeBackspace?.collapsed === true &&
          evidence.deletionCaret.beforeBackspace.offset === (richBaseline + suffix).length &&
          evidence.afterDeletion === prefix;
        evidence.deletionSavedAsShown = evidence.deletionGesture.paragraphs?.length === 1 &&
          evidence.deletionGesture.paragraphs[0] === evidence.afterDeletion;
        if (!evidence.deletionPassed) {
          await reader.screenshot({path: output + '/' + writer.side + '-' + input.id + '-unexpected-deletion.png'});
        }
      }
    }
    // Preserve a rapid-save failure and separately exercise an author inspecting
    // Markdown before saving. Both controls use the same stock editor deployment.
    const edit = page.getByTestId('work-item-edit-form-button');
    await edit.click();
    try {
      await source.or(plain).filter({visible:true}).first().waitFor({timeout:30000});
    } catch (error) {
      evidence.reviewedEditForm = {
        editVisible: await edit.isVisible(), richVisible: await stock.isVisible(),
        sourceVisible: await source.isVisible(), switchVisible: await plain.isVisible(),
        alerts: await page.getByRole('alert').allTextContents(), formText: await form.allTextContents(),
      };
      await page.screenshot({path: output + '/' + writer.side + '-' + input.id + '-review-edit-unavailable.png'});
      throw error;
    }
    if (!await source.isVisible()) await plain.click();
    await expect(source).toHaveValue(evidence.afterDeletion ?? evidence.quickSaveAfterReload);
    const reviewed = description + ' Verified in Markdown.';
    await source.fill(reviewed);
    await save.click();
    await expect(source).toBeHidden({timeout:30000});
    await expect(reader).toHaveText(reviewed);
    await page.reload();
    await expect(reader).toHaveText(reviewed);
    await expect(activity.locator('strong,b').filter({hasText: input.comment}).first()).toBeVisible();
    const saved = (await request(api)).description;
    expect(saved).toBe(reviewed);
    const savedNotes = await notes();
    expect(savedNotes).toEqual(expectedNotes);
    await page.screenshot({path: output + '/' + writer.side + '-' + input.id + '-after-rollback.png', animations: 'disabled'});
    Object.assign(evidence, {reviewedSaveAfterReload: saved, notes: savedNotes});
  }
  result.passed = records.every(record => record.quickSavePassed && (richFirst ? record.deletionPassed : record.firstMarkdownPassed));
  return result;
}
