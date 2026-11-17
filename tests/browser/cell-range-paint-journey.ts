import {expect,type Page,type TestInfo} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

export async function cellRangePaintJourney(page:Page,info:TestInfo){
 await page.evaluate(()=>{
  const api=(globalThis as any).fountainBrowserTest;
  api.reopenHTML('<table><thead><tr><th><p>First</p></th><th><p>Second</p></th><th><p>Outside</p></th></tr></thead><tbody><tr><td><p>A</p></td><td><p>B</p></td><td><p>Untouched one</p></td></tr><tr><td><p>C</p></td><td><p>D</p></td><td><p>Untouched two</p></td></tr></tbody></table><p>After the table.</p>');
 });
 const editor=page.getByRole('textbox',{name:'Browser contract editor',exact:true}),table=editor.locator('table');
 const cell=(row:number,column:number)=>table.locator('tr').nth(row).locator('th,td').nth(column);
 const outside=cell(1,2).locator('p'),markers=editor.locator('[data-fountain-selected-cell="true"]');
 await expect(outside).toHaveText('Untouched one');await table.scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);
 const control=await outside.screenshot({caret:'hide',animations:'disabled'});
 // An independent repeat checks that this screenshot region is stable before
 // selection. The same region must not acquire the browser's stray text paint.
 expect(Buffer.compare(control,await outside.screenshot({caret:'hide',animations:'disabled'}))).toBe(0);
 await writeFile(info.outputPath('outside-control.png'),control);
 const verify=async(name:string)=>{
  await expect(markers).toHaveCount(4);
  const actual=await outside.screenshot({caret:'hide',animations:'disabled'});await writeFile(info.outputPath(name+'-outside.png'),actual);
  await table.screenshot({path:info.outputPath(name+'-table.png'),caret:'hide',animations:'disabled'});
  expect(Buffer.compare(control,actual),'Unselected cell must keep its original rendered pixels').toBe(0);
 };
 await cell(1,0).locator('p').click();await cell(2,1).click({modifiers:['Shift']});await verify('pointer');
 await cell(1,0).locator('p').click();await expect(markers).toHaveCount(0);
 await page.keyboard.press('Alt+Shift+ArrowRight');await page.keyboard.press('Alt+Shift+ArrowDown');await verify('keyboard');
 await outside.click();await expect(markers).toHaveCount(0);await page.keyboard.press('Home');
 await page.keyboard.down('Shift');for(let index=0;index<3;index++)await page.keyboard.press('ArrowRight');await page.keyboard.up('Shift');
 await expect.poll(()=>page.evaluate(()=>window.getSelection()?.toString())).toBe('Unt');
 const normal=await outside.screenshot({caret:'hide',animations:'disabled'});await writeFile(info.outputPath('normal-text-selection.png'),normal);
 expect(Buffer.compare(control,normal),'Ordinary text selection must paint again after leaving cell selection').not.toBe(0);
}
