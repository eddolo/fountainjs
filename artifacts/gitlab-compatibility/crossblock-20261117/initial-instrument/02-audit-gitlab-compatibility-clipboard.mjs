import {expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';

// Rendered semantic content only. No editor model/commands or DOM mutations.
export const clipboardGraph=root=>{
 const text=node=>{const clone=node.cloneNode(true);for(const control of clone.querySelectorAll('button,input'))control.remove();return clone.textContent.trim();};
 const all=selector=>[...root.querySelectorAll(selector)];
 return {
  headings:all('h1,h2,h3,h4,h5,h6').map(node=>({level:Number(node.tagName.slice(1)),text:text(node)})),
  prose:all('p').filter(node=>!node.closest('li,td,th,blockquote,pre')&&text(node)).map(text),
  bold:all('strong,b').map(text),italic:all('em,i').map(text),
  links:all('a[href]').map(node=>({text:text(node),href:node.getAttribute('href')})),
  inlineCode:all('code').filter(node=>!node.closest('pre')).map(text),quotes:all('blockquote').map(text),
  tables:all('table').map(table=>[...table.rows].map(row=>[...row.cells].map(cell=>({tag:cell.tagName,text:text(cell)})))),
  tasks:all('li').filter(node=>node.querySelector('input[type="checkbox"]')).map(node=>({text:text(node),checked:node.querySelector('input[type="checkbox"]').checked})),
  // A fence renderer may own one final LF. Preserve every other character.
  code:all('pre code').map(node=>node.textContent.replace(/\n$/u,'')),
 };
};
export async function runGitLabClipboardCompatibility({side,runId,page,request,project,fixture,output,onProgress}){
 const observations=[];const pause=()=>new Promise(resolve=>setTimeout(resolve,fixture.settlingMs));
 for(const input of fixture.cases){
  const result={id:input.id,input,status:'incomplete',stage:'setup',actions:[]};observations.push(result);let external;
  const save=()=>writeFile(join(output,'observations.json'),JSON.stringify(observations,null,2)+'\n');
  const stage=async name=>{result.stage=name;onProgress({side,case:input.id,stage:name});await save();};
  try{
   await stage('setup');const issue=await request(`/api/v4/projects/${project.id}/issues`,{title:input.title+' '+runId,description:input.markdown});
   const api=`/api/v4/projects/${project.id}/issues/${issue.iid}`;result.setup={iid:issue.iid,url:issue.web_url,description:issue.description};expect(issue.description).toBe(input.markdown);
   await page.goto(issue.web_url);await page.getByTestId('work-item-edit-form-button').click();
   const host=page.getByTestId('work-item-description-wrapper');const switcher=host.getByRole('button',{name:'Switch to rich text editing',exact:true});if(await switcher.isVisible())await switcher.click();
   const editor=host.locator(side==='original'?'.ProseMirror[contenteditable="true"]':'.fountain-editor[contenteditable="true"]');await expect(editor).toBeVisible({timeout:30000});
   await expect(host.locator(side==='original'?'.fountain-editor[contenteditable="true"]':'.ProseMirror[contenteditable="true"]')).toHaveCount(0);
   result.editorProof={native:await host.locator('[data-fountain-integration="native"]').count()>0,className:await editor.getAttribute('class')};
   const graph=()=>editor.evaluate(clipboardGraph);
   const shot=async name=>{
    const anchors=[['heading',editor.locator('h2').first()],['table',editor.locator('table').last()],['code',editor.locator('pre').last()]];
    if(await anchors[0][1].count()===0)anchors.splice(0,anchors.length,['empty',editor]);
    for(const [kind,anchor]of anchors){
     if(await anchor.count()===0)continue;
     await anchor.evaluate(node=>node.scrollIntoView({block:'center',inline:'nearest'}));
     await expect(anchor).toBeInViewport({ratio:1});
     await page.screenshot({path:join(output,input.id+'-'+name+'-'+kind+'.png'),caret:'initial',animations:'disabled'});
    }
   };
   await pause();result.initial=await graph();await shot('initial');
   await stage('copy');await editor.locator('h2').click();await page.keyboard.press('Control+a');
   result.selectedText=await page.evaluate(()=>window.getSelection()?.toString());expect(result.selectedText).toContain('End of clipboard fixture.');expect(result.selectedText).toContain('Clipboard review');
   await page.keyboard.press('Control+c');
   result.clipboard=await page.evaluate(async()=>{const values=await navigator.clipboard.read(),types=[...new Set(values.flatMap(item=>item.types))];const read=async type=>{const item=values.find(value=>value.types.includes(type));return item?(await item.getType(type)).text():null;};return {types,text:await read('text/plain'),html:await read('text/html')};});
   result.actions.push('Select the actual whole rich document with keyboard; copy to the system clipboard and inspect its real MIME payload.');
   await stage('external-paste');external=await page.context().newPage();
   await external.setContent('<h1>Controlled external clipboard destination</h1><label>Plain text<textarea aria-label="External plain text"></textarea></label><h2>Rich content</h2><div contenteditable="true" role="textbox" aria-label="External rich text" style="border:1px solid #999;padding:20px"></div>');
   const plain=external.getByRole('textbox',{name:'External plain text',exact:true});await plain.focus();await external.keyboard.press('Control+v');result.externalPlain=await plain.inputValue();
   const rich=external.getByRole('textbox',{name:'External rich text',exact:true});await rich.focus();await external.keyboard.press('Control+v');await pause();result.externalRich=await rich.evaluate(clipboardGraph);
   await external.screenshot({path:join(output,input.id+'-external.png'),fullPage:true,caret:'initial',animations:'disabled'});await external.close();external=null;await page.bringToFront();
   result.actions.push('Paste the same clipboard with real Ctrl+V into separate plain-text and generic rich contenteditable destinations.');
   const selection=()=>editor.evaluate(root=>{const s=window.getSelection();return {collapsed:s?.isCollapsed,text:s?.toString(),anchorText:s?.anchorNode?.textContent,anchorOffset:s?.anchorOffset,focusText:s?.focusNode?.textContent,focusOffset:s?.focusOffset,inside:root.contains(s?.anchorNode),activeInside:root.contains(document.activeElement),activeTag:document.activeElement?.tagName};});
   await stage('internal-paste');result.appendSelection={beforeClick:await selection()};
   await editor.getByText('End of clipboard fixture.',{exact:true}).click();result.appendSelection.afterClick=await selection();
   await page.keyboard.press('End');result.appendSelection.afterEnd=await selection();
   await page.keyboard.press('Enter');result.appendSelection.afterEnter=await selection();
   await expect.poll(selection,{timeout:5000}).toMatchObject({collapsed:true,inside:true,activeInside:true,anchorText:'',anchorOffset:0});
   result.appendSelection.readyForPaste=await selection();
   result.appendClipboardText=await page.evaluate(()=>navigator.clipboard.readText());
   await page.keyboard.press('Control+v');await pause();result.pasted=await graph();result.appendSelection.afterPaste=await selection();await shot('pasted');
   await page.keyboard.press('Control+z');await pause();result.undo=await graph();
   await page.keyboard.press('Control+Shift+z');await pause();result.redo=await graph();await shot('redo');
   result.actions.push('Paste the copied rich document after the original; undo and redo the paste with actual editor keyboard shortcuts.');
   await stage('cut-paste');await editor.locator('h2').first().click();await page.keyboard.press('Control+a');await page.keyboard.press('Control+x');await pause();result.cut=await graph();await shot('cut');
   await page.keyboard.press('Control+v');await pause();result.afterCutPaste=await graph();await shot('cut-pasted');
   result.actions.push('Cut the duplicated document through the actual system clipboard; paste it back into the now-empty editor.');
   await stage('save-reopen');await page.getByRole('button',{name:'Save changes',exact:true}).click();
   await expect.poll(async()=>{result.saved=await request(api);return result.saved.description!==input.markdown;},{timeout:30000}).toBe(true);
   await page.reload();await page.getByTestId('work-item-edit-form-button').click();
   const again=host.getByRole('button',{name:'Switch to rich text editing',exact:true});if(await again.isVisible())await again.click();await expect(editor).toBeVisible({timeout:30000});await pause();result.reopened=await graph();await shot('reopened');
   result.status='observed';await stage('complete');
  }catch(error){result.error=String(error);await page.screenshot({path:join(output,input.id+'-failure.png'),fullPage:true,caret:'initial',animations:'disabled'}).catch(()=>{});onProgress({side,case:input.id,stage:'incomplete',error:result.error});}
  finally{await external?.close();await save();}
 }
 return observations;
}
