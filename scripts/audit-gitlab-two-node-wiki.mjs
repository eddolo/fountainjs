import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { buildIdentityError, observeEditorBuild, sha256 } from '../integrations/gitlab/testing/build-identity.mjs';
import { readGitLabAuditCredential } from './gitlab-audit-credentials.mjs';
import { prepareGitLabAuditMember } from './gitlab-audit-member.mjs';
import { observePage, openRich } from './gitlab-audit-editor.mjs';

const origin = 'http://127.0.0.1:5080';
const group = 'fountain-gitlab-integration';
const files = 'integrations/gitlab/runtime/';
const assets = '/opt/gitlab/embedded/service/gitlab-rails/public/assets/webpack';
const controller = '/opt/gitlab/embedded/service/gitlab-rails/app/controllers/concerns/wiki_actions.rb';
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));
const pin = await readJSON(files + 'upstream.json');
const install = await readJSON('artifacts/gitlab-native-browser-install/install.json');
const build = await readJSON('artifacts/gitlab-native-runtime/build.json');
const fixture = await readJSON('integrations/gitlab/fixtures/compatibility-wiki-collaboration.json');
const input = fixture.cases[0];
const id = new Date().toISOString().replace(/[^0-9]/g, '');
const args = process.argv.slice(2);
assert.ok(args.length<=1 && args.every(value=>['--rollback','--rollout'].includes(value)), 'Use --rollback or --rollout');
const direction = args[0]==='--rollout' ? 'rollout' : 'rollback';
const initialSide = direction==='rollback' ? 'fountain' : 'original';
const finalSide = direction==='rollback' ? 'original' : 'fountain';
const out = 'artifacts/gitlab-compatibility/wiki-two-nodes-' + direction + '-' + id;
await mkdir(out, {recursive:true});
const report = {direction,checks:[],nodes:[],errors:[],passed:false,fixtureSHA256:sha256(JSON.stringify(fixture)),
  harnessSHA256:sha256(await readFile(new URL(import.meta.url)))};
