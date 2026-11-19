import { recordGitLabSave, matchesSaveGesture } from '../integrations/gitlab/testing/save-gesture.mjs';
import { expect } from '@playwright/test';
import { buildIdentityError } from '../integrations/gitlab/testing/build-identity.mjs';

// Pair each candidate-authored record with an independently stock-authored control.
export async function verifyGitLabRollback({ candidate, report, page, project, request, output }) {
  if (candidate.side !== 'fountain' || buildIdentityError(candidate) || buildIdentityError(report) ||
      candidate.runId !== report.runId || candidate.attempt !== report.attempt ||
      candidate.suite !== 'composers' || candidate.fixtureHash !== report.fixtureHash ||
      !candidate.collectionComplete || candidate.errors?.length !== 0 ||
      candidate.backend.project.id !== project.id || candidate.deployment.imageId !== report.deployment.imageId ||
      JSON.stringify(candidate.deployment.backendMounts) !== JSON.stringify(report.deployment.backendMounts)) {
    throw new Error('Rollback requires the matching successful candidate run on the same persistent GitLab volumes.');
  }
  const records = [];
  const result = {candidateBuild: candidate.buildIdentity.expected, records, passed: false};
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
    const stock = form.locator('.ProseMirror[contenteditable="true"]');
    const toggle = form.getByRole('button', {name: 'Switch to rich text editing', exact: true});
    await stock.or(toggle).first().waitFor({ timeout: 30000 });
    if (!await stock.isVisible()) await toggle.click();
    await expect(stock).toHaveText(description);
    await stock.locator('p').click();
    await page.keyboard.press('End');
    const suffix = ' Checked after rollback.';
    const prefix = description + suffix.slice(0,-1);
    await page.keyboard.insertText(suffix.slice(0,-1));
    await expect(stock).toHaveText(prefix);
    const save = form.getByRole('button', { name: 'Save changes', exact: true });
    await expect(save).toBeEnabled();
    evidence.gesture = await recordGitLabSave({page,editor:stock,button:save,key:'.',pace:'immediate'});
    evidence.quickSaveMeasured = matchesSaveGesture(evidence.gesture,'.',description + suffix,'immediate');
    evidence.typed = evidence.gesture.paragraphs?.join('\n');
    await expect(stock).toBeHidden({timeout: 30000});
    evidence.afterSubmit = (await request(api)).description;
    evidence.readerAfterSubmit = await reader.innerText();
    await page.reload();
    await expect(reader).toHaveText(evidence.afterSubmit);
    evidence.quickSaveAfterReload = (await request(api)).description;
    evidence.quickSavePassed = evidence.quickSaveMeasured && evidence.quickSaveAfterReload === description + suffix;
    // Preserve a rapid-save failure and separately exercise an author inspecting
    // Markdown before saving. Both controls use the same stock editor deployment.
    await page.getByTestId('work-item-edit-form-button').click();
    // GitLab reuses the test ID on a container in rich mode.
    const source = form.locator('textarea[data-testid="markdown-editor-form-field"]');
    const plain = form.getByRole('button', {name:'Switch to plain text editing', exact:true});
    await source.or(plain).first().waitFor({timeout:30000});
    if (!await source.isVisible()) await plain.click();
    await expect(source).toHaveValue(evidence.quickSaveAfterReload);
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
  result.passed = records.every(record => record.quickSavePassed);
  return result;
}
