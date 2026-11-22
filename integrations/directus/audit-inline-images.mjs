import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from '@playwright/test';

const initial = '<p>Reference () <strong>approved</strong>.</p>';
const fileBytes = await readFile(new URL('../../tests/fixtures/cross-container-figure.png', import.meta.url));

export async function checkInlineImages({ api, collection, selectInterface, openItem, out, report }) {
  const form = new FormData();
  form.append('file', new Blob([fileBytes], { type: 'image/png' }), 'inline-legend.png');
  const file = await api('/files', { method: 'POST', body: form });
  const results = report.inlineImages = { assetId: file.id };
  const tools = { toolbar: ['customImage', 'undo', 'redo'] };

  for (const side of ['stock', 'fountain']) {
    await selectInterface(side === 'stock' ? 'input-rich-text-html' : 'fountain-rich-text-html', tools);
    const { id } = await api('/items/' + collection, { method: 'POST', body: JSON.stringify({ body: initial }) });
    const path = '/items/' + collection + '/' + id;
    const route = '/admin/content/' + collection + '/' + id;
    const result = results[side] = { item: id };
    const field = (drawer, name, stock) => stock
      ? drawer.locator('.field').filter({ has: drawer.page().getByText(name, { exact: true }) }).getByRole('textbox')
      : drawer.getByRole(['Width','Height'].includes(name) ? 'spinbutton' : 'textbox', { name, exact: true });
    async function imageDrawer(view, who = side) {
      const stock = who === 'stock';
      const button = stock ? view.page.locator('.wysiwyg .toolbar button:has([data-icon="image"])')
        : view.page.getByRole('button', { name: 'Image', exact: true });
      await button.click();
      const drawer = view.page.locator('.v-drawer').last();
      return {
        drawer,
        inline: drawer.getByText('Show in the line of text', { exact: true }),
        attr: name => field(drawer, name, stock),
        apply: async () => {
          await drawer.getByRole('button', { name: stock ? 'Save Image' : 'Apply image', exact: true }).click();
          await expect(drawer).toHaveCount(0);
        },
      };
    }
    async function save(view, expected) {
      await view.page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect.poll(async () => (await api(path)).body).toBe(expected);
      await view.context.close();
      return expected;
    }

    const first = await openItem(side, route);
    report.stage = side + ' insert an inline image between parentheses';
    await first.editor.locator('p').click();
    await first.page.keyboard.press('Home');
    for (let offset = 0; offset < 'Reference ('.length; offset++) await first.page.keyboard.press('ArrowRight');
    const insert = await imageDrawer(first);
    await insert.drawer.locator('button:has([data-icon="folder_open"])').click();
    await insert.drawer.getByText(file.title, { exact: true }).click();
    await insert.drawer.getByRole('button', { name: 'Save', exact: true }).click();
    await insert.inline.click();
    await expect(insert.attr('Caption')).toBeDisabled();
    await insert.attr('Alternative Text').fill('Legend');
    await insert.attr('Width').fill('40');
    await insert.attr('Height').fill('6');
    await insert.apply();
    const image = first.editor.locator('p img');
    await expect(image).toHaveAttribute('alt', 'Legend');
    await expect.poll(() => image.evaluate(el => [el.naturalWidth, el.naturalHeight])).toEqual([40, 6]);
    const src = new URL(await image.getAttribute('src'), first.page.url());
    assert.equal(src.pathname, '/assets/' + file.id + '.png');
    assert.deepEqual(Object.fromEntries(src.searchParams), { width: '40', height: '6' });
    const tag = '<img src="' + src.href.replaceAll('&','&amp;') + '" alt="Legend">';
    const inserted = initial.replace('()', '(' + tag + ')');
    assert.equal((await api(path)).body, initial);
    result.inserted = await save(first, inserted);

    const next = await openItem(side, route);
    report.stage = side + ' edit a saved inline image';
    const paragraph = next.editor.locator('p');
    await expect(paragraph.locator('strong')).toHaveText('approved');
    await expect(paragraph.locator('img')).toHaveAttribute('alt', 'Legend');
    await paragraph.screenshot({ path: join(out, side + '-inline.png') });
    await paragraph.locator('img').click();
    const change = await imageDrawer(next);
    await expect(change.attr('Alternative Text')).toHaveValue('Legend');
    await expect(change.attr('Caption')).toBeDisabled();
    await change.attr('Alternative Text').fill('Approved legend');
    await change.apply();
    const history = name => side === 'stock' ? next.page.locator('.wysiwyg .toolbar button:has([data-icon="' + name.toLowerCase() + '"])')
      : next.page.getByRole('button', { name, exact: true });
    await history('Undo').click();
    await expect(paragraph.locator('img')).toHaveAttribute('alt', 'Legend');
    await history('Redo').click();
    await expect(paragraph.locator('img')).toHaveAttribute('alt', 'Approved legend');
    result.edited = await save(next, inserted.replace('alt="Legend"', 'alt="Approved legend"'));

    const reposition = await openItem(side, route);
    report.stage = side + ' move the inline image onto its own line';
    await reposition.editor.locator('p img').click();
    const toBlock = await imageDrawer(reposition);
    await toBlock.inline.click();
    await expect(toBlock.attr('Caption')).toBeEnabled();
    await toBlock.apply();
    await expect(reposition.editor.locator(':scope > img')).toHaveCount(1);
    const editedTag = tag.replace('alt="Legend"', 'alt="Approved legend"');
    const blockHTML = '<p>Reference (</p>' + editedTag + '<p>) <strong>approved</strong>.</p>';
    result.block = await save(reposition, blockHTML);

    const unwrapped = await openItem(side, route);
    report.stage = side + ' return a block image to inline editing';
    await unwrapped.editor.locator(':scope > img').click();
    const toInline = await imageDrawer(unwrapped);
    await toInline.inline.click();
    await toInline.apply();
    const inlineHTML = blockHTML.replace(editedTag, '<p>' + editedTag + '</p>');
    result.returnedInline = await save(unwrapped, inlineHTML);

    if (side === 'fountain') {
      await selectInterface('input-rich-text-html', tools);
      const stock = await openItem('stock', route);
      await stock.editor.getByRole('img', { name:'Approved legend', exact:true }).click();
      const restored = await imageDrawer(stock, 'stock');
      await expect(restored.attr('Alternative Text')).toHaveValue('Approved legend');
      await restored.attr('Alternative Text').fill('Published legend');
      await restored.apply();
      result.rollback = await save(stock, result.returnedInline.replace('Approved legend', 'Published legend'));

      // Editing the main figure must preserve an inline illustration in the caption.
      const richCaption = '<figcaption>Key: ' + tag + ' <strong>approved</strong>.</figcaption>';
      const figure = '<figure>' + tag.replace('alt="Legend"', 'alt="Figure"') + richCaption + '</figure><p>End.</p>';
      await selectInterface('fountain-rich-text-html', tools);
      const record = await api('/items/' + collection, { method:'POST', body:JSON.stringify({ body:figure }) });
      const captionView = await openItem('fountain', '/admin/content/' + collection + '/' + record.id);
      report.stage = 'preserve an inline image inside the caption when editing the main figure';
      await captionView.editor.getByRole('img', { name:'Figure', exact:true }).click();
      const main = await imageDrawer(captionView);
      await expect(main.attr('Caption')).toBeDisabled();
      await main.attr('Alternative Text').fill('Reviewed figure');
      await main.apply();
      await captionView.page.getByRole('button', { name:'Save', exact:true }).click();
      const retained = figure.replace('alt="Figure"', 'alt="Reviewed figure"');
      await expect.poll(async () => (await api('/items/' + collection + '/' + record.id)).body).toBe(retained);
      result.retainedCaption = retained;
      await captionView.context.close();
    }
  }
  assert.equal(results.stock.inserted, results.fountain.inserted);
  assert.equal(results.stock.edited, results.fountain.edited);
}
