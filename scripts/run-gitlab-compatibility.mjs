import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareFootnoteDeployment, verifyFootnoteMount, probeFootnoteCache} from './verify-gitlab-footnote-rollback.mjs';
import {verifyGitLabRestart} from './verify-gitlab-restart.mjs';
import {verifySuggestionHistoryRollback} from './verify-gitlab-suggestion-history-rollback.mjs';
import {observePage} from './gitlab-audit-editor.mjs';
import {verifyGitLabRollback} from './verify-gitlab-editor-rollback.mjs';
import {buildIdentityError, describeBuild, observeEditorBuild, preparedRollbackTree} from '../integrations/gitlab/testing/build-identity.mjs';
import {chromium,firefox,webkit,expect} from '@playwright/test';
import {readGitLabAuditCredential} from './gitlab-audit-credentials.mjs';
import {loggerStartupFailure,waitForGitLabDeployment} from './gitlab-deployment-readiness.mjs';
import {runGitLabAccessCompatibility} from './audit-gitlab-compatibility-access.mjs';
import {runGitLabReconnectCompatibility} from './audit-gitlab-compatibility-reconnect.mjs';
import {verifyWikiRollback} from './verify-gitlab-wiki-rollback.mjs';
import {runWikiHistory} from './audit-gitlab-wiki-history.mjs';
import {runGitLabQuickSaveCompatibility} from './audit-gitlab-compatibility-quick-save.mjs';
import {runGitLabMergeRequestCreation} from './audit-gitlab-mr-create.mjs';
import {runGitLabBoardCompatibility} from './audit-gitlab-issue-board.mjs';
import {runGitLabSavedReplyCompatibility} from './audit-gitlab-saved-replies.mjs';
import {runGitLabComposerCompatibility} from './audit-gitlab-compatibility-composers.mjs';
import {runGitLabConflictCompatibility} from './audit-gitlab-compatibility-conflicts.mjs';
import {runGitLabTaskConversionCompatibility} from './audit-gitlab-compatibility-task-conversion.mjs';
import {runGitLabTaskMenuCompatibility} from './audit-gitlab-compatibility-task-menu.mjs';
import {runGitLabTaskRecoveryCompatibility} from './audit-gitlab-compatibility-task-recovery.mjs';
import {runGitLabTaskCompatibility} from './audit-gitlab-compatibility-tasks.mjs';
import {runWikiCollaboration} from './audit-gitlab-wiki-collaboration.mjs';
import {runCustomLabel} from './audit-gitlab-custom-label.mjs';
import {runFootnoteLabels} from './audit-gitlab-footnote-labels.mjs';
import {runLinkedImage} from './audit-gitlab-linked-image.mjs';
import {runContents} from './audit-gitlab-contents.mjs';
import {runTableAuthoring} from './audit-gitlab-table-authoring.mjs';
import {runWriterImport} from './audit-gitlab-writer-import.mjs';
import {runGitLabGridClipboardCompatibility} from './audit-gitlab-compatibility-grid.mjs';
import {runGitLabPaintDiagnostic} from './audit-gitlab-compatibility-paint.mjs';
import {runGitLabPartialClipboardCompatibility} from './audit-gitlab-compatibility-partial.mjs';
import {runGitLabClipboardCompatibility} from './audit-gitlab-compatibility-clipboard.mjs';
import {runGitLabSuggestionCompatibility,runRecordedGitLabBatch} from './audit-gitlab-compatibility-suggestions.mjs';
if(process.platform!=='linux')throw new Error('Run beside the isolated Linux Docker engine.');
const value=flag=>process.argv[process.argv.indexOf(flag)+1];
const suite=process.argv.includes('--suite')?value('--suite'):'suggestions';
const browserName=process.argv.includes('--browser')?value('--browser'):'chromium';
const browsers = {chromium, firefox, webkit};
if (!Object.hasOwn(browsers,browserName)) throw new Error('Use --browser chromium, firefox or webkit.');
const browserType = browsers[browserName];
const side=value('--editor'),runId=value('--run-id'),attempt=process.argv.includes('--attempt')?Number(value('--attempt')):1;
if(!['suggestions','review-history','batch-reviews','multi-file-reviews','review-invalidation','overlap-reviews','reviewer-handoff','deletions','reviews','stale-reviews','relocated-reviews','concurrent-reviews','clipboard','partial','crossblock','wrapped','paint','grid','merged-grid','header-grid','writer-import','table-authoring','contents','contents-authoring','contents-handover','linked-image','footnote-labels','custom-label','tasks','task-recovery','task-menu','task-conversion','task-containers','conflicts','access','access-removal','composers','saved-replies','board-issues','mr-create','mr-create-member','mr-review-handover','quick-save','reconnect','offline-conflict','concurrent-issues','wiki-history','wiki-restore-conflict','wiki-restore-authors','wiki-rename','wiki-titles','wiki-collaboration'].includes(suite)||!['original','fountain','prepared'].includes(side)||!process.argv.includes('--run-id')||!/^[a-z0-9][a-z0-9-]{0,60}$/u.test(runId)||!Number.isSafeInteger(attempt)||attempt<1||attempt>99)
 throw new Error('Usage: --editor original|fountain|prepared --run-id safe-id [--attempt 1..99] [--verify-rollback] [--verify-restart] [--browser chromium|firefox|webkit] [--suite suggestions|review-history|batch-reviews|multi-file-reviews|review-invalidation|overlap-reviews|reviewer-handoff|deletions|reviews|stale-reviews|relocated-reviews|concurrent-reviews|clipboard|partial|crossblock|wrapped|paint|grid|merged-grid|header-grid|writer-import|table-authoring|contents|contents-authoring|contents-handover|linked-image|footnote-labels|custom-label|tasks|task-recovery|task-menu|task-conversion|task-containers|conflicts|access|access-removal|composers|saved-replies|board-issues|mr-create|mr-create-member|mr-review-handover|quick-save|reconnect|offline-conflict|concurrent-issues|wiki-history|wiki-restore-conflict|wiki-restore-authors|wiki-rename|wiki-titles|wiki-collaboration]');
