import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareFootnoteDeployment, verifyFootnoteMount, probeFootnoteCache} from './verify-gitlab-footnote-rollback.mjs';
import {verifyGitLabRollback} from './verify-gitlab-editor-rollback.mjs';
import {buildIdentityError, describeBuild, observeEditorBuild} from '../integrations/gitlab/testing/build-identity.mjs';
import {chromium,firefox,webkit,expect} from '@playwright/test';
import {readGitLabAuditCredential} from './gitlab-audit-credentials.mjs';
import {waitForGitLabDeployment} from './gitlab-deployment-readiness.mjs';
import {runGitLabAccessCompatibility} from './audit-gitlab-compatibility-access.mjs';
import {runGitLabReconnectCompatibility} from './audit-gitlab-compatibility-reconnect.mjs';
import {runGitLabQuickSaveCompatibility} from './audit-gitlab-compatibility-quick-save.mjs';
import {runGitLabComposerCompatibility} from './audit-gitlab-compatibility-composers.mjs';
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
const browserName=process.argv.includes('--browser')?value('--browser'):'chromium';
const browsers = {chromium, firefox, webkit};
if (!Object.hasOwn(browsers,browserName)) throw new Error('Use --browser chromium, firefox or webkit.');
const browserType = browsers[browserName];
const side=value('--editor'),runId=value('--run-id'),attempt=process.argv.includes('--attempt')?Number(value('--attempt')):1;
if(!['suggestions','deletions','reviews','stale-reviews','relocated-reviews','concurrent-reviews','clipboard','partial','crossblock','wrapped','paint','grid','merged-grid','tasks','task-recovery','task-menu','task-conversion','task-containers','conflicts','access','access-removal','composers','quick-save','reconnect','offline-conflict','concurrent-issues'].includes(suite)||!['original','fountain'].includes(side)||!process.argv.includes('--run-id')||!/^[a-z0-9][a-z0-9-]{0,60}$/u.test(runId)||!Number.isSafeInteger(attempt)||attempt<1||attempt>99)
 throw new Error('Usage: --editor original|fountain --run-id safe-id [--attempt 1..99] [--verify-rollback] [--browser chromium|firefox|webkit] [--suite suggestions|deletions|reviews|stale-reviews|relocated-reviews|concurrent-reviews|clipboard|partial|crossblock|wrapped|paint|grid|merged-grid|tasks|task-recovery|task-menu|task-conversion|task-containers|conflicts|access|access-removal|composers|quick-save|reconnect|offline-conflict|concurrent-issues]');
const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(root,'artifacts/gitlab-compatibility',runId,`${side}-${attempt}`);
await mkdir(resolve(out,'..'),{recursive:true});await mkdir(out);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fixturePath=`integrations/gitlab/fixtures/compatibility-${suite}.json`;
const fixtureBytes=await readFile(resolve(root,fixturePath)),fixture=JSON.parse(fixtureBytes);
const pin=JSON.parse(await readFile(resolve(root,'integrations/gitlab/runtime/upstream.json')));
const compose=['compose','-f',resolve(root,'integrations/gitlab/runtime/compose.yaml')],env={...process.env};
const pumaThreads = env.FOUNTAIN_GITLAB_PUMA_THREADS ?? '4';
if (!['2','4'].includes(pumaThreads)) throw new Error('Use 2 or 4 Puma threads for the pinned local comparison.');
const expectedBuild={gitlabVersion:pin.version,gitlabCommit:pin.commit,image:pin.image};
if(side==='fountain'){
 const install=JSON.parse(await readFile(resolve(root,'artifacts/gitlab-native-browser-install/install.json')));
 const build=JSON.parse(await readFile(resolve(root,'artifacts/gitlab-native-runtime/build.json')));
 if(install.restored||install.revision!==pin.commit)throw new Error('No matching installed native candidate.');
 if(install.nativeRuntime.sha256!==build.sha256||install.nativeRuntime.parentRevision!==build.parentRevision||
    install.nativeRuntime.packageVersion!==build.packageVersion||!install.integrationSHA256)throw new Error('Reinstall the exact Fountain build before comparing.');
 Object.assign(expectedBuild,{packageVersion:build.packageVersion,fountainRevision:build.parentRevision,runtimeSHA256:build.sha256,integrationSHA256:install.integrationSHA256});
 for(const [path,expected] of Object.entries(build.inputs))if(hash(await readFile(resolve(root,path)))!==expected)throw new Error('Stale native runtime input: '+path);
 for(const [path,expected] of Object.entries(install.files))if(hash(await readFile(resolve(install.source,path)))!==expected)throw new Error('Changed installed native source: '+path);
 env.FOUNTAIN_GITLAB_FRONTEND_ASSETS=resolve(install.source,'public/assets/webpack');
 compose.push('-f',resolve(root,'integrations/gitlab/runtime/compose.frontend.yaml'));
}
const checkFootnotes = process.argv.includes('--footnote-cache');
if (checkFootnotes && (suite !== 'composers' || (side === 'original' && !process.argv.includes('--verify-rollback'))))
 throw new Error('Use --footnote-cache for the Fountain composers deployment followed by original --verify-rollback.');
