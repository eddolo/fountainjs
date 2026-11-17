import {expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {clipboardGraph} from './audit-gitlab-compatibility-clipboard.mjs';

const fragmentGraph=root=>{
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),outsideParagraphs=[];let node;
 while((node=walker.nextNode()))if(!node.parentElement?.closest('p')&&!/^[ \t\r\n]*$/u.test(node.textContent))outsideParagraphs.push(node.textContent);
 return {text:root.textContent,prose:[...root.querySelectorAll('p')].map(node=>node.textContent),outsideParagraphs,
  bold:[...root.querySelectorAll('strong,b')].map(node=>node.textContent),links:[...root.querySelectorAll('a[href]')].map(node=>({text:node.textContent,href:node.getAttribute('href')}))};
};
const selectionState=root=>{
 const value=window.getSelection();if(!value?.anchorNode||!value.focusNode)return {text:'',inside:false};
 const a=document.createRange(),b=document.createRange();a.setStart(value.anchorNode,value.anchorOffset);a.collapse(true);b.setStart(value.focusNode,value.focusOffset);b.collapse(true);
 const order=a.compareBoundaryPoints(Range.START_TO_START,b);
 return {text:value.toString(),direction:order<0?'forward':order>0?'backward':'none',collapsed:value.isCollapsed,inside:root.contains(value.anchorNode)&&root.contains(value.focusNode),activeInside:root.contains(document.activeElement),anchorText:value.anchorNode.textContent,anchorOffset:value.anchorOffset};
};
async function selectFragment({page,editor,input,fixture}){
 const paragraph=editor.locator('p').filter({hasText:input.sourceText});await expect(paragraph).toHaveCount(1);
 const endText=input.endSourceText??input.sourceText,endParagraph=input.endSourceText?editor.locator('p').filter({hasText:endText}):paragraph;
 await expect(endParagraph).toHaveCount(1);
 await paragraph.evaluate(node=>node.scrollIntoView({block:'center'}));await expect(paragraph).toBeInViewport({ratio:1});await expect(endParagraph).toBeInViewport({ratio:1});
 if(input.method==='keyboard'){
  const active=input.direction==='forward'?paragraph:endParagraph;
  await active.click({position:{x:4,y:5}});await page.keyboard.press(input.direction==='forward'?'Home':'End',{delay:fixture.keyActionDelayMs});
  const skip=input.direction==='forward'?input.start:endText.length-input.end;
  const arrow=input.direction==='forward'?'ArrowRight':'ArrowLeft';for(let n=0;n<skip;n++)await page.keyboard.press(arrow,{delay:fixture.keyActionDelayMs});
  // Crossing adjacent paragraphs consumes one cursor step at the boundary;
  // the browser's copied/selected text can contain two newline characters.
  const steps=input.endSourceText?input.sourceText.length-input.start+1+input.end:input.end-input.start;
  await page.keyboard.down('Shift');try{for(let n=0;n<steps;n++)await page.keyboard.press(arrow,{delay:fixture.keyActionDelayMs});}finally{await page.keyboard.up('Shift');}
 }else{
  // Off-document Range reads locate text endpoints; only actual mouse input
  // establishes selection. No range is assigned to the browser/editor selection.
  const point=(root,offset)=>{
   const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode())){
    if(offset<=node.textContent.length){const range=document.createRange();range.setStart(node,offset);range.collapse(true);const box=range.getBoundingClientRect();return {x:box.x+0.5,y:box.y+box.height/2};}offset-=node.textContent.length;
   }throw new Error('Text endpoint unavailable');
  };
  const points=[await paragraph.evaluate(point,input.start),await endParagraph.evaluate(point,input.end)];
  const [from,to]=input.direction==='forward'?points:[...points].reverse();
  await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:20});await page.mouse.up();
 }
 await new Promise(resolve=>setTimeout(resolve,fixture.settlingMs));
 return editor.evaluate(selectionState);
}
export async function runGitLabPartialClipboardCompatibility({side,runId,page,request,project,fixture,output,onProgress}){
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
   const graph=()=>editor.evaluate(clipboardGraph),shot=async name=>{await editor.locator('h2').evaluate(node=>node.scrollIntoView({block:'center'}));await expect(editor.locator('h2')).toBeInViewport({ratio:1});await page.screenshot({path:join(output,input.id+'-'+name+'.png'),caret:'initial',animations:'disabled'});};
   result.documentReady={};
   const ready=async phase=>{const heading=editor.getByRole('heading',{name:input.initialGraph.headings[0].text,exact:true});await expect(heading).toBeVisible({timeout:30000});result.documentReady[phase]=await heading.isVisible();};
   await ready('initial');await pause();result.initial=await graph();
   await stage('select-copy');await page.evaluate(()=>navigator.clipboard.writeText('Compatibility selection clipboard sentinel'));
   result.copySelection=await selectFragment({page,editor,input,fixture});expect(result.copySelection).toMatchObject({text:input.selectedText,direction:input.direction,inside:true,activeInside:true,collapsed:false});await shot('selected');await page.keyboard.press('Control+c');
   result.clipboard=await page.evaluate(async()=>{const items=await navigator.clipboard.read();const read=async type=>{const item=items.find(value=>value.types.includes(type));return item?(await item.getType(type)).text():null;};return {text:await read('text/plain'),html:await read('text/html')};});
   result.actions.push('Initialize a distinct real clipboard sentinel, then select/copy using the declared direction and actual keyboard/mouse input.');
   await stage('external-paste');external=await page.context().newPage();await external.setContent('<h1>External selected fragment</h1><div contenteditable="true" role="textbox" aria-label="External fragment" style="padding:20px;border:1px solid #999"></div><label for="plain-fragment">Plain text fragment</label><textarea id="plain-fragment" rows="5" style="display:block;width:95%"></textarea>');
   const target=external.getByRole('textbox',{name:'External fragment'});await target.focus();await external.keyboard.press('Control+v');await pause();result.externalFragment=await target.evaluate(fragmentGraph);
   if(input.clipboardParagraphs){const plain=external.getByRole('textbox',{name:'Plain text fragment',exact:true});await plain.focus();await external.keyboard.press('Control+v');await pause();result.externalPlain=await plain.inputValue();}
   await external.screenshot({path:join(output,input.id+'-external.png'),caret:'initial',animations:'disabled'});await external.close();external=null;await page.bringToFront();
   await stage('select-cut');result.cutSelection=await selectFragment({page,editor,input,fixture});expect(result.cutSelection).toMatchObject({text:input.selectedText,direction:input.direction,inside:true,activeInside:true,collapsed:false});await page.keyboard.press('Control+x');await pause();result.cut=await graph();result.cutClipboardText=await page.evaluate(()=>navigator.clipboard.readText());await shot('cut');
   await page.keyboard.press('Control+z');await pause();result.cutUndo=await graph();
   await stage('internal-paste');await editor.getByText('Paste here.',{exact:true}).click();await pause();
   result.pasteDestinationSelection=await editor.evaluate(selectionState);
   await expect.poll(()=>editor.evaluate(selectionState)).toMatchObject({collapsed:true,inside:true,activeInside:true,anchorText:'Paste here.'});
   await page.keyboard.press('End',{delay:fixture.keyActionDelayMs});await pause();
   await page.keyboard.press('Enter',{delay:fixture.keyActionDelayMs});await pause();
   await expect.poll(()=>editor.evaluate(selectionState)).toMatchObject({collapsed:true,inside:true,activeInside:true,anchorText:'',anchorOffset:0});result.pasteSelection=await editor.evaluate(selectionState);result.beforePasteClipboardText=await page.evaluate(()=>navigator.clipboard.readText());
   await page.keyboard.press('Control+v');await pause();result.pasted=await graph();await shot('pasted');
   await page.keyboard.press('Control+z');await pause();result.pasteUndo=await graph();await page.keyboard.press('Control+Shift+z');await pause();result.pasteRedo=await graph();
   result.actions.push('Cut the same directed fragment, undo the cut, paste into a verified empty paragraph, then undo/redo paste.');
   await stage('save-reopen');const submit=page.getByRole('button',{name:'Save changes',exact:true});await submit.scrollIntoViewIfNeeded();if(input.verifySaveAccess)result.saveButtonReachable=await submit.evaluate(node=>{const box=node.getBoundingClientRect(),hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);return hit===node||node.contains(hit);});await submit.click();await expect.poll(async()=>{result.saved=await request(api);return result.saved.description!==input.markdown;},{timeout:30000}).toBe(true);
   await page.reload();await page.getByTestId('work-item-edit-form-button').click();const again=host.getByRole('button',{name:'Switch to rich text editing',exact:true});if(await again.isVisible())await again.click();await expect(editor).toBeVisible();await ready('reopened');await pause();result.reopened=await graph();await shot('reopened');
   result.status='observed';await stage('complete');
  }catch(error){result.error=String(error);await page.screenshot({path:join(output,input.id+'-failure.png'),fullPage:true,caret:'initial',animations:'disabled'}).catch(()=>{});onProgress({side,case:input.id,stage:'incomplete',error:result.error});}
  finally{await external?.close();await save();}
 }
 return observations;
}
