import {expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';

export const trimBoundaryLF=value=>value.replace(/^\n+|\n+$/gu,'');
export const conversionGraph=(root,trackQuotes=false)=>{
 const copy=root.cloneNode(true);
 for(const link of copy.querySelectorAll('a.anchor'))link.remove();
 const tasks=[...copy.querySelectorAll('li')].flatMap(item=>{
  const checkbox=[...item.querySelectorAll('input[type="checkbox"]')].find(input=>input.closest('li')===item);if(!checkbox)return [];
  let depth=0;for(let p=item.parentElement?.closest('li');p;p=p.parentElement?.closest('li'))depth++;
  const text=item.cloneNode(true);for(const control of text.querySelectorAll('button,input,ul,ol,svg'))control.remove();
  return [{text:text.textContent.trim(),state:checkbox.checked?'completed':'pending',depth}];
 });
 // Parent expected flow has only a trailing marker; child prose is inspected via exact source.
 const prose=[...copy.querySelectorAll('p')].filter(p=>!p.closest('li')).map(p=>p.textContent.trim());
 const graph={tasks,prose,bold:[...copy.querySelectorAll('strong,b')].map(n=>n.textContent),links:[...copy.querySelectorAll('a[href]')].filter(n=>!n.classList.contains('anchor')).map(n=>({text:n.textContent,href:n.getAttribute('href')})),codes:[...copy.querySelectorAll('pre code')].map(n=>n.textContent.replace(/\n$/u,''))};
 if(trackQuotes){graph.quoteBlockCount=copy.querySelectorAll('blockquote').length;graph.taskQuoteDepths=[...copy.querySelectorAll('li')].filter(item=>[...item.querySelectorAll('input[type="checkbox"]')].some(input=>input.closest('li')===item)).map(item=>{let depth=0;for(let p=item.parentElement;p;p=p.parentElement)if(p.tagName==='BLOCKQUOTE')depth++;return depth;});}
 return graph;
};
export async function runGitLabTaskConversionCompatibility({side,runId,page,request,project,fixture,output,onProgress}){
 const observations=[],pause=()=>new Promise(resolve=>setTimeout(resolve,fixture.settlingMs));
 for(const input of fixture.cases){
  const result={id:input.id,input,status:'incomplete',stage:'setup',graphs:{}};observations.push(result);
  const save=()=>writeFile(join(output,'observations.json'),JSON.stringify(observations,null,2)+'\n');
  const stage=async name=>{result.stage=name;onProgress({side,case:input.id,stage:name});await save();};
  const shot=async phase=>{await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:join(output,input.id+'-'+phase+'.png'),animations:'disabled',caret:'initial'});};
  try{
   const issue=await request(`/api/v4/projects/${project.id}/issues`,{title:input.title+' '+runId,description:input.markdown});
   const api=`/api/v4/projects/${project.id}/issues/${issue.iid}`;result.setup={iid:issue.iid,url:issue.web_url,description:issue.description};expect(issue.description).toBe(input.markdown);
   const host=page.getByTestId('work-item-description-wrapper'),reader=page.locator('.js-work-item-description');
   const editor=host.locator(side==='original'?'.ProseMirror[contenteditable="true"]':'.fountain-editor[contenteditable="true"]');
   const edit=async(marker='Parent marker.')=>{await page.getByTestId('work-item-edit-form-button').click();const switcher=host.getByRole('button',{name:'Switch to rich text editing',exact:true});if(await switcher.isVisible())await switcher.click();await expect(editor).toBeVisible({timeout:30000});if(marker!==null)await expect(editor.getByRole('heading',{name:'Child conversion',exact:true})).toBeVisible({timeout:30000});result.documentReadiness??=[];if(marker===null&&input.trackQuotes){await expect.poll(()=>editor.textContent(),{timeout:30000}).toContain('detail');result.documentReadiness.push({expectedFragment:'detail',actualText:await editor.textContent(),representationNeutral:true});}else{const sentinel=editor.getByText(marker??'A bold detail and link.',{exact:true});await expect(sentinel).toBeVisible({timeout:30000});result.documentReadiness.push({expectedText:marker??'A bold detail and link.',actualText:await sentinel.textContent()});}await pause();};
   await page.goto(issue.web_url);await edit();await expect(editor.getByRole('heading',{name:'Child conversion',exact:true})).toBeVisible();
   await expect(host.locator(side==='original'?'.fountain-editor[contenteditable="true"]':'.ProseMirror[contenteditable="true"]')).toHaveCount(0);
   result.editorProof={native:await host.locator('[data-fountain-integration="native"]').count()>0,className:await editor.getAttribute('class')};
   result.graphs.before=await editor.evaluate(conversionGraph,input.trackQuotes===true);
   const marker=editor.getByText('Parent marker.',{exact:true});await marker.click();await page.keyboard.press('End');await pause();
   await expect.poll(()=>page.evaluate(()=>{const s=window.getSelection();return {text:s?.anchorNode?.textContent,offset:s?.anchorOffset,collapsed:s?.isCollapsed};})).toEqual({text:'Parent marker.',offset:14,collapsed:true});
   await page.keyboard.insertText(' Verified.');await pause();await expect(editor.getByText('Parent marker. Verified.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(editor).toBeHidden({timeout:30000});
   await expect.poll(async()=>{result.saved=await request(api);return result.saved.description;},{timeout:30000}).toContain('Parent marker. Verified.');
   await expect(reader.locator('h2').filter({hasText:'Child conversion'})).toBeVisible();await pause();
   result.graphs.readerBefore=await reader.evaluate(conversionGraph,input.trackQuotes===true);await shot('before-menu');await stage('open-conversion');
   const item=reader.locator('input.task-list-item-checkbox').nth(input.targetOrdinal??1).locator('xpath=ancestor::li[1]');await item.hover();const trigger=item.getByRole('button',{name:'Checklist item actions',exact:true}).first();const owner=await item.getAttribute('data-sourcepos');expect(await trigger.evaluate((n,pos)=>n.closest('li')?.getAttribute('data-sourcepos')===pos,owner)).toBe(true);await trigger.click();
   result.target=await item.evaluate(n=>({text:n.textContent,sourcepos:n.dataset.sourcepos}));await shot('menu');
   await page.getByRole('menuitem',{name:'Convert to child item',exact:true}).or(page.getByRole('button',{name:'Convert to child item',exact:true})).click();
   const modal=page.getByRole('dialog',{name:'New task',exact:true});await expect(modal).toBeVisible({timeout:30000});
   result.modalTitle=await modal.getByTestId('work-item-title-input').inputValue();
   const modalEditor=modal.locator(side==='original'?'.ProseMirror[contenteditable="true"]':'.fountain-editor[contenteditable="true"]');await expect(modalEditor).toBeVisible({timeout:30000});await pause();result.graphs.prefill=await modalEditor.evaluate(conversionGraph,input.trackQuotes===true);result.prefillHTML=await modalEditor.innerHTML();result.modalEditorProof={native:await modal.locator('[data-fountain-integration="native"]').count()>0,className:await modalEditor.getAttribute('class')};await shot('prefill');if(input.focusCodeBeforeCapture){const code=modalEditor.locator('pre');result.prefillCodeBlocks=await code.count();if(result.prefillCodeBlocks===1){
    const similar=modal.locator('[data-testid="crud-collapse-toggle"][aria-controls="work-item-similar-items"]');
    if(await similar.isVisible()&&await similar.getAttribute('aria-expanded')==='true'){await similar.click();await expect(similar).toHaveAttribute('aria-expanded','false');result.similarItemsCollapsed=true;}
    await code.scrollIntoViewIfNeeded();
    const visible=()=>code.evaluate(node=>{const r=node.getBoundingClientRect(),clips=[];let fits=r.top>=-1&&r.bottom<=innerHeight+1&&r.left>=-1&&r.right<=innerWidth+1;for(let p=node.parentElement;p;p=p.parentElement){const s=getComputedStyle(p);if(/auto|scroll|hidden|clip/u.test(s.overflowY)){const b=p.getBoundingClientRect();clips.push({tag:p.tagName,top:b.top,bottom:b.bottom,overflow:s.overflowY});if(r.top<b.top-1||r.bottom>b.bottom+1)fits=false;}}return {fullyVisible:fits,top:r.top,bottom:r.bottom,height:r.height,clips};});
    if(!(await visible()).fullyVisible){await code.hover();await page.mouse.wheel(0,600);}
    await expect.poll(async()=>{result.prefillCodeVisibility=await visible();return result.prefillCodeVisibility.fullyVisible;},{timeout:10000}).toBe(true);await shot('prefill-code');
   }}await save();
   // Never repair the prefill: Create submits exactly what the real UI prepared.
   await stage('create-child');await modal.getByTestId('create-button').click();await expect(modal).toBeHidden({timeout:30000});
   await expect.poll(async()=>{result.parentAfter=await request(api);return result.parentAfter.description;},{timeout:30000}).not.toBe(result.saved.description);
   const childLink=page.getByRole('link',{name:result.modalTitle,exact:true});await expect(childLink).toHaveCount(1,{timeout:30000});result.childHref=await childLink.getAttribute('href');await childLink.scrollIntoViewIfNeeded();await shot('parent-child');
   const match=result.childHref.match(/\/(\d+)(?:[?#].*)?$/u);if(!match)throw new Error('Child UI link has no numeric work-item IID');
   const childIid=match[1];
   const data=await request('/api/graphql',{query:'query AuditChild($path: ID!, $iid: String!) { namespace(fullPath:$path) { workItem(iid:$iid) { id iid title workItemType { name } widgets { type ... on WorkItemWidgetDescription { description } ... on WorkItemWidgetHierarchy { parent { iid } } } } } }',variables:{path:project.path_with_namespace,iid:childIid}});
   if(data.errors?.length)throw new Error('Read-only child verification query failed: '+JSON.stringify(data.errors));
   const child=data.data?.namespace?.workItem;if(!child)throw new Error('Created child not found');
   result.child={iid:child.iid,title:child.title,type:child.workItemType.name,description:child.widgets.find(w=>w.type==='DESCRIPTION')?.description,parentIid:child.widgets.find(w=>w.type==='HIERARCHY')?.parent?.iid};
   await page.reload();await edit('Parent marker. Verified.');result.graphs.parentReopened=await editor.evaluate(conversionGraph,input.trackQuotes===true);result.parentReopenedHTML=await editor.innerHTML();await shot('parent-reopened');
   if(input.verifyParentResave){
    await stage('resave-parent');const marker=editor.getByText('Parent marker. Verified.',{exact:true});await marker.click();await page.keyboard.press('End');await pause();
    await expect.poll(()=>page.evaluate(()=>{const s=window.getSelection();return {text:s?.anchorNode?.textContent,offset:s?.anchorOffset,collapsed:s?.isCollapsed};})).toEqual({text:'Parent marker. Verified.',offset:24,collapsed:true});
    await page.keyboard.insertText(' Reopened.');await pause();await expect(editor.getByText('Parent marker. Verified. Reopened.',{exact:true})).toBeVisible();
    const submit=page.getByRole('button',{name:'Save changes',exact:true});await submit.scrollIntoViewIfNeeded();result.parentResaveReachable=await submit.evaluate(node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return node===hit||node.contains(hit);});await submit.click();await expect(editor).toBeHidden({timeout:30000});
    await expect.poll(async()=>{result.parentResaved=await request(api);return result.parentResaved.description;},{timeout:30000}).toContain('Parent marker. Verified. Reopened.');
    await page.reload();await edit('Parent marker. Verified. Reopened.');result.graphs.parentResaved=await editor.evaluate(conversionGraph,input.trackQuotes===true);result.parentResavedHTML=await editor.innerHTML();await shot('parent-resaved');
   }
   const childURL=new URL(result.childHref,issue.web_url);if(childURL.origin!==new URL(issue.web_url).origin)throw new Error('Child link changed origin');
   await page.goto(childURL.href);await edit(null);result.childEditorProof={native:await host.locator('[data-fountain-integration="native"]').count()>0,className:await editor.getAttribute('class')};result.graphs.childReopened=await editor.evaluate(conversionGraph,input.trackQuotes===true);await shot('child-reopened');
   result.status='observed';await stage('complete');
  }catch(error){result.error=String(error);await page.screenshot({path:join(output,input.id+'-failure.png'),fullPage:true,animations:'disabled'}).catch(()=>{});onProgress({side,case:input.id,stage:'incomplete',error:result.error});await save();}
 }
 return observations;
}
