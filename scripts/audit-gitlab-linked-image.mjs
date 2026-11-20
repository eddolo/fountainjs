import { expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { editorProof, openRich } from './gitlab-audit-editor.mjs';

function imageValues(img) {
  return {alt:img.alt,src:img.getAttribute('data-src') || img.getAttribute('src'),
    target:img.closest('a')?.getAttribute('href'),loaded:img.complete && img.naturalWidth > 0};
}

export async function runLinkedImage({page,side,project,request,fixture,runId,output}) {
  const [input] = fixture.cases;
  const item = {id:input.id,input,stage:'fixture',status:'incomplete'};
  try {
    await page.goto(project.web_url);
    const asset = await page.locator('link[rel~="icon"]').first().evaluate(el=>el.href);
    expect(new URL(asset).origin).toBe(new URL(project.web_url).origin);
    const bytes = await page.request.get(asset);
    expect(bytes.ok()).toBe(true);
    expect(bytes.headers()['content-type']).toMatch(/^image\//u);
    item.asset = asset;
    item.assetSHA256 = createHash('sha256').update(await bytes.body()).digest('hex');
    const target = project.web_url + '/-/issues';
    item.target = target;
    const source = input.intro + '\n\n[![' + input.alt + '](' + asset + ')](' + target + ')\n\n' + input.end;
    const issues = '/api/v4/projects/' + project.id + '/issues';
    const issue = await request(issues,{title:input.title+' '+runId,description:source});
    item.iid = issue.iid;
    const api = issues + '/' + issue.iid;
    await page.goto(issue.web_url);
    const reader = page.locator('.js-work-item-description');
    const original = reader.getByRole('img',{name:input.alt,exact:true});
    await expect(original).toBeVisible();
    item.carriers = await original.evaluate(img=>({image:img.getAttribute('data-canonical-src'),
      link:img.closest('a')?.getAttribute('data-canonical-src'),position:img.getAttribute('data-sourcepos')}));
    const host = page.getByTestId('work-item-description-wrapper');
    const edit = page.getByTestId('work-item-edit-form-button');
    await edit.click();
    const editor = await openRich(host,side);
    item.editorProof = await editorProof(editor);
    const image = editor.getByRole('img',{name:input.alt,exact:true});
    await expect(image).toBeVisible();
    item.stage = 'properties';
    await image.click();
    if (side === 'fountain') {
      await page.getByRole('button',{name:'Edit media properties',exact:true}).click();
      const dialog = page.getByRole('dialog',{name:'Media properties',exact:true});
      item.propertyURL = await dialog.getByRole('textbox',{name:'Media URL',exact:true}).inputValue();
      await dialog.getByRole('textbox',{name:'Media description',exact:true}).fill(input.updated);
      await dialog.getByRole('button',{name:'Apply media changes',exact:true}).click();
    } else {
      await page.getByTestId('edit-media').click();
      item.propertyURL = await page.getByTestId('media-src').inputValue();
      await page.getByTestId('media-alt').fill(input.updated);
      await page.getByRole('button',{name:'Apply',exact:true}).click();
    }
    const updated = editor.getByRole('img',{name:input.updated,exact:true});
    await expect(updated).toBeVisible();
    item.edited = await updated.evaluate(imageValues);
    await editor.focus();
    await page.keyboard.press('Control+z');
    await expect(image).toBeVisible();
    item.undone = await image.evaluate(imageValues);
    await page.keyboard.press('Control+Shift+z');
    await expect(updated).toBeVisible();
    item.redone = await updated.evaluate(imageValues);
    item.stage = 'save';
    await expect.poll(() => page.evaluate(id=>localStorage.getItem('autosave/gid://gitlab/WorkItem/'+id),issue.id)).toContain(input.updated);
    await host.getByRole('button',{name:'Save changes',exact:true}).click();
    await expect.poll(async ()=>(await request(api)).description).toContain(input.updated);
    item.saved = (await request(api)).description;
    await page.reload();
    const shown = reader.getByRole('img',{name:input.updated,exact:true});
    await expect(shown).toBeVisible();
    await expect.poll(()=>shown.evaluate(img=>img.complete && img.naturalWidth>0)).toBe(true);
    item.reader = await shown.evaluate(imageValues);
    await reader.screenshot({path:join(output,'saved-figure.png')});
    await edit.click();
    const reopened = await openRich(host,side);
    item.reopenedEditorProof = await editorProof(reopened);
    const figure = reopened.getByRole('img',{name:input.updated,exact:true});
    await expect(figure).toBeVisible();
    item.reopened = await figure.evaluate(imageValues);
    await reopened.screenshot({path:join(output,'reopened-figure.png')});
    item.stage = 'complete';
    item.status = 'observed';
  } catch (error) {
    item.failure = String(error);
    item.controls = await page.getByTestId('work-item-description-wrapper').ariaSnapshot().catch(()=>'');
    await page.screenshot({path:join(output,'interrupted.png')}).catch(()=>{});
  }
  return [item];
}
