import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,expect} from '@playwright/test';
import {readGitLabAuditCredential} from './gitlab-audit-credentials.mjs';
import {waitForGitLabDeployment} from './gitlab-deployment-readiness.mjs';
import {runGitLabAccessCompatibility} from './audit-gitlab-compatibility-access.mjs';
import {runGitLabConflictCompatibility} from './audit-gitlab-compatibility-conflicts.mjs';
import {runGitLabTaskConversionCompatibility} from './audit-gitlab-compatibility-task-conversion.mjs';
import {runGitLabTaskMenuCompatibility} from './audit-gitlab-compatibility-task-menu.mjs';
import {runGitLabTaskRecoveryCompatibility} from './audit-gitlab-compatibility-task-recovery.mjs';
import {runGitLabTaskCompatibility} from './audit-gitlab-compatibility-tasks.mjs';
import {runGitLabGridClipboardCompatibility} from './audit-gitlab-compatibility-grid.mjs';
import {runGitLabPaintDiagnostic} from './audit-gitlab-compatibility-paint.mjs';
import {runGitLabPartialClipboardCompatibility} from './audit-gitlab-compatibility-partial.mjs';
import {runGitLabClipboardCompatibility} from './audit-gitlab-compatibility-clipboard.mjs';
import {runGitLabSuggestionCompatibility} from './audit-gitlab-compatibility-suggestions.mjs';
if(process.platform!=='linux')throw new Error('Run beside the isolated Linux Docker engine.');
const value=flag=>process.argv[process.argv.indexOf(flag)+1];
const suite=process.argv.includes('--suite')?value('--suite'):'suggestions';
const side=value('--editor'),runId=value('--run-id'),attempt=process.argv.includes('--attempt')?Number(value('--attempt')):1;
if(!['suggestions','deletions','reviews','clipboard','partial','crossblock','paint','grid','tasks','task-recovery','task-menu','task-conversion','task-containers','conflicts','access','access-removal'].includes(suite)||!['original','fountain'].includes(side)||!process.argv.includes('--run-id')||!/^[a-z0-9][a-z0-9-]{0,60}$/u.test(runId)||!Number.isSafeInteger(attempt)||attempt<1||attempt>99)
 throw new Error('Usage: --editor original|fountain --run-id safe-id [--attempt 1..99] [--suite suggestions|deletions|reviews|clipboard|partial|crossblock|paint|grid|tasks|task-recovery|task-menu|task-conversion|task-containers|conflicts|access|access-removal]');
const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(root,'artifacts/gitlab-compatibility',runId,`${side}-${attempt}`);
await mkdir(resolve(out,'..'),{recursive:true});await mkdir(out);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fixturePath=`integrations/gitlab/fixtures/compatibility-${suite}.json`;
const fixtureBytes=await readFile(resolve(root,fixturePath)),fixture=JSON.parse(fixtureBytes);
const pin=JSON.parse(await readFile(resolve(root,'integrations/gitlab/runtime/upstream.json')));
const compose=['compose','-f',resolve(root,'integrations/gitlab/runtime/compose.yaml')],env={...process.env};
if(side==='fountain'){
 const install=JSON.parse(await readFile(resolve(root,'artifacts/gitlab-native-browser-install/install.json')));
 const build=JSON.parse(await readFile(resolve(root,'artifacts/gitlab-native-runtime/build.json')));
 if(install.restored||install.revision!==pin.commit)throw new Error('No matching installed native candidate.');
 for(const [path,expected] of Object.entries(build.inputs))if(hash(await readFile(resolve(root,path)))!==expected)throw new Error('Stale native runtime input: '+path);
 for(const [path,expected] of Object.entries(install.files))if(hash(await readFile(resolve(install.source,path)))!==expected)throw new Error('Changed installed native source: '+path);
 env.FOUNTAIN_GITLAB_FRONTEND_ASSETS=resolve(install.source,'public/assets/webpack');
 compose.push('-f',resolve(root,'integrations/gitlab/runtime/compose.frontend.yaml'));
}
const docker=(...args)=>execFileSync('docker',args,{env,encoding:'utf8',timeout:120000,stdio:['ignore','pipe','pipe']});
const containerName='fountain-gitlab-integration-baseline-1';
const prior=JSON.parse(docker('inspect',containerName))[0];
if(prior.State.Running||prior.Config.Labels['com.docker.compose.project']!=='fountain-gitlab-integration'||prior.Config.Image!==pin.image)
 throw new Error('Stop the known isolated task deployment before switching editor modes.');