const writerPaste = process.argv.includes('--writer-paste');
const writerImport = suite === 'writer-import';
if (writerPaste || writerImport) {
  if ((writerPaste && suite !== 'header-grid') || browserName !== 'chromium') throw new Error('Use --writer-paste with --suite header-grid --browser chromium.');
  const display = /^:(\d+)(?:\.\d+)?$/.exec(process.env.DISPLAY ?? '');
  const pid = display && (await readFile('/tmp/.X' + display[1] + '-lock','utf8')).trim();
  if (!pid || !/^\d+$/.test(pid) || (await readFile('/proc/' + pid + '/comm','utf8')).trim() !== 'Xvfb')
    throw new Error('Run the Writer test under xvfb-run with a private display and clipboard.');
}
const mixedWiki = process.argv.includes('--verify-mixed-wiki');
if (mixedWiki && (suite !== 'wiki-collaboration' || side !== 'fountain' || process.argv.includes('--verify-draft-rollback')))
  throw new Error('Use --verify-mixed-wiki with --suite wiki-collaboration --editor fountain.');
const draftRollbackRequested = mixedWiki || process.argv.includes('--verify-draft-rollback');
if (draftRollbackRequested && (!['mr-create-member','wiki-collaboration'].includes(suite) || side !== 'fountain'))
  throw new Error('Use --verify-draft-rollback with a Fountain member MR or live wiki workflow.');