const filter = checkFootnotes ? await prepareFootnoteDeployment({root,pin,side,compose,env}) : null;
const docker=(...args)=>execFileSync('docker',args,{env,encoding:'utf8',timeout:120000,stdio:['ignore','pipe','pipe']});
const containerName='fountain-gitlab-integration-baseline-1';
const prior=JSON.parse(docker('inspect',containerName))[0];
if(prior.State.Running||prior.Config.Labels['com.docker.compose.project']!=='fountain-gitlab-integration'||prior.Config.Image!==pin.image)
 throw new Error('Stop the known isolated task deployment before switching editor modes.');
let rollbackCandidate;
if(process.argv.includes('--verify-rollback')){
 if(side!=='original'||suite!=='composers')throw new Error('Rollback verification requires the stock composers run after its matching native run.');
 rollbackCandidate=JSON.parse(await readFile(resolve(out,'..','fountain-'+attempt,'report.json')));
 if (Boolean(rollbackCandidate.footnoteCache) !== checkFootnotes) throw new Error('Use the same cache rollback profile as the candidate.');
 if (filter) {
   verifyFootnoteMount(prior.Mounts,filter,true);
   if (!rollbackCandidate.footnoteCache.completed || rollbackCandidate.deployment.footnoteFilter !== filter.patched)
     throw new Error('The candidate footnote deployment or cache observation is incomplete.');
 }
 const previousMount=prior.Mounts.find(m=>m.Destination==='/opt/gitlab/embedded/service/gitlab-rails/public/assets/webpack');
 if(buildIdentityError(rollbackCandidate)||!rollbackCandidate.collectionComplete||!previousMount||
    previousMount.RW||previousMount.Source!==rollbackCandidate.deployment.assetMount[0].source)
   throw new Error('Rollback requires the previously verified, stopped Fountain deployment.');
}
let browser,started=false,authenticated=false;
const report={formatVersion:2,buildIdentity:{side,expected:expectedBuild,observed:null},runId,attempt,side,scope:'Matched original GitLab/Fountain UI observations, not automatic superiority claims.',
 suite,rollbackRequested:Boolean(rollbackCandidate),fixturePath,fixtureHash:hash(fixtureBytes),fixture,observations:[],errors:[],classification:null,
 harnessHashes:Object.fromEntries(await Promise.all(['scripts/run-gitlab-compatibility.mjs','scripts/verify-gitlab-editor-rollback.mjs','scripts/verify-gitlab-footnote-rollback.mjs','integrations/gitlab/testing/save-gesture.mjs','integrations/gitlab/testing/build-identity.mjs','scripts/audit-gitlab-compatibility-composers.mjs','scripts/audit-gitlab-compatibility-quick-save.mjs','scripts/audit-gitlab-compatibility-reconnect.mjs','scripts/audit-gitlab-compatibility-access.mjs','scripts/audit-gitlab-offline-conflict.mjs','scripts/audit-gitlab-simultaneous-issues.mjs','scripts/audit-gitlab-compatibility-conflicts.mjs','scripts/audit-gitlab-compatibility-suggestions.mjs','scripts/audit-gitlab-concurrent-review.mjs','scripts/gitlab-audit-member.mjs','scripts/audit-gitlab-compatibility-clipboard.mjs','scripts/audit-gitlab-compatibility-partial.mjs','scripts/audit-gitlab-compatibility-paint.mjs','scripts/audit-gitlab-compatibility-grid.mjs','scripts/audit-gitlab-compatibility-tasks.mjs','scripts/audit-gitlab-compatibility-task-recovery.mjs','scripts/gitlab-deployment-readiness.mjs','scripts/audit-gitlab-compatibility-task-menu.mjs','scripts/audit-gitlab-compatibility-task-conversion.mjs'].map(async path=>[path,hash(await readFile(resolve(root,path)))])))};
