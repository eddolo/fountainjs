import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from '@playwright/test';

const wide = { key:'brief-wide', width:240, height:36, fit:'inside', format:'png' };
const compact = { ...wide, key:'brief-compact', width:120, height:18 };

export async function checkImagePresets({api, collection, selectInterface, openItem, origin, out, report}) {
  const original = await api('/settings');
  const settings = changes => api('/settings',{ method:'PATCH', body:JSON.stringify(changes) });
  const available = [...(original.storage_asset_presets ?? []),wide,compact];
  const bytes = await readFile(new URL('../../tests/fixtures/cross-container-figure.png',import.meta.url));
  const form = new FormData();
  form.append('file',new Blob([bytes],{type:'image/png'}),'publication-figure.png');
  const file = await api('/files',{method:'POST',body:form});
  const src = new URL('/assets/' + file.id + '.png',origin).href;
  const initial = '<p>Publication brief.</p><figure><img src="'+src+'" alt="Weekly counts"><figcaption>Weekly counts</figcaption></figure><p></p>';
  report.imagePresets = { assetId:file.id };
  try {
    for (const side of ['stock','fountain']) {
      const stock = side === 'stock';
      await settings({ storage_asset_presets:available, storage_asset_transform:'presets' });
      await selectInterface(stock ? 'input-rich-text-html' : 'fountain-rich-text-html', {toolbar:['customImage']});
      const {id} = await api('/items/'+collection,{method:'POST',body:JSON.stringify({body:initial})});
      const path = '/items/'+collection+'/'+id;
      const route = '/admin/content/'+collection+'/'+id;
      const result = report.imagePresets[side] = {item:id};
      const edit = async (editorSide = side) => {
        const view = await openItem(editorSide, route);
        const img = view.editor.locator('figure img');
        await img.click();
        const originalField = editorSide === 'stock';
        const imageButton = originalField ? view.page.locator('.wysiwyg .toolbar button:has([data-icon="image"])')
          : view.page.getByRole('button',{name:'Image',exact:true});
        await imageButton.click();
        const drawer = view.page.locator('.v-drawer');
        const stockField = name => drawer.locator('.field').filter({has:view.page.getByText(name,{exact:true})});
        const dim = name => originalField ? stockField(name).getByRole('textbox') : drawer.getByRole('spinbutton',{name,exact:true});
        const preset = originalField ? stockField('Transformation Preset Key').locator('.v-input') : drawer.getByRole('combobox');
        async function choose(key) {
          if (originalField) {
            await preset.click();
            await view.page.locator('.v-menu-content:visible').getByText(key || 'Deselect',{exact:true}).click();
          } else await preset.selectOption(key);
        }
        async function commit(expectedSize,expectedQuery) {
          const before = (await api(path)).body;
          await drawer.getByRole('button',{name:originalField ? 'Save Image' : 'Apply image',exact:true}).click();
          await expect(drawer).toHaveCount(0);
          await expect.poll(async () => {
            const placed = await img.evaluate(el => ({src:el.getAttribute('src'),loaded:el.complete, size:[el.naturalWidth,el.naturalHeight]}));
            const url = new URL(placed.src,origin);
            return [url.pathname, Object.fromEntries(url.searchParams), placed.loaded, placed.size];
          }).toEqual([new URL(src).pathname,expectedQuery,true,expectedSize]);
          assert.equal((await api(path)).body,before);
          await view.page.getByRole('button',{name:'Save',exact:true}).click();
          await expect.poll(async ()=>(await api(path)).body).not.toBe(before);
          const saved = (await api(path)).body;
          await view.context.close();
          return saved;
        }
        return {drawer,dim,preset,choose,commit,stockField};
      };
      const first = await edit();
      report.stage = side + ' choose a named image preset';
      await expect(first.dim('Width')).toHaveCount(0);
      await expect(first.dim('Height')).toHaveCount(0);
      await first.choose(wide.key);
      result.wide = await first.commit([240,36],{key:wide.key});

      const second = await edit();
      report.stage = side + ' change a saved image preset';
      if (stock) await expect(second.preset.locator('input')).toHaveValue(wide.key);
      else await expect(second.preset).toHaveValue(wide.key);
      await second.choose(compact.key);
      result.compact = await second.commit([120,18],{key:compact.key});

      await settings({storage_asset_transform:'all'});
      const all = await edit();
      report.stage = side + ' display preset dimensions after reopening';
      for (const [label,value] of [['Width','120'],['Height','18']]) {
        await expect(all.dim(label)).toBeDisabled();
        await expect(all.dim(label)).toHaveValue(value);
      }
      await all.choose(wide.key);
      await expect(all.dim('Width')).toHaveValue('240');
      await expect(all.dim('Height')).toHaveValue('36');
      await all.drawer.screenshot({path:join(out,side+'-preset.png')});
      await all.choose('');
      await expect(all.dim('Width')).toBeEnabled();
      await expect(all.dim('Width')).toHaveValue('240');
      result.manual = await all.commit([240,36],{width:'240',height:'36'});

      await settings({storage_asset_transform:'none'});
      const plain = await edit();
      report.stage = side + ' edit a caption after project transformations are disabled';
      await expect(plain.preset).toHaveCount(0);
      await expect(plain.dim('Width')).toHaveCount(0);
      const caption = stock ? plain.stockField('Caption').getByRole('textbox') : plain.drawer.getByRole('textbox',{name:'Caption',exact:true});
      await caption.fill('Original image');
      result.original = await plain.commit([400,60],{});

      if (!stock) {
        await settings({storage_asset_transform:'presets'});
        await selectInterface('input-rich-text-html',{toolbar:['customImage']});
        const rollback = await edit('stock');
        report.stage = 'stock edits the same Fountain image after rollback';
        await rollback.choose(compact.key);
        result.rollback = await rollback.commit([120,18],{key:compact.key});
        assert.equal(result.rollback,result.compact.replace('>Weekly counts</figcaption>','>Original image</figcaption>'));
      }
    }
    for (const name of ['wide','compact','manual','original']) assert.equal(report.imagePresets.stock[name],report.imagePresets.fountain[name],name);
  } finally {
    await settings({storage_asset_presets:original.storage_asset_presets,storage_asset_transform:original.storage_asset_transform});
  }
}