const preparedRollback = side === 'prepared';
if (preparedRollback && (suite !== 'composers' || !process.argv.includes('--verify-rollback') ||
    !process.argv.includes('--prepared-source') || !isAbsolute(value('--prepared-source')) ||
    ['--footnote-cache','--suggestion-history','--verify-restart'].some(flag => process.argv.includes(flag))))
  throw new Error('The prepared Tiptap build requires --suite composers --verify-rollback --prepared-source /absolute/gitlab-checkout.');
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
 if ((suite === 'custom-label') !== (install.hostProfile === 'custom-label')) throw new Error('The custom-label suite requires its dedicated host profile and other suites require the standard build.');
 if(install.restored||install.revision!==pin.commit)throw new Error('No matching installed native candidate.');
 if(install.nativeRuntime.sha256!==build.sha256||install.nativeRuntime.parentRevision!==build.parentRevision||
    install.nativeRuntime.packageVersion!==build.packageVersion||!install.integrationSHA256)throw new Error('Reinstall the exact Fountain build before comparing.');
 Object.assign(expectedBuild,{packageVersion:build.packageVersion,fountainRevision:build.parentRevision,runtimeSHA256:build.sha256,integrationSHA256:install.integrationSHA256});
 for(const [path,expected] of Object.entries(build.inputs))if(hash(await readFile(resolve(root,path)))!==expected)throw new Error('Stale native runtime input: '+path);
 for(const [path,expected] of Object.entries(install.files))if(hash(await readFile(resolve(install.source,path)))!==expected)throw new Error('Changed installed native source: '+path);
 env.FOUNTAIN_GITLAB_FRONTEND_ASSETS=resolve(install.source,'public/assets/webpack');
 compose.push('-f',resolve(root,'integrations/gitlab/runtime/compose.frontend.yaml'));
}
if (preparedRollback) {
 const source = resolve(value('--prepared-source'));
 const git = (...args) => execFileSync('git',['-C',source,...args],{encoding:'utf8'}).trim();
 const sourceTree = git('write-tree');
 if (source !== git('rev-parse','--show-toplevel') || git('rev-parse','HEAD') !== pin.commit ||
     sourceTree !== preparedRollbackTree || git('diff','--name-only') || git('ls-files','--others','--exclude-standard'))
   throw new Error('The prepared rollback requires the pinned GitLab checkout with all staged rollback patches.');
 const assets = resolve(source,'public/assets/webpack');
 expectedBuild.sourceTree = sourceTree;
 expectedBuild.rspackManifestSHA256 = hash(await readFile(resolve(assets,'manifest.rspack.json')));
 env.FOUNTAIN_GITLAB_FRONTEND_ASSETS = assets;
 compose.push('-f',resolve(root,'integrations/gitlab/runtime/compose.frontend.yaml'));
}
const restartRequested = process.argv.includes('--verify-restart');
if (restartRequested && suite !== 'composers') throw new Error('Restart verification requires saved composer records.');
const historyProfile = process.argv.includes('--suggestion-history');
const rollbackFrom = process.argv.includes('--history-rollback-from') ? value('--history-rollback-from') : undefined;
let previousHistory;
if (rollbackFrom !== undefined) {
  const parts = /^([a-z0-9][a-z0-9-]{0,60}):([1-9][0-9]?)(?:,([1-9][0-9]?))?$/u.exec(rollbackFrom);
  if (!parts || !['review-history','wiki-history','wiki-restore-conflict','wiki-restore-authors','wiki-rename','wiki-titles'].includes(suite) || historyProfile || process.argv.includes('--wiki-restore') || side !== 'original') throw new Error('Use --history-rollback-from run-id:attempt on a packaged stock history deployment.');
  previousHistory = {directory: resolve(root, 'artifacts/gitlab-compatibility', parts[1]), attempts: {original: Number(parts[2]), fountain: Number(parts[3] ?? parts[2])}};
}
const wikiRestore = process.argv.includes('--wiki-restore');
const wikiSuite = ['wiki-history', 'wiki-restore-conflict', 'wiki-restore-authors', 'wiki-rename', 'wiki-titles'].includes(suite);
if (wikiRestore && ((!wikiSuite && suite !== 'wiki-collaboration') || draftRollbackRequested))
  throw new Error('Use --wiki-restore with a wiki workflow on a fixed deployment.');
