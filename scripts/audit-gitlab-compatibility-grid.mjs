import {expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

export const tableClipboardGraph=root=>{
 const tables=[...root.querySelectorAll('table')].map(table=>[...table.rows].map(row=>[...row.cells].map(cell=>({tag:cell.tagName,rowspan:cell.rowSpan,colspan:cell.colSpan,
  paragraphs:[...cell.querySelectorAll('p')].map(node=>node.textContent),bold:[...cell.querySelectorAll('strong,b')].map(node=>node.textContent),
  links:[...cell.querySelectorAll('a[href]')].map(node=>({text:node.textContent,href:node.getAttribute('href')}))}))));
 return {headings:[...root.querySelectorAll('h2')].map(node=>node.textContent),prose:[...root.querySelectorAll('p')].filter(node=>!node.closest('table')).map(node=>node.textContent).filter(text=>text!==''),tables};
};
async function selectCells({page,editor,source,input,fixture,output,phase}){
 const cell=([row,column])=>source.locator('tr').nth(row).locator('th,td').nth(column);
 const anchor=cell(input.anchor),head=cell(input.head);
 await source.scrollIntoViewIfNeeded();await expect(source).toBeInViewport({ratio:1});
 await anchor.locator('p').click();
 await expect.poll(()=>anchor.evaluate(node=>{const s=window.getSelection();return Boolean(s?.isCollapsed&&s.anchorNode&&node.contains(s.anchorNode));})).toBe(true);
 let outside,before;
 if(input.paintControl){outside=cell(input.paintControl).locator('p');await page.evaluate(()=>document.fonts.ready);before=await outside.screenshot({caret:'hide',animations:'disabled'});}
 await head.click({modifiers:['Shift']});await new Promise(resolve=>setTimeout(resolve,fixture.settlingMs));
 const selected=await source.locator('th.selectedCell,td.selectedCell,[data-fountain-selected-cell="true"]').evaluateAll(cells=>cells.map(cell=>[cell.parentElement.rowIndex,cell.cellIndex]));
 expect(selected).toEqual(input.selectedCells);
 const focus=await editor.evaluate(root=>root.contains(document.activeElement));expect(focus).toBe(true);
 const paint={};
 if(outside){const after=await outside.screenshot({caret:'hide',animations:'disabled'}),files={before:input.id+'-'+phase+'-outside-before.png',after:input.id+'-'+phase+'-outside-after.png'};await writeFile(join(output,files.before),before);await writeFile(join(output,files.after),after);paint.outsidePaintUnchanged=Buffer.compare(before,after)===0;paint.outsidePaint={files,beforeSha256:createHash('sha256').update(before).digest('hex'),afterSha256:createHash('sha256').update(after).digest('hex')};}
 return {cells:selected,focused:focus,anchor:input.anchor,head:input.head,...paint};
}
export async function runGitLabGridClipboardCompatibility({side,runId,page,request,project,fixture,output,onProgress}){
 const observations=[],pause=()=>new Promise(resolve=>setTimeout(resolve,fixture.settlingMs));
 for(const input of fixture.cases){
  const result={id:input.id,input,status:'incomplete',stage:'setup',actions:[]};observations.push(result);let external;
  const save=()=>writeFile(join(output,'observations.json'),JSON.stringify(observations,null,2)+'\n');
  const stage=async name=>{result.stage=name;onProgress({side,case:input.id,stage:name});await save();};
  try{
   await stage('setup');const issue=await request(`/api/v4/projects/${project.id}/issues`,{title:input.title+' '+input.id+' '+runId,description:input.markdown});
   const api=`/api/v4/projects/${project.id}/issues/${issue.iid}`;result.setup={iid:issue.iid,url:issue.web_url,description:issue.description};expect(issue.description).toBe(input.markdown);
   await page.goto(issue.web_url);await page.getByTestId('work-item-edit-form-button').click();
   const host=page.getByTestId('work-item-description-wrapper'),switcher=host.getByRole('button',{name:'Switch to rich text editing',exact:true});if(await switcher.isVisible())await switcher.click();
   const editor=host.locator(side==='original'?'.ProseMirror[contenteditable="true"]':'.fountain-editor[contenteditable="true"]');await expect(editor).toBeVisible({timeout:30000});
   await expect(host.locator(side==='original'?'.fountain-editor[contenteditable="true"]':'.ProseMirror[contenteditable="true"]')).toHaveCount(0);
   result.editorProof={native:await host.locator('[data-fountain-integration="native"]').count()>0,className:await editor.getAttribute('class')};
   const graph=()=>editor.evaluate(tableClipboardGraph),source=editor.locator('table').nth(0),destination=editor.locator('table').nth(1);
   const ready=async phase=>{await expect(editor.getByRole('heading',{name:input.initialGraph.headings[0],exact:true})).toBeVisible({timeout:30000});await expect(editor.locator('table')).toHaveCount(2);result.documentReady??={};result.documentReady[phase]=true;};
   const shot=async name=>{for(const [index,table]of [[0,source],[1,destination]]){await table.scrollIntoViewIfNeeded();await expect(table).toBeInViewport({ratio:1});await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});await page.screenshot({path:join(output,input.id+'-'+name+'-'+index+'.png'),caret:'initial',animations:'disabled'});}};
   await ready('initial');await pause();result.initial=await graph();
   await stage('select-copy');await page.evaluate(()=>navigator.clipboard.writeText('Table clipboard compatibility sentinel'));
   result.copySelection=await selectCells({page,editor,source,input,fixture,output,phase:'copy'});await shot('selected');await page.keyboard.press('Control+c');
   result.clipboard=await page.evaluate(async()=>{const items=await navigator.clipboard.read(),read=async type=>{const item=items.find(value=>value.types.includes(type));return item?(await item.getType(type)).text():null;};return {text:await read('text/plain'),html:await read('text/html')};});
   await stage('external-paste');external=await page.context().newPage();await external.setContent('<h1>External cell grid</h1><label>Plain grid<textarea aria-label="External plain grid" rows="5"></textarea></label><div contenteditable="true" role="textbox" aria-label="External rich grid" style="border:1px solid #999;padding:20px"></div>');
   const plain=external.getByRole('textbox',{name:'External plain grid',exact:true});await plain.focus();await external.keyboard.press('Control+v');result.externalPlain=await plain.inputValue();
   const rich=external.getByRole('textbox',{name:'External rich grid',exact:true});await rich.focus();await external.keyboard.press('Control+v');await pause();result.externalRich=await rich.evaluate(tableClipboardGraph);
   await external.screenshot({path:join(output,input.id+'-external.png'),fullPage:true,animations:'disabled'});await external.close();external=null;await page.bringToFront();
   await stage('select-cut');result.cutSelection=await selectCells({page,editor,source,input,fixture,output,phase:'cut'});await page.keyboard.press('Control+x');await pause();result.cut=await graph();result.cutClipboardText=await page.evaluate(()=>navigator.clipboard.readText());await shot('cut');
   await page.keyboard.press('Control+z');await pause();result.cutUndo=await graph();
   await stage('table-paste');const target=destination.locator('tr').nth(input.destination[0]).locator('th,td').nth(input.destination[1]);await target.locator('p').click();
   await expect.poll(()=>target.evaluate(node=>{const s=window.getSelection();return Boolean(s?.isCollapsed&&s.anchorNode&&node.contains(s.anchorNode));})).toBe(true);
   result.destinationReady=await editor.evaluate(root=>root.contains(document.activeElement));result.beforePasteClipboardText=await page.evaluate(()=>navigator.clipboard.readText());
   await page.keyboard.press('Control+v');await pause();result.pasted=await graph();await shot('pasted');
   await page.keyboard.press('Control+z');await pause();result.pasteUndo=await graph();await page.keyboard.press('Control+Shift+z');await pause();result.pasteRedo=await graph();
   result.actions.push('Actual Shift-click cell rectangles, Ctrl+C/X/V and undo/redo; no editor commands, model injection or synthetic clipboard payload.');
   await stage('save-reopen');const submit=page.getByRole('button',{name:'Save changes',exact:true});await submit.scrollIntoViewIfNeeded();result.saveButtonReachable=await submit.evaluate(node=>{const b=node.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return node===hit||node.contains(hit);});await submit.click();
   await expect.poll(async()=>{result.saved=await request(api);return result.saved.description!==input.markdown;},{timeout:30000}).toBe(true);
   await page.reload();await page.getByTestId('work-item-edit-form-button').click();const again=host.getByRole('button',{name:'Switch to rich text editing',exact:true});if(await again.isVisible())await again.click();await expect(editor).toBeVisible();await ready('reopened');await pause();result.reopened=await graph();await shot('reopened');
   result.status='observed';await stage('complete');
  }catch(error){result.error=String(error);await page.screenshot({path:join(output,input.id+'-failure.png'),fullPage:true,caret:'initial',animations:'disabled'}).catch(()=>{});onProgress({side,case:input.id,stage:'incomplete',error:result.error});}
  finally{await external?.close();await save();}
 }
 return observations;
}