let browser,started=false,authenticated=false;
const report={formatVersion:1,runId,attempt,side,scope:'Matched original GitLab/Fountain UI observations, not automatic superiority claims.',
 suite,fixturePath,fixtureHash:hash(fixtureBytes),fixture,observations:[],errors:[],classification:null,
 harnessHashes:Object.fromEntries(await Promise.all(['scripts/run-gitlab-compatibility.mjs','scripts/audit-gitlab-compatibility-access.mjs','scripts/audit-gitlab-compatibility-conflicts.mjs','scripts/audit-gitlab-compatibility-suggestions.mjs','scripts/audit-gitlab-compatibility-clipboard.mjs','scripts/audit-gitlab-compatibility-partial.mjs','scripts/audit-gitlab-compatibility-paint.mjs','scripts/audit-gitlab-compatibility-grid.mjs','scripts/audit-gitlab-compatibility-tasks.mjs','scripts/audit-gitlab-compatibility-task-recovery.mjs','scripts/gitlab-deployment-readiness.mjs','scripts/audit-gitlab-compatibility-task-menu.mjs','scripts/audit-gitlab-compatibility-task-conversion.mjs'].map(async path=>[path,hash(await readFile(resolve(root,path)))])))};
try{
 started=true;execFileSync('docker',[...compose,'up','-d','baseline'],{env,stdio:'inherit',timeout:120000});
 const deployment=JSON.parse(docker('inspect',containerName))[0];
 if(deployment.Config.Image!==pin.image||deployment.Config.Labels['com.docker.compose.project']!=='fountain-gitlab-integration')throw new Error('Wrong live deployment');
 const assetTarget='/opt/gitlab/embedded/service/gitlab-rails/public/assets/webpack';
 const assets=deployment.Mounts.filter(mount=>mount.Destination===assetTarget);
 if(side==='original'?assets.length!==0:assets.length!==1||assets[0].RW)throw new Error('Wrong editor asset mount');
 const backendMounts=deployment.Mounts.filter(mount=>mount.Destination!==assetTarget).map(mount=>({name:mount.Name,destination:mount.Destination,type:mount.Type})).sort((a,b)=>a.destination.localeCompare(b.destination));
 if(backendMounts.length!==3||backendMounts.some(mount=>mount.type!=='volume'||!mount.name.startsWith('fountain-gitlab-integration_baseline-')))throw new Error('Unexpected backend/repair mount');
 report.deployment={image:deployment.Config.Image,imageId:deployment.Image,backendMounts,assetMount:assets.map(mount=>({source:mount.Source,readOnly:!mount.RW})),
 backendEnvironmentHash:hash(deployment.Config.Env.filter(item=>!item.startsWith('ENABLE_RSPACK=')).sort().join('\n')),
 assetSelector:deployment.Config.Env.find(item=>item.startsWith('ENABLE_RSPACK='))??'packaged-default',cpus:deployment.HostConfig.NanoCpus,memory:deployment.HostConfig.Memory};
 const credential=readGitLabAuditCredential(args=>docker('exec','-i',containerName,...args));
 if(!credential)throw new Error('No isolated task credential.');
 browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1,locale:'en-US',timezoneId:'UTC'});
 const permissions=['clipboard','partial','crossblock','grid'].includes(suite)?['clipboard-read','clipboard-write']:[];
 if(permissions.length)await context.grantPermissions(permissions,{origin:'http://127.0.0.1:5080'});
 const page=await context.newPage();report.browser={version:browser.version(),viewport:{width:1280,height:900},deviceScaleFactor:1,locale:'en-US',timezone:'UTC',platform:process.platform,arch:process.arch,permissions};
 report.startup=[];
 await waitForGitLabDeployment({readState:()=>JSON.parse(docker('inspect','--format','{{json .State}}',containerName)),
  probe:async()=>(await page.request.get('http://127.0.0.1:5080/users/sign_in',{timeout:5000})).status(),
  observe:state=>report.startup.push(state)});
 try{
  await page.goto('http://127.0.0.1:5080/users/sign_in');await page.getByLabel('Username or primary email').fill('root');
  await page.getByLabel('Password',{exact:true}).fill(credential.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.waitForURL(url=>!url.pathname.includes('sign_in'));authenticated=true;
 }catch{throw new Error('Isolated sign-in failed; credentialed call log is not retained.');}
 const headers={'X-CSRF-Token':await page.locator('meta[name="csrf-token"]').getAttribute('content')};
 const request=async(path,data,method='POST')=>{
  const url=new URL(path,'http://127.0.0.1:5080');if(url.origin!=='http://127.0.0.1:5080')throw new Error('Only isolated local API requests are allowed.');
  const response=await page.request.fetch(url.href,{headers,...(data?{method,data}:{})});
  if(!response.ok())throw new Error(`Task API ${data?method:'GET'} ${url.pathname}: ${response.status()}`);return response.status()===204?null:response.json();
 };
 const version=await request('/api/v4/version');expect(version.version).toBe(pin.version);expect(version.revision).toBe(pin.packagedRevision);
 const project=await request('/api/v4/projects/root%2Ffountain-product-integration');expect(project.visibility).toBe('private');
 const branch=await request(`/api/v4/projects/${project.id}/repository/branches/${encodeURIComponent(project.default_branch)}`);
 report.backend={version,project:{id:project.id,path:project.path_with_namespace,visibility:project.visibility,defaultBranch:project.default_branch,defaultHead:branch.commit.id,permissions:project.permissions},actor:'root'};
 const serverPaths=['app/services/notes/update_service.rb','app/services/suggestions/create_service.rb','lib/gitlab/diff/suggestion.rb'];
 report.backend.serverSources=docker('exec',containerName,'sha256sum',...serverPaths.map(path=>'/opt/gitlab/embedded/service/gitlab-rails/'+path)).trim().split('\n');
 const manifests=docker('exec',containerName,'find',assetTarget,'-maxdepth','1','-name','manifest*.json').trim().split('\n').filter(Boolean);
 report.frontendManifests=manifests.length?docker('exec',containerName,'sha256sum',...manifests).trim().split('\n'):[];
 page.on('pageerror',error=>report.errors.push(error.message));
 report.observations=await (['access','access-removal'].includes(suite)?runGitLabAccessCompatibility:suite==='conflicts'?runGitLabConflictCompatibility:['task-conversion','task-containers'].includes(suite)?runGitLabTaskConversionCompatibility:suite==='task-menu'?runGitLabTaskMenuCompatibility:suite==='task-recovery'?runGitLabTaskRecoveryCompatibility:suite==='tasks'?runGitLabTaskCompatibility:suite==='grid'?runGitLabGridClipboardCompatibility:suite==='paint'?runGitLabPaintDiagnostic:['partial','crossblock'].includes(suite)?runGitLabPartialClipboardCompatibility:suite==='clipboard'?runGitLabClipboardCompatibility:runGitLabSuggestionCompatibility)({side,runId:runId+'-a'+attempt,page,request,project,fixture,output:out,onProgress:detail=>console.log(JSON.stringify({kind:'gitlab-compatibility',...detail}))});
 report.collectionComplete=report.observations.every(item=>item.status==='observed');
 if(!report.collectionComplete||report.errors.length)process.exitCode=1;
}catch(error){report.failure=authenticated?String(error):'Deployment/authentication preflight failed; no credentialed details recorded.';process.exitCode=1;}
finally{
 await browser?.close();
 if(started)execFileSync('docker',[...compose,'stop','baseline'],{env,stdio:'inherit',timeout:120000});
 await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({kind:'gitlab-compatibility',side,output:out,collectionComplete:report.collectionComplete??false,classification:null}));
}