const docker = (...args) => execFileSync('docker', args, {encoding:'utf8',timeout:360000,maxBuffer:16*1024*1024});
const name = node => group + '-' + node + '-1';
function inspect(node) {
  const [container] = JSON.parse(docker('inspect', name(node)));
  assert.equal(container.Config.Labels['com.docker.compose.project'], group);
  assert.equal(container.Config.Labels['com.docker.compose.service'], node);
  assert.equal(container.Config.Image, pin.image);
  return container;
}
const baseline = inspect('baseline');
assert.equal(baseline.State.Health.Status, 'healthy');
const mount = (container, target) => container.Mounts.find(entry => entry.Destination === target);
const frontend = mount(baseline, assets);
assert.equal(frontend?.RW, false);
assert.equal(frontend.Source, join(install.source, 'public/assets/webpack'));
assert.equal(install.revision, pin.commit);
assert.ok(!install.restored, 'Installed frontend was restored to stock');
assert.equal(install.nativeRuntime.sha256, build.sha256);
assert.equal(install.nativeRuntime.parentRevision, build.parentRevision);
for (const [path,hash] of Object.entries(build.inputs)) assert.equal(sha256(await readFile(path)),hash,path);
for (const [path,hash] of Object.entries(install.files)) assert.equal(sha256(await readFile(join(install.source,path))),hash,path);
const wikiMount = mount(baseline, controller);
const env = {...process.env, FOUNTAIN_GITLAB_FRONTEND_ASSETS:frontend.Source};
const compose = ['compose','-f',files+'compose.yaml','-f',files+'compose.peer.yaml'];
if (wikiMount) {
  assert.equal(wikiMount.RW, false);
  const suffix = '/app/controllers/concerns/wiki_actions.rb';
  assert.ok(wikiMount.Source.endsWith(suffix));
  env.FOUNTAIN_GITLAB_WIKI_DIR = wikiMount.Source.slice(0,-suffix.length);
  compose.push('-f', files+'compose.peer-wiki-restore.yaml');
}
function deployPeer(fountain) {
  const profile = fountain ? ['-f',files+'compose.peer-frontend.yaml'] : [];
  execFileSync('docker',[...compose,...profile,'up','-d','--no-deps','--wait','--wait-timeout','300','peer'],
    {env,stdio:'inherit',timeout:340000});
}
function receipt(node, requestID) {
  assert.match(requestID, /^[A-Za-z0-9-]{12,64}$/);
  const logs = docker('exec', name(node), 'tail','-n','200','/var/log/gitlab/gitlab-workhorse/current');
  assert.ok(logs.split('\n').some(line => {try{return JSON.parse(line).correlation_id===requestID;}catch{return false;}}), 'Request missing from '+node);
  return requestID;
}
const browsers = [];
let restoreRole, restoreFlag, peerStarted = false;
try {
  peerStarted = true;
  deployPeer(initialSide==='fountain');
  const primaryBrowser = await chromium.launch();
  browsers.push(primaryBrowser);
  const peerBrowser = await chromium.launch({args:['--host-resolver-rules=MAP 127.0.0.1:5080 127.0.0.1:5081']});
  browsers.push(peerBrowser);
  report.browser = {engine:'chromium',version:primaryBrowser.version()};
  const owner = await primaryBrowser.newPage();
  await observePage(owner,report,report.errors);
  const password = readGitLabAuditCredential(args => docker('exec','-i',name('baseline'),...args)).password;
  try {
    await owner.goto(origin+'/users/sign_in');
    await owner.getByLabel('Username or primary email').fill('root');
    await owner.getByLabel('Password',{exact:true}).fill(password);
    await owner.getByRole('button',{name:'Sign in',exact:true}).click();
    await owner.waitForURL(url => !url.pathname.includes('sign_in'));
  } catch {throw new Error('Local owner sign-in failed.');}
  const token = await owner.locator('meta[name="csrf-token"]').getAttribute('content');
  const request = async (path,data,method='POST') => {
    const url = new URL(path,origin); assert.equal(url.origin,origin);
    const res = await owner.request.fetch(url.href, {headers:{'X-CSRF-Token':token},...(data?{data,method}:{})});
    assert.ok(res.ok(),method+' '+url.pathname+' '+res.status());
    return res.status()===204 ? null : res.json();
  };
  const version = await request('/api/v4/version');
  const project = await request('/api/v4/projects/root%2Ffountain-product-integration');
  assert.equal(project.visibility,'private');
  assert.equal(project.namespace.full_path,'root');
  async function identify(node,page,side) {
    const container = inspect(node);
    const mounted = mount(container,assets);
    const expected = {gitlabVersion:pin.version,gitlabCommit:pin.commit,image:pin.image};
    if (side==='fountain') Object.assign(expected,{packageVersion:build.packageVersion,fountainRevision:build.parentRevision,
      runtimeSHA256:build.sha256,integrationSHA256:install.integrationSHA256});
    const paths = docker('exec',name(node),'find',assets,'-maxdepth','1','-name','manifest*.json').trim().split('\n');
    const controllerHash = docker('exec',name(node),'sha256sum',controller).split(' ')[0];
    const result = {side,node,container:container.Id,started:container.State.StartedAt,controllerHash,
      deployment:{image:container.Config.Image,assetMount:mounted?[{readOnly:!mounted.RW}]:[]},backend:{version},
      frontendManifests:docker('exec',name(node),'sha256sum',...paths).trim().split('\n')};
    const response = await page.goto(origin+'/users/sign_in');
    result.requestID = receipt(node,await response.headerValue('x-request-id'));
    result.buildIdentity = await observeEditorBuild({page,project,expected,request,report:result,
      observeProbe:tab=>observePage(tab,report,report.errors),readDeployedScripts:paths=>{
        const prefix = dirname(dirname(assets));
        return new Map(docker('exec',name(node),'sha256sum','--',...paths.map(path=>prefix+path)).trim().split('\n').map(line=>[line.slice(66+prefix.length),line.slice(0,64)]));
      }});
    assert.equal(buildIdentityError(result),null);
    report.nodes.push(result);
    assert.equal(controllerHash,report.nodes[0].controllerHash);
    return result;
  }
  const ownerState = await owner.context().storageState();
  await identify('baseline',owner,'fountain');
  const admin = await peerBrowser.newPage({storageState:ownerState});
  await identify('peer',admin,initialSide);
  const member = await prepareGitLabAuditMember({request,project,fixture});
  const members = '/api/v4/projects/'+project.id+'/members';
  const existing = (await request(members+'?query='+fixture.username)).find(user=>user.id===member.account.id);
  if (existing?.access_level !== 30) {
    restoreRole = async () => existing ? member.setRole(existing.access_level) : request(members+'/'+member.account.id,{},'DELETE');
    await member.setRole(30);
  }
  const flag = 'wiki_collaborative_editing';
  const flagPath = '/api/v4/features/'+flag;
  const readFlag = async () => (await request('/api/v4/features')).find(item=>item.name===flag) ?? null;
  const initial = await readFlag();
  if (initial && initial.state!=='off') throw new Error('The test namespace must start with collaboration off.');
  restoreFlag = async () => {
    await request(flagPath,{namespace:'root',value:'false'});
    if (!initial && (await readFlag())?.state==='off') await request(flagPath,{},'DELETE');
    assert.deepEqual(await readFlag(),initial);
  };
  await request(flagPath,{namespace:'root',value:'true'});
  const wikis = '/api/v4/projects/'+project.id+'/wikis';
  const wiki = await request(wikis,{title:'Fountain two-node '+direction+' '+id,content:input.source,format:'markdown'});
  const url = project.web_url+'/-/wikis/'+encodeURIComponent(wiki.slug);
  const saved = async () => (await request(wikis+'/'+encodeURIComponent(wiki.slug))).content;
  const editor = async (tab,node,side) => {
    const response = await tab.goto(url);
    report.checks.push({node,wikiReaderRequest:receipt(node,await response.headerValue('x-request-id'))});
    await tab.getByTestId('wiki-edit-button').click();
    return openRich(tab.locator('form.wiki-form'),side);
  };
  const append = async (tab,surface,text) => {
    await surface.locator('p').last().click();
    await tab.keyboard.press('End');
    await tab.keyboard.insertText(text);
  };
  const content = surface => surface.locator('p').last().evaluate(el=>{
    const copy=el.cloneNode(true);
    for (const label of copy.querySelectorAll('.collaboration-cursor-caret,[data-fountain-collaborator]')) label.remove();
    return copy.textContent;
  });
  const shows = (surface,text) => expect.poll(()=>content(surface),{timeout:20000}).toBe(text);
  const first = await editor(owner,'baseline','fountain');
  const left = 'Status: ready.'+input.ownerEdit;
  await append(owner,first,input.ownerEdit);
  const peer = await peerBrowser.newPage();
  await observePage(peer,report,report.errors);
  await member.signInMember(peer,{});
  const peerState = await peer.context().storageState();
  const second = await editor(peer,'peer',initialSide);
  await shows(second,left);
  await append(peer,second,input.peerEdit);
  const both = left+input.peerEdit;
  await shows(first,both);
  await peer.keyboard.press('Control+z');
  await shows(first,left);
  await peer.keyboard.press('Control+Shift+z');
  await shows(first,both);
  assert.equal(await saved(),input.source);
  await first.screenshot({path:join(out,'before-switch.png')});
  report.checks.push({bothAuthorsBeforeSwitch:both,savedBefore:input.source});
  await peer.close();
  docker('stop','--time','30',name('peer'));
  const during = ' Edited during '+direction+'.';
  await append(owner,first,during);
  await shows(first,both+during);
  assert.equal(inspect('peer').State.Running,false);
  assert.equal(await saved(),input.source);
  deployPeer(finalSide==='fountain');
  await identify('peer',admin,finalSide);
  assert.notEqual(report.nodes[1].container,report.nodes[2].container);
  const witness = await peerBrowser.newPage({storageState:peerState});
  await observePage(witness,report,report.errors);
  const recovered = await editor(witness,'peer',finalSide);
  await shows(recovered,both+during);
  const lastEdit = finalSide==='original' ? ' Checked on stock.' : ' Checked on Fountain.';
  const finalText = both+during+lastEdit;
  await append(witness,recovered,lastEdit);
  await shows(first,finalText);
  await witness.keyboard.press('Control+z');
  await shows(first,both+during);
  await witness.keyboard.press('Control+Shift+z');
  await shows(first,finalText);
  await recovered.screenshot({path:join(out,'recovered-editor.png')});
  await witness.getByTestId('wiki-submit-button').click();
  const confirm = witness.getByTestId('wiki-confirm-message');
  const reader = witness.getByTestId('wiki-page-content');
  await expect(confirm.or(reader).first()).toBeVisible();
  if (await confirm.isVisible()) await confirm.click();
  await expect(reader.locator('p').last()).toHaveText(finalText);
  const persisted = await saved();
  assert.equal(persisted.replaceAll('\r\n','\n'),'Owner: **Sam**.\n\n'+finalText);
  await owner.goto(url);
  await expect(owner.getByTestId('wiki-page-content').locator('strong')).toHaveText('Sam');
  await expect(owner.getByTestId('wiki-page-content').locator('p').last()).toHaveText(finalText);
  await owner.getByTestId('wiki-page-content').screenshot({path:join(out,'saved-on-surviving-node.png')});
  const survivor=inspect('baseline');
  assert.equal(survivor.Id,baseline.Id);
  assert.equal(survivor.State.StartedAt,baseline.State.StartedAt);
  report.checks.push({unchangedBaseline:survivor.Id,whilePeerOffline:during,storedMarkdown:persisted,readerText:finalText});
  report.wikiSlug = wiki.slug;
  assert.deepEqual(report.errors,[]);
  report.passed = true;
} catch (error) {
  report.failure = String(error);
  process.exitCode = 1;
} finally {
  for (const cleanup of [restoreFlag,restoreRole,...browsers.map(browser=>()=>browser.close()),
    peerStarted && (()=>docker('stop','--time','30',name('peer')))].filter(Boolean)) {
    try {await cleanup();} catch(error){(report.cleanupErrors??=[]).push(String(error));report.passed=false;process.exitCode=1;}
  }
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({out,passed:report.passed,failure:report.failure,cleanup:report.cleanupErrors}));
}
