import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium,expect} from '@playwright/test';
import {openRich,observePage} from '../../../scripts/gitlab-audit-editor.mjs';
import {readGitLabAuditCredential} from '../../../scripts/gitlab-audit-credentials.mjs';
import {auditNativeControlsLayout} from '../../../scripts/audit-gitlab-native-controls-layout.mjs';
const dir=new URL('./document-and-accessibility-'+Date.now()+'/',import.meta.url);
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const root=resolve('.');
const install=await read(root+'/artifacts/gitlab-native-browser-install/install.json');
const pin=await read(root+'/integrations/gitlab/runtime/upstream.json');
const peer=process.argv.includes('--peer');
const container='fountain-gitlab-integration-'+(peer?'peer':'baseline')+'-1';
const origin='http://127.0.0.1:5080';
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8'});
const info=JSON.parse(docker('inspect',container))[0];
assert.equal(info.Config.Image,pin.image);
assert.equal(info.Config.Labels['com.docker.compose.project'],'fountain-gitlab-integration');
assert.ok(info.Mounts.some(m=>m.Source===install.source+'/public/assets/webpack'&&!m.RW));
assert.equal(install.integrationSHA256,'62bab23a4d078670b032f65e353e0d36feca43d13ebe3b083b84ae7ca2d08824');
await mkdir(dir);
const report={checks:[],errors:[],passed:false};
const browser=await chromium.launch({headless:true,args:peer?['--host-resolver-rules=MAP 127.0.0.1:5080 127.0.0.1:5081']:[]});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await observePage(page,report,report.errors);
 const credential=readGitLabAuditCredential(args=>docker('exec','-i','fountain-gitlab-integration-baseline-1',...args));
 try {
  await page.goto(origin+'/users/sign_in'); await page.getByLabel('Username or primary email').fill('root');
  await page.getByLabel('Password',{exact:true}).fill(credential.password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.waitForURL(url=>!url.pathname.includes('sign_in'));
 }catch{throw new Error('Local sign-in failed.');}
 const headers={'X-CSRF-Token':await page.locator('meta[name="csrf-token"]').getAttribute('content')};
 const api=async (path,data)=>{
   const url=new URL(path,origin);assert.equal(url.origin,origin);
   const res=await page.request.fetch(url.href,{headers,...(data?{method:'POST',data}:{})});
   assert.ok(res.ok(),res.status()+' '+url.pathname);return res.json();
 };
 const version=await api('/api/v4/version');assert.equal(version.revision,pin.packagedRevision);
 const project=await api('/api/v4/projects/root%2Ffountain-product-integration'); assert.equal(project.visibility,'private');
 const issues='/api/v4/projects/'+project.id+'/issues';
 const files=root+'/integrations/gitlab/fixtures/';
 const front=(await read(files+'frontmatter-live-html.json')).fixtures.find(f=>f.name==='yaml').source;
 const math=(await read(files+'math-html.json')).rows[0].markdown;
 const diagram=(await read(files+'diagram-live-html.json')).fixtures.find(f=>f.name==='mermaid').source;
 const reference=(await read(files+'reference-live-html.json')).fixtures.find(f=>f.name==='issue-id').source;
 const tail='Review pending.';
 const create=async(name,description)=>{
   const issue=await api(issues,{title:'Qualification '+name+' '+Date.now(),description});
   await page.goto(issue.web_url);
   await page.getByTestId('work-item-edit-form-button').click();
   const form=page.getByTestId('work-item-description-wrapper');
   const editor=await openRich(form,'fountain');
   const loaded=await editor.evaluate(el=>({integration:el.closest('[data-fountain-build]').dataset.fountainBuild,runtime:globalThis.__fountainGitLabRuntimeSHA256}));
   assert.equal(loaded.integration,install.integrationSHA256);assert.equal(loaded.runtime,install.nativeRuntime.sha256);
   report.build={node:peer?'peer':'baseline',gitlab:pin.commit,fountain:install.nativeRuntime.parentRevision,...loaded,browser:browser.version()};
   return {issue,form,editor};
 };
 try{
  const src=[front,math,diagram,'Related '+reference+' and @root.',tail].join('\n\n');
  const {issue,form,editor}=await create('GitLab Markdown',src);
  report.document={iid:issue.iid,source:src};
  await expect(editor).toContainText(tail);await editor.locator('p').filter({hasText:tail}).click();
  await page.keyboard.press('End');await page.keyboard.insertText(' Approved.');
  await form.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect.poll(async()=>(await api(issues+'/'+issue.iid)).description).toContain('Approved.');
  const saved=(await api(issues+'/'+issue.iid)).description;report.document.saved=saved;
  const preview=async text=>{
   const response=await page.request.post(origin+'/api/v4/markdown',{headers,data:{text,gfm:true,project:project.path_with_namespace}});
   assert.ok(response.ok());const {html}=await response.json();
   return page.evaluate(markup=>[...new DOMParser().parseFromString(markup,'text/html').querySelectorAll('a[data-reference-type]')].map(a=>({label:a.textContent,original:a.dataset.original,type:a.dataset.referenceType,target:a.getAttribute('href')})),html);
 };
 const before=await preview(src),after=await preview(saved);
  assert.deepEqual(before,after);
  assert.ok(before.some(link=>link.type==='issue') && before.some(link=>link.type==='user'&&link.original==='@root'));
  const expected=src+' Approved.';
  report.document.byteExact=saved===expected;
  report.document.mentionUsesSpan=saved.includes('<span>@root</span>.');
  assert.ok(saved===expected || saved===expected.replace('@root.','<span>@root</span>.'));
  report.document.references={before,after};
  await page.reload();const reader=page.locator('.js-work-item-description');await expect(reader).toContainText(tail+' Approved.',{timeout:30000});
  await reader.screenshot({path:resolve(new URL(dir).pathname,'saved-dialect.png')});
  await page.getByTestId('work-item-edit-form-button').click();
  const reopened=await openRich(form,'fountain');await expect(reopened).toContainText(tail+' Approved.',{timeout:30000});
  report.checks.push('Frontmatter, equation, Mermaid, issue reference and mention survived a rich edit, Save and reopen with the same link targets and unchanged technical source.');
 }catch(e){report.errors.push({case:'document',error:String(e)});}
 try{
  await page.goto(project.web_url);
  const asset=await page.locator('link[rel~="icon"]').first().evaluate(el=>el.href);
  const src='![Uploaded baseline figure]('+asset+')\n\nAccessibility check.';
  const {issue,form,editor}=await create('keyboard and accessibility',src);
  report.accessibilityIssue=issue.iid;
  await auditNativeControlsLayout({page,editor,toolbar:form.getByTestId('formatting-toolbar'),output:dir,report});
  assert.equal((await api(issues+'/'+issue.iid)).description,src);
 }catch(e){report.errors.push({case:'accessibility',error:String(e)});}
 try{
  const {issue,form,editor}=await create('quick action','Review complete.');
  await form.getByRole('button',{name:'Switch to plain text editing',exact:true}).click();
  const source=form.locator('textarea[data-testid="markdown-editor-form-field"]');
  await source.fill('Review complete.\n\n/close');
  await form.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect.poll(async()=>(await api(issues+'/'+issue.iid)).state,{timeout:30000}).toBe('closed');
  const stored=await api(issues+'/'+issue.iid);assert.equal(stored.description.trim(),'Review complete.');
  report.quickAction={iid:issue.iid,state:stored.state,description:stored.description};
 }catch(e){report.errors.push({case:'quick action',error:String(e)});}
 report.passed=report.errors.length===0;
}finally{await browser.close();await writeFile(new URL('report.json',dir),JSON.stringify(report,null,2)+'\n');}
if(!report.passed)process.exitCode=1;