try{
 started=true;execFileSync('docker',[...compose,'up','-d','baseline'],{env,stdio:'inherit',timeout:120000});
 const deployment=JSON.parse(docker('inspect',containerName))[0];
 if(deployment.Config.Image!==pin.image||deployment.Config.Labels['com.docker.compose.project']!=='fountain-gitlab-integration')throw new Error('Wrong live deployment');
 const assetTarget='/opt/gitlab/embedded/service/gitlab-rails/public/assets/webpack';
 const assets=deployment.Mounts.filter(mount=>mount.Destination===assetTarget);
 if(side==='original'?assets.length!==0:assets.length!==1||assets[0].RW)throw new Error('Wrong editor asset mount');
 if (filter) verifyFootnoteMount(deployment.Mounts,filter,side==='fountain');
 const backendMounts=deployment.Mounts.filter(mount=>mount.Destination!==assetTarget && mount.Destination!==filter?.destination).map(mount=>({name:mount.Name,destination:mount.Destination,type:mount.Type})).sort((a,b)=>a.destination.localeCompare(b.destination));
 if(backendMounts.length!==3||backendMounts.some(mount=>mount.type!=='volume'||!mount.name.startsWith('fountain-gitlab-integration_baseline-')))throw new Error('Unexpected backend/repair mount');
 report.deployment={image:deployment.Config.Image,imageId:deployment.Image,backendMounts,assetMount:assets.map(mount=>({source:mount.Source,readOnly:!mount.RW})),
 backendEnvironmentHash:hash(deployment.Config.Env.filter(item=>!item.startsWith('ENABLE_RSPACK=')).sort().join('\n')),
 assetSelector:deployment.Config.Env.find(item=>item.startsWith('ENABLE_RSPACK='))??'packaged-default',cpus:deployment.HostConfig.NanoCpus,memory:deployment.HostConfig.Memory};
 const credential=readGitLabAuditCredential(args=>docker('exec','-i',containerName,...args));
 if(!credential)throw new Error('No isolated task credential.');
 browser=await browserType.launch();const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1,locale:'en-US',timezoneId:'UTC'});
 const permissions=['clipboard','partial','crossblock','wrapped','grid','merged-grid'].includes(suite)?['clipboard-read','clipboard-write']:[];
 if(permissions.length)await context.grantPermissions(permissions,{origin:'http://127.0.0.1:5080'});
 const page=await context.newPage();report.browser={engine:browser.browserType().name(),version:browser.version(),viewport:{width:1280,height:900},deviceScaleFactor:1,locale:'en-US',timezone:'UTC',platform:process.platform,arch:process.arch,permissions};
 report.startup=[];
 await waitForGitLabDeployment({readState:()=>JSON.parse(docker('inspect','--format','{{json .State}}',containerName)),
  probe:async()=>(await page.request.get('http://127.0.0.1:5080/users/sign_in',{timeout:5000})).status(),
  observe:state=>report.startup.push(state)});
 if (filter) {
   const digest = docker('exec',containerName,'sha256sum',filter.destination).split(/\s/u)[0];
   expect(digest).toBe(side==='fountain'?filter.patched:filter.original);
   report.deployment.footnoteFilter=digest;
 }
 const pumaConfig = docker('exec',containerName,'cat','/var/opt/gitlab/gitlab-rails/etc/puma.rb');
 const threads = /^threads (\d+), (\d+)$/mu.exec(pumaConfig);
 const workers = /^workers (\d+)$/mu.exec(pumaConfig);
 if (threads?.[1]!=='2' || threads[2]!==pumaThreads || workers?.[1]!=='0') throw new Error('The configured GitLab Puma concurrency differs from the selected profile.');
 report.deployment.puma = {minThreads:2,maxThreads:Number(pumaThreads),workers:0};
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
 report.buildIdentity=await observeEditorBuild({page,project,request,expected:expectedBuild,report,readDeployedScripts:paths=>{
  const prefix='/opt/gitlab/embedded/service/gitlab-rails/public';
  if(!paths.length)return new Map();
  return new Map(docker('exec',containerName,'sha256sum','--',...paths.map(path=>prefix+path)).trim().split('\n').map(line=>[line.slice(66+prefix.length),line.slice(0,64)]));
 }});
 const identityError=buildIdentityError(report);
 if(identityError)throw new Error('Build identity preflight failed: '+identityError);
 console.log(describeBuild(report));
 page.on('pageerror',error=>report.errors.push(error.message));
 report.observations=await (suite==='reconnect'?runGitLabReconnectCompatibility:suite==='quick-save'?runGitLabQuickSaveCompatibility:suite==='composers'?runGitLabComposerCompatibility:['access','access-removal','offline-conflict','concurrent-issues'].includes(suite)?runGitLabAccessCompatibility:suite==='conflicts'?runGitLabConflictCompatibility:['task-conversion','task-containers'].includes(suite)?runGitLabTaskConversionCompatibility:suite==='task-menu'?runGitLabTaskMenuCompatibility:suite==='task-recovery'?runGitLabTaskRecoveryCompatibility:suite==='tasks'?runGitLabTaskCompatibility:['grid','merged-grid'].includes(suite)?runGitLabGridClipboardCompatibility:suite==='paint'?runGitLabPaintDiagnostic:['partial','crossblock','wrapped'].includes(suite)?runGitLabPartialClipboardCompatibility:suite==='clipboard'?runGitLabClipboardCompatibility:runGitLabSuggestionCompatibility)({side,runId:runId+'-a'+attempt,page,request,project,fixture,output:out,onProgress:detail=>console.log(JSON.stringify({kind:'gitlab-compatibility',...detail}))});
 report.collectionComplete=report.observations.every(item=>item.status==='observed');
 if(filter && report.collectionComplete) await probeFootnoteCache({report,candidate:rollbackCandidate,page,project,request,output:out,container:containerName});
 if(rollbackCandidate && report.collectionComplete) {
  report.rollback=await verifyGitLabRollback({candidate:rollbackCandidate,report,page,project,request,output:out});
  console.log(JSON.stringify({kind:'compiled-frontend-rollback',passed:report.rollback.passed,records:report.rollback.records.length}));
 }
 if(!report.collectionComplete||report.errors.length||(rollbackCandidate&&!report.rollback?.passed))process.exitCode=1;
}catch(error){report.collectionComplete=false;report.failure=authenticated?String(error):'Deployment/authentication preflight failed; no credentialed details recorded.';process.exitCode=1;}
finally{
 await browser?.close();
 if(started)execFileSync('docker',[...compose,'stop','baseline'],{env,stdio:'inherit',timeout:120000});
 await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({kind:'gitlab-compatibility',side,output:out,collectionComplete:report.collectionComplete??false,classification:null}));
}
