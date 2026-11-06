import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {writeFile,mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url),playwright=require(require.resolve('playwright',{paths:[dirname(require.resolve('@playwright/test'))]})),browser=await playwright.chromium.launch({headless:true});
const folder='artifacts/retained-capture-reference-20261106';await mkdir(folder,{recursive:true});const results=[];
try{for(const fullPage of [true,false]){
 const context=await browser.newContext({viewport:{width:1280,height:720},recordVideo:{dir:folder,size:{width:800,height:450}}});await context.tracing.start({screenshots:true,snapshots:true,sources:true});const page=await context.newPage();
 await page.setContent('<!doctype html><style>body{margin:24px;font:16px sans-serif}.panes{display:grid;grid-template-columns:1fr 1fr;gap:20px}section{min-width:0;height:1300px;padding:16px;background:#eef;border:1px solid #aae}</style><h1>Plain browser capture reference</h1><p>No Fountain code or editor.</p><button>Plain button</button><div class="panes"><section contenteditable="true">Plain text one</section><section>Plain text two</section></div>');
 await page.evaluate(()=>{const samples=[];window.samples=samples;function sample(){samples.push({width:innerWidth,panes:[...document.querySelectorAll('section')].map(e=>e.getBoundingClientRect().width),at:performance.now()});requestAnimationFrame(sample)}sample()});
 for(let index=0;index<24;index++){await page.getByRole('button').click();await page.screenshot({path:folder+'/'+(fullPage?'full':'viewport')+'-'+index+'.png',fullPage});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))}
 const samples=await page.evaluate(()=>window.samples),narrow=samples.filter(sample=>sample.width<200);results.push({fullPage,frames:samples.length,minViewport:Math.min(...samples.map(sample=>sample.width)),narrow});
 await context.tracing.stop({path:folder+'/'+(fullPage?'full':'viewport')+'-trace.zip'});await context.close();
}
 await writeFile('artifacts/retained-capture-reference-20261106.json',JSON.stringify({browser:browser.version(),fountainImported:false,results},null,2)+'\n');console.log(JSON.stringify(results.map(({fullPage,frames,minViewport,narrow})=>({fullPage,frames,minViewport,narrowFrames:narrow.length}))));
 assert(results[0].narrow.length>0,'Full-page reference did not reproduce the observed capture resize');assert.equal(results[1].narrow.length,0);
}finally{await browser.close()}
