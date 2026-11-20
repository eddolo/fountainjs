import {expect} from '@playwright/test';
import {join} from 'node:path';

const flag = 'wiki_page_history_follow_renames';
const flags = '/api/v4/features';
const readFlag = async request => (await request(flags)).find(entry => entry.name === flag) ?? null;

// Change only the isolated test project's gate and restore its previous state.
export async function observeWikiRenameProfile({input, request, project}, collect) {
  const definition = (await request(flags + '/definitions')).find(entry => entry.name === flag);
  expect(definition?.default_enabled).toBe(false);
  const before = await readFlag(request);
  if (before && before.state !== 'off') throw new Error('The matched wiki run needs the packaged default before collection.');
  if (!input.followRenames) {
    const item = await collect();
    item.renameProfile = {defaultEnabled:false, before, enabled:false, after:await readFlag(request)};
    return item;
  }
  const endpoint = flags + '/' + flag;
  const target = {project:project.path_with_namespace};
  let item;
  try {
    const enabled = await request(endpoint, {...target, value:'true'});
    const actors = enabled.gates.find(gate => gate.key === 'actors');
    expect(actors?.value).toEqual(['Project:' + project.id]);
    item = await collect();
    item.renameProfile = {defaultEnabled:false, before, enabled:true, gate:actors};
  } finally {
    await request(endpoint, {...target, value:'false'});
    const reverted = await readFlag(request);
    if (before === null && reverted?.state === 'off') await request(endpoint, {}, 'DELETE');
    const after = await readFlag(request);
    expect(after).toEqual(before);
    if (item) item.renameProfile.after = after;
  }
  return item;
}

export async function observeWikiRename({item, tab, project, request, api, seed, url, reader, openHistory, openEditor, saveEdit, output}) {
  const {input} = item;
  const table = tab.getByTestId('wiki-history-table');
  const seedRevision = item.before.find(row => row.version === 'v1').sha;
  const oldBookmark = await table.getByRole('link', {name:'v1',exact:true}).getAttribute('href');
  const newSlug = seed.slug + '-moved';
  const newURL = project.web_url + '/-/wikis/' + encodeURIComponent(newSlug);
  const readAt = async (path, revision) => (await request(api + '/' + encodeURIComponent(path) +
    (revision ? '?version=' + revision : ''))).content;
  item.stage = 'rename';
  await tab.goto(url);
  await openEditor();
  const options = tab.getByRole('button',{name:'Edit page options'});
  await options.click();
  await tab.getByTestId('wiki-path-textbox').fill(newSlug);
  await options.click();
  await saveEdit(tab, input.renameMessage);
  await expect(reader.locator('p').last()).toBeVisible();
  item.newSlug = newSlug;
  item.movedToExpectedPath = new URL(tab.url()).pathname === new URL(newURL).pathname;
  item.sourceAfterRename = await readAt(newSlug);
  await tab.goto(url);
  item.oldBookmarkReader = await reader.locator('p').last().innerText();
  item.oldBookmarkRedirect = new URL(tab.url()).pathname === new URL(newURL).pathname;
  await tab.goto(new URL(oldBookmark, url).href);
  item.oldRevisionReader = await reader.locator('p').last().innerText();
  item.oldRevisionSource = await readAt(seed.slug, seedRevision);

  item.stage = 'renamed history';
  await tab.goto(newURL);
  item.renamedHistory = await openHistory();
  await tab.screenshot({path:join(output,input.id + '-history.png')});
  const original = item.renamedHistory.find(row => row.sha === seedRevision);
  item.selectedV1 = Boolean(original);
  if (!original) return;
  await table.getByRole('link',{name:original.version,exact:true}).click();
  item.historyReader = await reader.locator('p').last().innerText();
  item.stage = 'restore at new path';
  await tab.getByTestId('wiki-restore-version-button').click();
  const modal = tab.getByRole('dialog').filter({has:tab.locator('#wiki-restore-version-commit-message')});
  await modal.getByRole('textbox').fill(input.restoreMessage);
  await modal.getByRole('button',{name:'Restore',exact:true}).click();
  await expect(tab.getByTestId('wiki-edit-button')).toBeVisible();
  await tab.goto(newURL);
  item.restoredReader = await reader.locator('p').last().innerText();
  item.restoredSource = await readAt(newSlug);
  item.after = await openHistory();
  item.revisions = [];
  for (const row of item.after) {
    const path = item.before.some(old => old.sha === row.sha) ? seed.slug : newSlug;
    item.revisions.push({sha:row.sha, slug:path, source:await readAt(path, row.sha)});
  }
  await tab.screenshot({path:join(output,input.id + '-restored-history.png')});
}