const serverProfile = wikiRestore ? 'wiki-restore' : 'suggestion-history';
const serviceFiles = wikiRestore ? ['app/controllers/concerns/wiki_actions.rb'] : ['app/services/notes/update_service.rb','app/services/suggestions/create_service.rb'];
const historyDestinations = new Map();
let historyReceipt;
if (historyProfile || wikiRestore) {
  if (historyProfile && !['review-history','suggestions'].includes(suite)) throw new Error('Use the suggestion-history backend with a review workflow.');
  const patchSHA256 = hash(await readFile(resolve(root, 'integrations/gitlab/patches/gitlab-19.5.3-' + serverProfile + '.patch')));
  const directory = resolve(root, 'artifacts/gitlab-' + serverProfile, patchSHA256);
  historyReceipt = JSON.parse(await readFile(resolve(directory, 'build.json')));
  if (historyReceipt.revision !== pin.commit || historyReceipt.patchSHA256 !== patchSHA256) throw new Error('Prepare the pinned history overlay again.');
  for (const file of serviceFiles) {
    const source = resolve(directory, file), destination = '/opt/gitlab/embedded/service/gitlab-rails/' + file;
    if (hash(await readFile(source)) !== historyReceipt.files[file]?.patched) throw new Error('Stale suggestion-history service: ' + file);
    historyDestinations.set(destination, source);
  }
  env[wikiRestore ? 'FOUNTAIN_GITLAB_WIKI_DIR' : 'FOUNTAIN_GITLAB_HISTORY_DIR'] = directory;
  compose.push('-f', resolve(root,'integrations/gitlab/runtime/compose.' + serverProfile + '.yaml'));
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
const footnoteHandover = process.argv.includes('--footnote-handover');
if (footnoteHandover && suite !== 'footnote-labels') throw new Error('Use --footnote-handover with --suite footnote-labels.');
let mrHandoverFrom, mrHandoverReceipt;
if ((footnoteHandover || ['mr-review-handover','contents-handover'].includes(suite)) && side === 'original') {
  const bytes = await readFile(resolve(out,'..','fountain-'+attempt,'report.json'));
  mrHandoverFrom = JSON.parse(bytes);
  const oldMount = prior.Mounts.find(m => m.Destination === '/opt/gitlab/embedded/service/gitlab-rails/public/assets/webpack');
  if (!oldMount || oldMount.RW || oldMount.Source !== mrHandoverFrom.deployment?.assetMount?.[0]?.source ||
      mrHandoverFrom.side !== 'fountain' || mrHandoverFrom.suite !== suite || mrHandoverFrom.runId !== runId ||
      mrHandoverFrom.attempt !== attempt || mrHandoverFrom.fixtureHash !== hash(fixtureBytes) || buildIdentityError(mrHandoverFrom) ||
      !mrHandoverFrom.collectionComplete || mrHandoverFrom.errors?.length || mrHandoverFrom.observations[0]?.pageErrors?.length ||
      (suite === 'mr-review-handover' ? !mrHandoverFrom.observations[0]?.pending?.id :
        !Number.isSafeInteger(mrHandoverFrom.observations[0]?.iid) || (footnoteHandover
          ? mrHandoverFrom.observations[0]?.saved !== fixture.cases[0].edit + fixture.cases[0].source
          : !mrHandoverFrom.observations[0]?.proseSaved)))
    throw new Error('The stock handover needs the verified Fountain record and its previously mounted frontend.');
  mrHandoverReceipt = {path:'../fountain-'+attempt+'/report.json', sha256:hash(bytes), build:mrHandoverFrom.buildIdentity.expected};
}
let rollbackCandidate;
if(process.argv.includes('--verify-rollback')){
 if((side!=='original'&&!preparedRollback)||suite!=='composers')throw new Error('Rollback verification requires the stock composers run after its matching native run.');
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
const report={formatVersion:2,buildIdentity:{side,expected:expectedBuild,observed:null},runId,attempt,side,scope:preparedRollback?'Opt-in prepared Tiptap rollback deployment.':'Matched original GitLab/Fountain UI observations, not automatic superiority claims.',
 suite,restartRequested,draftRollbackRequested,mixedWiki,writerPaste,rollbackRequested:Boolean(rollbackCandidate),fixturePath,fixtureHash:hash(fixtureBytes),fixture,observations:[],errors:[],classification:null,
 harnessHashes:Object.fromEntries(await Promise.all(['scripts/run-gitlab-compatibility.mjs','scripts/verify-gitlab-editor-rollback.mjs','scripts/verify-gitlab-suggestion-history-rollback.mjs','scripts/verify-gitlab-wiki-rollback.mjs','scripts/verify-gitlab-restart.mjs','scripts/verify-gitlab-footnote-rollback.mjs','integrations/gitlab/testing/save-gesture.mjs','integrations/gitlab/testing/build-identity.mjs','scripts/audit-gitlab-compatibility-composers.mjs','scripts/audit-gitlab-saved-replies.mjs','scripts/audit-gitlab-issue-board.mjs','scripts/audit-gitlab-mr-create.mjs','scripts/verify-gitlab-mr-handover.mjs','integrations/gitlab/testing/observe-mr-navigation.mjs','scripts/gitlab-audit-editor.mjs','scripts/audit-gitlab-wiki-history.mjs','scripts/audit-gitlab-wiki-rename.mjs','scripts/audit-gitlab-compatibility-quick-save.mjs','scripts/audit-gitlab-compatibility-reconnect.mjs','scripts/audit-gitlab-compatibility-access.mjs','scripts/audit-gitlab-offline-conflict.mjs','scripts/audit-gitlab-simultaneous-issues.mjs','scripts/audit-gitlab-compatibility-conflicts.mjs','scripts/audit-gitlab-compatibility-suggestions.mjs','scripts/audit-gitlab-concurrent-review.mjs','scripts/audit-gitlab-batch-review.mjs','scripts/audit-gitlab-reviewer-handoff.mjs','scripts/audit-gitlab-suggestion-history.mjs','scripts/gitlab-audit-member.mjs','scripts/audit-gitlab-compatibility-clipboard.mjs','scripts/audit-gitlab-compatibility-partial.mjs','scripts/audit-gitlab-compatibility-paint.mjs','scripts/audit-gitlab-compatibility-grid.mjs',...(writerPaste || writerImport ? ['scripts/audit-gitlab-writer-paste.py'] : []),...(suite === 'wiki-collaboration' ? ['scripts/audit-gitlab-wiki-collaboration.mjs'] : []),...(suite === 'custom-label' ? ['scripts/audit-gitlab-custom-label.mjs','integrations/gitlab/testing/issue_label_host.js'] : []),...(suite === 'footnote-labels' ? ['scripts/audit-gitlab-footnote-labels.mjs'] : []),...(suite === 'linked-image' ? ['scripts/audit-gitlab-linked-image.mjs'] : []),...(['contents','contents-authoring','contents-handover'].includes(suite) ? ['scripts/audit-gitlab-contents.mjs'] : []),...(suite === 'table-authoring' ? ['scripts/audit-gitlab-table-authoring.mjs'] : []),...(writerImport ? ['scripts/audit-gitlab-writer-import.mjs'] : []),'scripts/audit-gitlab-compatibility-tasks.mjs','scripts/audit-gitlab-compatibility-task-recovery.mjs','scripts/gitlab-deployment-readiness.mjs','scripts/audit-gitlab-compatibility-task-menu.mjs','scripts/audit-gitlab-compatibility-task-conversion.mjs'].map(async path=>[path,hash(await readFile(resolve(root,path)))])))};
try{
 started=true;execFileSync('docker',[...compose,'up','-d','baseline'],{env,stdio:'inherit',timeout:120000});
 const deployment=JSON.parse(docker('inspect',containerName))[0];
 if(deployment.Config.Image!==pin.image||deployment.Config.Labels['com.docker.compose.project']!=='fountain-gitlab-integration')throw new Error('Wrong live deployment');
 const assetTarget='/opt/gitlab/embedded/service/gitlab-rails/public/assets/webpack';
 const assets=deployment.Mounts.filter(mount=>mount.Destination===assetTarget);
 if(side==='original'?assets.length!==0:assets.length!==1||assets[0].RW||assets[0].Source!==env.FOUNTAIN_GITLAB_FRONTEND_ASSETS)throw new Error('Wrong editor asset mount');
 if (filter) verifyFootnoteMount(deployment.Mounts,filter,side==='fountain');
 for (const [destination, source] of historyDestinations) {
   const mounts = deployment.Mounts.filter(m => m.Destination === destination);
   if (mounts.length !== 1 || mounts[0].Type !== 'bind' || mounts[0].RW || mounts[0].Source !== source)
     throw new Error('Incorrect review-history service mount: ' + destination);
 }
 const backendMounts=deployment.Mounts.filter(mount=>!historyDestinations.has(mount.Destination) && mount.Destination!==assetTarget && mount.Destination!==filter?.destination).map(mount=>({name:mount.Name,destination:mount.Destination,type:mount.Type})).sort((a,b)=>a.destination.localeCompare(b.destination));
 if(backendMounts.length!==3||backendMounts.some(mount=>mount.type!=='volume'||!mount.name.startsWith('fountain-gitlab-integration_baseline-')))throw new Error('Unexpected backend/repair mount');
 report.deployment={image:deployment.Config.Image,imageId:deployment.Image,backendMounts,assetMount:assets.map(mount=>({source:mount.Source,readOnly:!mount.RW})),
 backendEnvironmentHash:hash(deployment.Config.Env.filter(item=>!item.startsWith('ENABLE_RSPACK=')).sort().join('\n')),
 assetSelector:deployment.Config.Env.find(item=>item.startsWith('ENABLE_RSPACK='))??'packaged-default',cpus:deployment.HostConfig.NanoCpus,memory:deployment.HostConfig.Memory};
 const credential=readGitLabAuditCredential(args=>docker('exec','-i',containerName,...args));
 if(!credential)throw new Error('No isolated task credential.');
 browser=await browserType.launch({headless:!(writerPaste || writerImport)});const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1,locale:'en-US',timezoneId:'UTC'});
 const permissions=['clipboard','partial','crossblock','wrapped','grid','merged-grid','header-grid'].includes(suite)?['clipboard-read','clipboard-write']:[];
 if(permissions.length)await context.grantPermissions(permissions,{origin:'http://127.0.0.1:5080'});
 const page=await context.newPage();report.browser={engine:browser.browserType().name(),version:browser.version(),viewport:{width:1280,height:900},deviceScaleFactor:1,locale:'en-US',timezone:'UTC',platform:process.platform,arch:process.arch,permissions};
 report.startup=[];
 const waitUntilReady = (observations,retryLoggerExit) => waitForGitLabDeployment({retryLoggerExit,readState:()=>JSON.parse(docker('inspect','--format','{{json .State}}',containerName)),
  probe:async()=>(await page.request.get('http://127.0.0.1:5080/users/sign_in',{timeout:5000})).status(),
  observe:state=>observations.push(state)});
 const waitForBoot = (receipt, containerId) => waitUntilReady(receipt.startup, state => {
   // Check the pinned container again by ID. A service restart during an acceptance case uses the ordinary read-only gate.
   const current = JSON.parse(docker('inspect',containerId))[0];
   if (current.State.StartedAt!==state.StartedAt || current.State.FinishedAt!==state.FinishedAt) return false;
   const logs = spawnSync('docker',['logs','--since',state.StartedAt,'--tail','350',containerId],
     {encoding:'utf8',timeout:10000,maxBuffer:1024*1024});
   if (logs.status!==0) return false;
   const service = loggerStartupFailure(current.State, logs.stdout+'\n'+logs.stderr);
   if (!service) return false;
   const retry = {service,containerId,startedAt:state.StartedAt,exitedAt:state.FinishedAt,exitCode:state.ExitCode};
   receipt.startupRetry = retry;
   console.log(JSON.stringify({kind:'gitlab-logger-cold-start-retry',...retry}));
   docker('start',containerId);
   return true;
 });
 await waitForBoot(report,deployment.Id);
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
 const headers = {};
 const signInAdministrator = async () => {
 try{
  await page.goto('http://127.0.0.1:5080/users/sign_in');await page.getByLabel('Username or primary email').fill('root');
  await page.getByLabel('Password',{exact:true}).fill(credential.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.waitForURL(url=>!url.pathname.includes('sign_in'));authenticated=true;
 }catch{throw new Error('Isolated sign-in failed; credentialed call log is not retained.');}
 headers['X-CSRF-Token'] = await page.locator('meta[name="csrf-token"]').getAttribute('content');
 };
 await signInAdministrator();
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
 if (suite === 'wiki-collaboration') serverPaths.push('app/channels/collaborative_editing/wiki_page_channel.rb');
 if (wikiSuite || suite === 'wiki-collaboration') serverPaths.push('app/controllers/concerns/wiki_actions.rb');
 report.backend.serverSources=docker('exec',containerName,'sha256sum',...serverPaths.map(path=>'/opt/gitlab/embedded/service/gitlab-rails/'+path)).trim().split('\n');
 if (historyProfile || wikiRestore) {
   for (const [file, digests] of Object.entries(historyReceipt.files)) {
     if (!report.backend.serverSources.includes(digests.patched+'  /opt/gitlab/embedded/service/gitlab-rails/'+file)) throw new Error('Live GitLab suggestion service digest mismatch.');
   }
   report.deployment[wikiRestore ? 'wikiRestore' : 'suggestionHistory'] = historyReceipt;
 }
 const identify = async (target = report, expected = expectedBuild) => {
 const manifests=docker('exec',containerName,'find',assetTarget,'-maxdepth','1','-name','manifest*.json').trim().split('\n').filter(Boolean);
 target.frontendManifests=manifests.length?docker('exec',containerName,'sha256sum',...manifests).trim().split('\n'):[];
 return observeEditorBuild({page,project,request,expected,report:target,observeProbe:probe=>observePage(probe,target,target.errors),readDeployedScripts:paths=>{
  const prefix='/opt/gitlab/embedded/service/gitlab-rails/public';
  if(!paths.length)return new Map();
  return new Map(docker('exec',containerName,'sha256sum','--',...paths.map(path=>prefix+path)).trim().split('\n').map(line=>[line.slice(66+prefix.length),line.slice(0,64)]));
 }});
 };
 report.buildIdentity = await identify();
 const identityError=buildIdentityError(report);
 if(identityError)throw new Error('Build identity preflight failed: '+identityError);
 console.log(describeBuild(report));
 if (mrHandoverFrom) {
   for (const [object,keys] of [[null,['harnessHashes','browser','backend']],['deployment',['imageId','backendMounts','backendEnvironmentHash']]]) {
     const left = object ? mrHandoverFrom[object] : mrHandoverFrom;
     const right = object ? report[object] : report;
     for (const key of keys) expect(right[key]).toEqual(left[key]);
   }
   if (suite === 'mr-review-handover') report.mrHandoverSource = mrHandoverReceipt;
   else if (footnoteHandover) report.footnoteHandoverSource = mrHandoverReceipt;
   else report.contentsHandoverSource = mrHandoverReceipt;
 }
 await observePage(page,report,report.errors);
 if (previousHistory && wikiSuite) await verifyWikiRollback({previous:previousHistory,report,page,project,request,output:out});
 if (previousHistory && suite === 'review-history') await verifySuggestionHistoryRollback({previous:previousHistory,report,page,project,request,output:out,readCommits: noteId => {
   if (!Number.isSafeInteger(noteId) || noteId < 1) throw new Error('Invalid saved note ID.');
   const query = "SELECT json_agg(json_build_object('id', id, 'commit', commit_id) ORDER BY relative_order) FROM suggestions WHERE note_id = " + noteId;
   return JSON.parse(docker('exec',containerName,'gitlab-psql','-d','gitlabhq_production','-XAt','-v','ON_ERROR_STOP=1','-c',query));
 }});
 const switchDraftToStock = draftRollbackRequested ? async ({wikiSlug} = {}) => {
   const inspect = () => JSON.parse(docker('inspect',containerName))[0];
   const running = inspect();
   expect(running.Id).toBe(deployment.Id);
   expect(running.State.Health?.Status).toBe('healthy');
   let roomKey;
   const roomLog = id => {
     const redis = (...args) => docker('exec',id,'gitlab-redis-cli','--raw',...args).trimEnd();
     const count = Number(redis('LLEN',roomKey));
     if (!Number.isSafeInteger(count) || count < 1 || count > 2000) throw new Error('Missing or unexpected wiki room update count: ' + count);
     const updates = redis('LRANGE',roomKey,'0','-1').split('\n');
     expect(updates).toHaveLength(count);
     return {count,sha256:hash(updates.join('\n'))};
   };
   let checkpoint;
   if (wikiSlug !== undefined) {
     if (suite !== 'wiki-collaboration' || !Number.isSafeInteger(project.id)
       || !/^[A-Za-z0-9-]+$/.test(wikiSlug) || !wikiSlug.endsWith('-fountain-' + runId + '-a' + attempt))
       throw new Error('Expected this run’s isolated wiki room.');
     roomKey = 'collaborative_editing:{wiki:Project:' + project.id + ':' + wikiSlug + '}:updates';
     checkpoint = roomLog(running.Id);
     // This single-container deployment also restarts Redis. Flush its existing room history
     // to the named data volume after the authors finish typing and before shutdown.
     expect(docker('exec',running.Id,'gitlab-redis-cli','--raw','SAVE').trim()).toBe('OK');
     expect(roomLog(running.Id)).toEqual(checkpoint);
   }
   docker('stop',running.Id);
   // Recreate only the inspected task service from its stock Compose file. Keep all named volumes.
   const stockCompose = ['compose','-f',resolve(root,'integrations/gitlab/runtime/compose.yaml')];
   docker(...stockCompose,'up','-d','baseline');
   const stock = inspect();
   expect(stock.Id).not.toBe(running.Id);
   expect(stock.Config.Labels['com.docker.compose.project']).toBe('fountain-gitlab-integration');
   expect(stock.Image).toBe(running.Image);
   expect(stock.Config.Image).toBe(pin.image);
   const volumes = stock.Mounts.map(m => ({name:m.Name,destination:m.Destination,type:m.Type})).sort((a,b)=>a.destination.localeCompare(b.destination));
   expect(volumes).toEqual(backendMounts);
   expect(stock.Config.Env.some(item => item.startsWith('ENABLE_RSPACK='))).toBe(false);
   const environmentHash = hash(stock.Config.Env.filter(item=>!item.startsWith('ENABLE_RSPACK=')).sort().join('\n'));
   expect(environmentHash).toBe(report.deployment.backendEnvironmentHash);
   const receipt = {side:'original', startup:[], errors:[], containerId:stock.Id, previousContainerId:running.Id,
     deployment:{image:stock.Config.Image,imageId:stock.Image,backendMounts:volumes,backendEnvironmentHash:environmentHash,assetMount:[]}};
   report.draftRollback = receipt;
   await waitForBoot(receipt,stock.Id);
   if (checkpoint) {
     receipt.wikiRoom = {before:checkpoint,after:roomLog(stock.Id)};
     expect(receipt.wikiRoom.after).toEqual(checkpoint);
   }
   const adminSession = await page.request.get('http://127.0.0.1:5080/api/v4/user');
   receipt.administratorSessionStatus = adminSession.status();
   if (adminSession.status() === 401) await signInAdministrator();
   else expect(adminSession.status()).toBe(200);
   receipt.backend = {version:await request('/api/v4/version')};
   receipt.buildIdentity = await identify(receipt,{gitlabVersion:pin.version,gitlabCommit:pin.commit,image:pin.image});
   expect(buildIdentityError(receipt)).toBeFalsy();
   expect(receipt.errors).toEqual([]);
   console.log(describeBuild(receipt));
 } : undefined;
 report.observations=await (['batch-reviews','multi-file-reviews','review-invalidation','overlap-reviews','reviewer-handoff'].includes(suite)?runRecordedGitLabBatch:suite==='wiki-collaboration'?runWikiCollaboration:wikiSuite?runWikiHistory:suite==='reconnect'?runGitLabReconnectCompatibility:suite==='quick-save'?runGitLabQuickSaveCompatibility:['mr-create','mr-create-member','mr-review-handover'].includes(suite)?runGitLabMergeRequestCreation:suite==='board-issues'?runGitLabBoardCompatibility:suite==='saved-replies'?runGitLabSavedReplyCompatibility:suite==='composers'?runGitLabComposerCompatibility:['access','access-removal','offline-conflict','concurrent-issues'].includes(suite)?runGitLabAccessCompatibility:suite==='conflicts'?runGitLabConflictCompatibility:['task-conversion','task-containers'].includes(suite)?runGitLabTaskConversionCompatibility:suite==='task-menu'?runGitLabTaskMenuCompatibility:suite==='task-recovery'?runGitLabTaskRecoveryCompatibility:suite==='tasks'?runGitLabTaskCompatibility:suite==='custom-label'?runCustomLabel:suite==='footnote-labels'?runFootnoteLabels:suite==='linked-image'?runLinkedImage:['contents','contents-authoring','contents-handover'].includes(suite)?runContents:suite==='table-authoring'?runTableAuthoring:writerImport?runWriterImport:['grid','merged-grid','header-grid'].includes(suite)?runGitLabGridClipboardCompatibility:suite==='paint'?runGitLabPaintDiagnostic:['partial','crossblock','wrapped'].includes(suite)?runGitLabPartialClipboardCompatibility:suite==='clipboard'?runGitLabClipboardCompatibility:runGitLabSuggestionCompatibility)({side,mrHandoverFrom,switchDraftToStock,mixedWiki,writerPaste,runId:runId+'-a'+attempt,page,request,project,fixture,output:out,onPageError:error=>report.errors.push(error),onProgress:detail=>console.log(JSON.stringify({kind:'gitlab-compatibility',...detail}))});
 report.collectionComplete=report.observations.every(item=>item.status==='observed');
 if(restartRequested && report.collectionComplete) await verifyGitLabRestart({report,project,docker,deployment,waitUntilReady,identify,page,request,output:out});
 if(filter && report.collectionComplete) await probeFootnoteCache({report,candidate:rollbackCandidate,page,project,request,output:out,container:containerName});
 if(rollbackCandidate && report.collectionComplete) {
  report.rollback=await verifyGitLabRollback({candidate:rollbackCandidate,report,page,project,request,output:out});
  console.log(JSON.stringify({kind:'compiled-frontend-rollback',passed:report.rollback.passed,records:report.rollback.records.length}));
 }
 if(!report.collectionComplete||report.errors.length||report.observations.some(item => item.pageErrors?.length)||(rollbackCandidate&&!report.rollback?.passed))process.exitCode=1;
}catch(error){report.collectionComplete=false;report.failure=authenticated?String(error):'Deployment/authentication preflight failed; no credentialed details recorded.';process.exitCode=1;}
finally{
 await browser?.close();
 if(started)execFileSync('docker',[...compose,'stop','baseline'],{env,stdio:'inherit',timeout:120000});
 await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({kind:'gitlab-compatibility',side,output:out,collectionComplete:report.collectionComplete??false,classification:null}));
}
