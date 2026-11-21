import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,expect} from '@playwright/test';
import {preview} from 'vite';
const output=fileURLToPath(new URL('./',import.meta.url));
const server=await preview({configFile:'vite.production-preview.config.ts',build:{outDir:resolve(output,'site')},preview:{host:'127.0.0.1',port:4297,strictPort:true,open:false}});
const browser=await chromium.launch({headless:true});
const screens=[];
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.goto('http://127.0.0.1:4297/fountainjs/workflows.html');
  const link=page.locator('a[href="#gitlab-comparison"]');
  await link.click();
  const area=page.locator('#gitlab-comparison');
  await expect(area).toBeVisible();
  const screenshots=area.locator('img');
  assert.equal(await screenshots.count(),2);
  for(const img of await screenshots.all())await img.evaluate(el=>el.decode());
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.evaluate(()=>document.fonts.ready);
  await expect.poll(()=>page.evaluate(()=>document.querySelector('#gitlab-comparison-title').getBoundingClientRect().top >= document.querySelector('.site-header').getBoundingClientRect().bottom)).toBe(true);
  if(width===390)await page.screenshot({path:resolve(output,'showcase-'+width+'.png')});
  const [download]=await Promise.all([page.waitForEvent('download'),area.locator('a[download]').click()]);
  const receipt=await readFile(await download.path(),'utf8');
  assert.ok(receipt.includes('1f16e1b0abf20468b0d439ea65b0ddd6058240e5')&&receipt.includes('62bab23a4d078670b032f65e353e0d36feca43d13ebe3b083b84ae7ca2d08824')&&receipt.includes('Absolute feature acceptance: passed'));
  if(width>390)await area.screenshot({path:resolve(output,'showcase-'+width+'.png')});
  screens.push({width,images:await screenshots.count(),download:download.suggestedFilename(),viewportOverflow:false});
  await page.close();
 }
 await writeFile(resolve(output,'showcase.json'),JSON.stringify({passed:true,screens},null,2)+'\n');
}finally{await browser.close();await server.close();}
