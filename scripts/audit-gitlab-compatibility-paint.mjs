import {expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {clipboardGraph} from './audit-gitlab-compatibility-clipboard.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const paintState=element=>{
 const heading=element.querySelector('h2'),box=node=>{const b=node.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};};
 const style=node=>{const s=getComputedStyle(node);return {tag:node.tagName,className:node.className,opacity:s.opacity,visibility:s.visibility,display:s.display,contentVisibility:s.contentVisibility,color:s.color,backgroundColor:s.backgroundColor,font:s.font,animation:s.animationName,transition:s.transitionProperty,rect:box(node),scrollTop:node.scrollTop,clientHeight:node.clientHeight,scrollHeight:node.scrollHeight};};
 const ancestors=[];for(let node=heading;node;node=node.parentElement)ancestors.push(style(node));
 const range=heading?document.createRange():null;if(range)range.selectNodeContents(heading);
 return {time:performance.now(),visibility:document.visibilityState,fonts:document.fonts.status,activeTag:document.activeElement?.tagName,
  headingText:heading?.textContent,headingRect:heading?box(heading):null,glyphRects:range?[...range.getClientRects()].map(b=>({x:b.x,y:b.y,width:b.width,height:b.height})):[],
  checkVisibility:heading?.checkVisibility?.({checkOpacity:true,checkVisibilityCSS:true,contentVisibilityAuto:true})??null,
  root:style(element),ancestors};
};
const paintFrames=page=>page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
export async function runGitLabPaintDiagnostic({side,page,request,project,fixture,output,onProgress}){
 const seed=fixture.savedReports[side],bytes=await readFile(resolve(root,seed.path));
 expect(createHash('sha256').update(bytes).digest('hex')).toBe(seed.sha256);
 const source=JSON.parse(bytes),observations=[];
 for(const input of fixture.cases){
  const saved=source.observations.find(item=>item.id===input.id);expect(saved?.status).toBe('observed');
  const api=`/api/v4/projects/${project.id}/issues/${saved.setup.iid}`;
  const issue=await request(api);expect(issue.description).toBe(saved.saved.description);
  expect(new URL(issue.web_url).origin).toBe('http://127.0.0.1:5080');
  for(const profile of input.profiles){
   const result={id:input.id+'-'+profile.id,input,profile,status:'incomplete',stage:'reopen',sourceReport:seed,issue:{iid:issue.iid,url:issue.web_url},captures:[]};observations.push(result);
   const persist=()=>writeFile(join(output,'observations.json'),JSON.stringify(observations,null,2)+'\n');
   try{
    onProgress({side,case:result.id,stage:'reopen'});await page.goto(issue.web_url);await page.getByTestId('work-item-edit-form-button').click();
    const host=page.getByTestId('work-item-description-wrapper'),switcher=host.getByRole('button',{name:'Switch to rich text editing',exact:true});if(await switcher.isVisible())await switcher.click();
    const editor=host.locator(side==='original'?'.ProseMirror[contenteditable="true"]':'.fountain-editor[contenteditable="true"]');await expect(editor).toBeVisible({timeout:30000});
    await expect(host.locator(side==='original'?'.fountain-editor[contenteditable="true"]':'.ProseMirror[contenteditable="true"]')).toHaveCount(0);
    result.editorProof={native:await host.locator('[data-fountain-integration="native"]').count()>0,className:await editor.getAttribute('class')};
    await expect(editor.getByRole('heading',{name:saved.input.initialGraph.headings[0].text,exact:true})).toBeVisible({timeout:30000});
    await new Promise(resolve=>setTimeout(resolve,fixture.settlingMs));
    await editor.locator('h2').evaluate(node=>node.scrollIntoView({block:'center'}));await expect(editor.locator('h2')).toBeInViewport({ratio:1});
    if(profile.ready==='fonts-and-frames')await paintFrames(page);
    for(const [index,animations]of profile.animations.entries()){
     if(index>0)await paintFrames(page);
     const capture={file:result.id+'-'+index+'-'+animations+'.png',animations,graphBefore:await editor.evaluate(clipboardGraph),before:await editor.evaluate(paintState)};
     result.captures.push(capture);await persist();
     await page.screenshot({path:join(output,capture.file),caret:'initial',animations});
     capture.after=await editor.evaluate(paintState);capture.graphAfter=await editor.evaluate(clipboardGraph);await persist();
    }
    result.unchangedSource=(await request(api)).description===issue.description;expect(result.unchangedSource).toBe(true);
    result.status='observed';result.stage='complete';onProgress({side,case:result.id,stage:'complete'});
   }catch(error){result.error=String(error);onProgress({side,case:result.id,stage:'incomplete',error:result.error});}
   finally{await persist();}
  }
 }
 return observations;
}
