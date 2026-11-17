import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {waitForGitLabDeployment} from './gitlab-deployment-readiness.mjs';
import {readGitLabAuditCredential} from './gitlab-audit-credentials.mjs';
const container='fountain-gitlab-integration-baseline-1',origin='http://127.0.0.1:5080';
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:15000});
const state=JSON.parse(docker('inspect','--format','{{json .State}}',container));
if(!state.Running)throw new Error('Use the already running isolated task deployment; this probe never starts it.');
await waitForGitLabDeployment({readState:()=>JSON.parse(docker('inspect','--format','{{json .State}}',container)),probe:async()=>(await fetch(origin+'/users/sign_in',{redirect:'manual',signal:AbortSignal.timeout(5000)})).status});
const cookieJar=new Map();let stage='credential';
const call=async(path,init={})=>{
 const url=new URL(path,origin);if(url.origin!==origin)throw new Error('LOCAL_ONLY');
 const response=await fetch(url,{...init,signal:AbortSignal.timeout(15000),redirect:'manual',headers:{...init.headers,Cookie:[...cookieJar].map(([k,v])=>k+'='+v).join('; ')}});
 for(const value of response.headers.getSetCookie()){const pair=value.split(';',1)[0],index=pair.indexOf('=');if(index>0)cookieJar.set(pair.slice(0,index),pair.slice(index+1));}
 return response;
};
const csrf=html=>{const tag=html.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/u);if(!tag)throw new Error('CSRF_METADATA');return tag[1].replaceAll('&amp;','&');};
try{
 const credential=readGitLabAuditCredential(args=>docker('exec','-i',container,...args));
 stage='login-page';const page=await call('/users/sign_in');if(page.status!==200)throw new Error('UNREADY');const token=csrf(await page.text());
 stage='sign-in';const login=await call('/users/sign_in',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({'user[login]':'root','user[password]':credential.password,authenticity_token:token})});
 if(login.status!==302||login.headers.get('location')?.includes('/sign_in'))throw new Error('SIGN_IN');
 stage='project';const project=await call('/root/fountain-product-integration');if(project.status!==200)throw new Error('PROJECT');const headers={'X-CSRF-Token':csrf(await project.text()),'Content-Type':'application/json'};
 const bytes=await readFile('integrations/gitlab/fixtures/compatibility-task-containers.json'),fixture=JSON.parse(bytes),fixtures=[];
 for(const input of fixture.cases){stage='render-'+input.id;const response=await call('/api/v4/markdown',{method:'POST',headers,body:JSON.stringify({text:input.markdown,gfm:true,project:'root/fountain-product-integration'})});if(!response.ok)throw new Error('RENDER');const result=await response.json();if(typeof result.html!=='string')throw new Error('RENDER_SHAPE');fixtures.push({id:input.id,source:input.markdown,html:result.html});}
 stage='write';const output='artifacts/gitlab-compatibility/task-containers-20261117/renderer-1.json';await writeFile(output,JSON.stringify({scope:'Read-only renderer diagnostic. Login/session data is never retained; no fixture or document is modified.',fixtureSHA256:createHash('sha256').update(bytes).digest('hex'),fixtures},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,count:fixtures.length}));
}catch{console.error('Local renderer probe failed at '+stage+'; credentialed details omitted.');process.exitCode=1;}
