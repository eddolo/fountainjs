import { expect } from '@playwright/test';
import { join } from 'node:path';
import { editorProof, openRich } from './gitlab-audit-editor.mjs';

async function drafts(actor, url) {
  const response = await actor.request.get(url);
  expect(response.status()).toBe(200);
  return response.json();
}

const initialSource = input => input.prefix + '**' + input.bold + '**.\n\n' + input.followup;
const richText = input => [input.prefix + input.bold + '.', input.followup];
const draftBody = input => '**' + input.reviewText + '**';

export async function leavePendingReview({actor, request, project, input, result, output}) {
  expect(result.facts.updatedSource).toBe(initialSource(input));
  expect(result.facts.finalReader).toEqual({paragraphs:richText(input), bold:[input.bold]});
  expect(result.facts.submission && result.facts.singleRecord && result.facts.headPreserved).toBe(true);
  const path = '/api/v4/projects/' + project.id + '/merge_requests/' + result.iid;
  const url = new URL(path + '/draft_notes', project.web_url).href;
  expect(await drafts(actor, url)).toEqual([]);
  const form = actor.locator('form.new-note');
  const editor = await openRich(form, 'fountain');
  result.reviewEditorProof = await editorProof(editor);
  expect(result.reviewEditorProof.native).toBe(true);
  await editor.click();
  await actor.keyboard.press('Control+b');
  await actor.keyboard.insertText(input.reviewText);
  await actor.keyboard.press('Control+b');
  await expect(editor.locator('strong,b')).toHaveText(input.reviewText);
  await form.getByTestId('start-review-button').click();
  await expect.poll(async () => (await drafts(actor,url)).length, {timeout:30000}).toBe(1);
  const [draft] = await drafts(actor, url);
  expect(draft.author_id).toBe(result.writer.id);
  expect(draft.note).toBe(draftBody(input));
  expect((await request(path + '/notes')).filter(note => !note.system).map(note => note.id)).toEqual([result.controlNoteId]);
  await actor.getByRole('button', {name:/Your review/i}).click();
  const preview = actor.getByTestId('review-preview-item-content');
  await expect(preview.locator('strong,b')).toHaveText(input.reviewText);
  await preview.screenshot({path:join(output,'pending-before-rollback.png')});
  result.pending = {id:draft.id, authorId:draft.author_id, source:draft.note, publicNoteId:result.controlNoteId};
}

export async function finishPendingReview({actor, request, project, input, result, candidate, output}) {
  const receipt = candidate.observations[0];
  expect(receipt.id).toBe(input.id);
  expect(receipt.status).toBe('observed');
  expect(receipt.writer).toEqual(result.writer);
  expect(receipt.reviewEditorProof?.native).toBe(true);
  expect(receipt.pending?.source).toBe(draftBody(input));
  expect(receipt.pending.authorId).toBe(result.writer.id);
  expect(receipt.facts.updatedSource).toBe(initialSource(input));
  const iid = receipt.iid;
  expect(Number.isSafeInteger(iid) && iid > 0).toBe(true);
  const path = '/api/v4/projects/' + project.id + '/merge_requests/' + iid;
  const mr = await request(path);
  expect([mr.title,mr.source_branch,mr.sha,mr.author.id,mr.description]).toEqual(
    [input.title,receipt.setup.branch,receipt.setup.sha,result.writer.id,initialSource(input)]);
  result.iid = iid;
  const notes = async () => (await request(path + '/notes')).filter(note => !note.system);
  expect((await notes()).map(note => [note.id,note.body])).toEqual([[receipt.controlNoteId,input.discussionControl]]);
  const url = new URL(path + '/draft_notes', project.web_url).href;
  const pending = await drafts(actor,url);
  expect(pending.map(draft => [draft.id,draft.author_id,draft.note])).toEqual([[receipt.pending.id,result.writer.id,draftBody(input)]]);
  await actor.goto(mr.web_url);
  await actor.getByRole('link', {name:'Edit merge request',exact:true}).click();
  const form = actor.locator('form.merge-request-form');
  const stock = await openRich(form,'original');
  result.editorProof = await editorProof(stock);
  expect(result.editorProof.native).toBe(false);
  await expect(stock.locator('p')).toHaveText(richText(input));
  await expect(stock.locator('strong,b')).toHaveText(input.bold);
  await stock.screenshot({path:join(output,'reopened-on-stock.png')});
  await form.getByRole('button',{name:'Switch to plain text editing',exact:true}).click();
  const source = form.locator('textarea:visible');
  await expect(source).toHaveCount(1);
  await expect(source).toHaveValue(initialSource(input));
  const updated = initialSource(input) + '\n\n' + input.afterRollback;
  await source.fill(updated);
  await form.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(actor).toHaveURL(mr.web_url);
  await actor.getByRole('button',{name:/Your review/i}).click();
  const preview = actor.getByTestId('review-preview-item-content');
  await expect(preview.locator('strong,b')).toHaveText(input.reviewText);
  const review = actor.getByTestId('submit-gl-form');
  await expect(review.getByRole('radio',{name:/^Comment\b/i})).toBeChecked();
  await review.getByRole('button',{name:'Submit review',exact:true}).click();
  await expect.poll(async () => (await notes()).filter(note => note.body === draftBody(input)).length,{timeout:30000}).toBe(1);
  await actor.reload();
  const saved = await request(path);
  expect([saved.iid,saved.sha,saved.author.id,saved.description]).toEqual([iid,receipt.setup.sha,result.writer.id,updated]);
  const reader = actor.locator('.description .md').first();
  await expect(reader.locator('p')).toHaveText([...richText(input),input.afterRollback]);
  await expect(reader.locator('strong,b')).toHaveText(input.bold);
  const publicNotes = await notes();
  expect(publicNotes).toHaveLength(2);
  expect(publicNotes.some(note => note.id === receipt.controlNoteId && note.body === input.discussionControl)).toBe(true);
  const posted = publicNotes.find(note => note.body === draftBody(input));
  expect(posted?.author.id).toBe(result.writer.id);
  const postedReader = actor.locator('#note_' + posted.id + ' .note-text');
  await expect(postedReader.locator('strong,b')).toHaveText(input.reviewText);
  const remaining = await drafts(actor,url);
  expect(remaining).toEqual([]);
  await postedReader.screenshot({path:join(output,'posted-after-rollback.png')});
  result.handover = {iid, draftId:receipt.pending.id, postedNoteId:posted.id, publicNoteId:receipt.controlNoteId,
    savedDescription:saved.description, postedMarkdown:posted.body, authorId:posted.author.id, remainingDrafts:remaining.length, head:saved.sha};
}
