import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from '@playwright/test';

const fileBytes = await readFile(new URL('../../tests/fixtures/cross-container-figure.png', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const source = '<p>Weekly report.</p>';

export async function auditImages({side, collection, api, selectInterface, openItem, out, report, fileId}) {
  const stock = side === 'stock';
  await selectInterface(stock ? 'input-rich-text-html' : 'fountain-rich-text-html', {toolbar:['customImage', 'undo', 'redo']});
  const {id} = await api('/items/' + collection, {method:'POST',body:JSON.stringify({body:source})});
  const path = '/items/' + collection + '/' + id;
  const route = '/admin/content/' + collection + '/' + id;
  const first = await openItem(side, route);
  const toolbar = page => stock ? page.locator('.wysiwyg .toolbar button:has([data-icon="image"])')
    : page.getByRole('button', {name:'Image',exact:true});
  const drawer = page => page.locator('.v-drawer').last();
  const prop = (page, label) => stock ? drawer(page).locator('.field').filter({has:page.getByText(label,{exact:true})}).getByRole('textbox')
    : drawer(page).getByRole(['Width','Height'].includes(label) ? 'spinbutton' : 'textbox',{name:label,exact:true});
  async function apply(page) {
    await drawer(page).getByRole('button',{name:stock ? 'Save Image' : 'Apply image',exact:true}).click();
    await expect(page.locator('.v-drawer')).toHaveCount(0);
  }
  async function loaded(img) {
    await expect.poll(() => img.evaluate(el => el.complete && el.naturalWidth > 0 && el.naturalHeight > 0)).toBe(true);
    return img.evaluate(el => [el.naturalWidth, el.naturalHeight]);
  }
  await first.editor.locator('p').click();
  await first.page.keyboard.press('End');
  await toolbar(first.page).click();
  report.stage = side + ' choose a Directus image file';
  if (!fileId) {
    await drawer(first.page).locator('input[type=file]').setInputFiles({name:'editorial-figure.png', mimeType:'image/png', buffer:fileBytes});
  } else {
    await drawer(first.page).locator('button:has([data-icon="folder_open"])').click();
    await drawer(first.page).getByText('Editorial Figure',{exact:true}).click();
    await drawer(first.page).getByRole('button',{name:'Save',exact:true}).click();
  }
  await expect(prop(first.page, 'Alternative Text')).toHaveValue(/editorial figure/i);
  await prop(first.page,'Alternative Text').fill('Weekly comparison');
  await prop(first.page,'Caption').fill('Figure 1. Weekly results.');
  await prop(first.page,'Width').fill('200');
  await prop(first.page,'Height').fill('30');
  await drawer(first.page).getByText('Enable Lazy Loading',{exact:true}).click();
  const preview = drawer(first.page).locator('img').first();
  const previewDimensions = await loaded(preview);
  await apply(first.page);
  const figure = first.editor.locator('figure');
  await expect(figure.locator('figcaption')).toHaveText('Figure 1. Weekly results.');
  const img = figure.locator('img');
  await expect(img).toHaveAttribute('alt','Weekly comparison');
  await expect(img).toHaveAttribute('loading','lazy');
  const dimensions = await loaded(img);
  const pixelSHA256 = await img.evaluate(async el => {
    const canvas = document.createElement('canvas');
    canvas.width = el.naturalWidth;
    canvas.height = el.naturalHeight;
    const paint = canvas.getContext('2d');
    paint.drawImage(el,0,0);
    const sample = paint.getImageData(0,0,canvas.width,canvas.height);
    const hash = await crypto.subtle.digest('SHA-256',sample.data);
    return Array.from(new Uint8Array(hash),byte => byte.toString(16).padStart(2,'0')).join('');
  });
  const src = new URL(await img.getAttribute('src'),first.page.url());
  const assetId = src.pathname.match(/\/assets\/([0-9a-f-]{36})/i)?.[1];
  assert.ok(assetId);
  if (fileId) assert.equal(assetId,fileId);
  assert.equal(src.origin,new URL(first.page.url()).origin);
  assert.equal(src.searchParams.has('access_token'),false);
  const raw = await first.page.request.get(new URL('assets/' + assetId,src.origin).href);
  assert.equal(raw.status(),200);
  assert.equal(digest(await raw.body()),digest(fileBytes));
  assert.deepEqual(dimensions,[200,30]);
  assert.deepEqual(previewDimensions,[400,60]);
  assert.equal((await api(path)).body,source);
  await first.page.getByRole('button',{name:'Save',exact:true}).click();
  await expect.poll(async ()=>(await api(path)).body).toContain('Figure 1. Weekly results.');
  const inserted = (await api(path)).body;
  await first.context.close();

  const next = await openItem(side,route);
  await loaded(next.editor.locator('figure img'));
  const reopenedFigure = next.editor.locator('figure');
  await reopenedFigure.screenshot({path:join(out,side+'-asset.png')});
  const appearance = await reopenedFigure.evaluate(el => {
    const img = el.querySelector('img'), caption = el.querySelector('figcaption');
    const box = img.getBoundingClientRect();
    return { width:box.width, height:box.height, captionAlignment:getComputedStyle(caption).textAlign,
      captionColor:getComputedStyle(caption).color, cornerRadius:getComputedStyle(img).borderRadius };
  });
  await next.editor.locator('figure img').click();
  await toolbar(next.page).click();
  await expect(prop(next.page,'Alternative Text')).toHaveValue('Weekly comparison');
  await expect(prop(next.page,'Caption')).toHaveValue('Figure 1. Weekly results.');
  await prop(next.page,'Caption').fill('Figure 1. Reviewed results.');
  await apply(next.page);
  await expect(next.editor.locator('figcaption')).toHaveText('Figure 1. Reviewed results.');
  const history = name => stock ? next.page.locator('.wysiwyg .toolbar button:has([data-icon="'+name.toLowerCase()+'"])')
    : next.page.getByRole('button',{name,exact:true});
  await history('Undo').click();
  await expect(next.editor.locator('figcaption')).toHaveText('Figure 1. Weekly results.');
  await history('Redo').click();
  await expect(next.editor.locator('figcaption')).toHaveText('Figure 1. Reviewed results.');
  await next.page.getByRole('button',{name:'Save',exact:true}).click();
  const edited = inserted.replace('Weekly results.', 'Reviewed results.');
  await expect.poll(async ()=>(await api(path)).body).toBe(edited);
  await next.context.close();
  let rollback;
  if (!stock) {
    await selectInterface('input-rich-text-html', {toolbar:['customImage']});
    const restored = await openItem('stock',route);
    await loaded(restored.editor.locator('figure img'));
    await restored.editor.locator('figure img').click();
    await restored.page.locator('.wysiwyg .toolbar button:has([data-icon="image"])').click();
    const caption = drawer(restored.page).locator('.field').filter({has:restored.page.getByText('Caption',{exact:true})}).getByRole('textbox');
    await expect(caption).toHaveValue('Figure 1. Reviewed results.');
    await caption.fill('Figure 1. Published results.');
    await drawer(restored.page).getByRole('button',{name:'Save Image',exact:true}).click();
    await expect(restored.page.locator('.v-drawer')).toHaveCount(0);
    await restored.page.getByRole('button',{name:'Save',exact:true}).click();
    rollback = edited.replace('Reviewed results.', 'Published results.');
    await expect.poll(async ()=>(await api(path)).body).toBe(rollback);
    await restored.context.close();
  }
  return {item:id,assetId,originalSHA256:digest(fileBytes),previewDimensions,dimensions,pixelSHA256,appearance,inserted,edited,rollback};
}
