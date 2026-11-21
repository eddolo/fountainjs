import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
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
const args = process.argv.slice(2);
const checklist = args.includes('--wiki-checklist');
const failover = args.includes('--load-balancer');
const keepTab = failover || args.includes('--keep-tab-open');
const switches = args.filter(arg=>arg!=='--wiki-checklist' && arg!=='--keep-tab-open' && arg!=='--load-balancer');
assert.ok(switches.length<=1 && switches.every(arg=>['--rollback','--rollout'].includes(arg)), 'Use --rollback or --rollout with optional --wiki-checklist and --keep-tab-open or --load-balancer');
const fixture = await readJSON('integrations/gitlab/fixtures/compatibility-wiki-'+(checklist?'checklist':'collaboration')+'.json');
const input = fixture.cases[0];
const id = new Date().toISOString().replace(/[^0-9]/g, '');
const direction = switches[0]==='--rollout' ? 'rollout' : 'rollback';
const initialSide = direction==='rollback' ? 'fountain' : 'original';
const finalSide = direction==='rollback' ? 'original' : 'fountain';
const out = 'artifacts/gitlab-compatibility/wiki-two-nodes-' + direction + '-' + id;
await mkdir(out, {recursive:true});
const report = {direction,keepTab,checks:[],nodes:[],errors:[],passed:false,fixtureSHA256:sha256(JSON.stringify(fixture)),
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
const nativeAssets = join(install.source,'public/assets/webpack');
const baselineSide = frontend ? 'fountain' : 'original';
assert.equal(baselineSide,failover ? finalSide : 'fountain','Start the surviving node with the expected editor');
if (frontend) {
  assert.equal(frontend.RW,false);
  assert.equal(frontend.Source,nativeAssets);
}
assert.equal(install.revision, pin.commit);
assert.ok(!install.restored, 'Installed frontend was restored to stock');
assert.equal(install.nativeRuntime.sha256, build.sha256);
assert.equal(install.nativeRuntime.parentRevision, build.parentRevision);
for (const [path,hash] of Object.entries(build.inputs)) assert.equal(sha256(await readFile(path)),hash,path);
for (const [path,hash] of Object.entries(install.files)) assert.equal(sha256(await readFile(join(install.source,path))),hash,path);
const wikiMount = mount(baseline, controller);
const env = {...process.env, FOUNTAIN_GITLAB_FRONTEND_ASSETS:nativeAssets};
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
let proxyContainer;
let restoreRole, restoreFlag, peerStarted = false;
try {
  peerStarted = true;
  deployPeer(initialSide==='fountain');
  if (failover) {
    const image = 'nginx@sha256:d5f28ef21aabddd098f3dbc21fe5b7a7d7a184720bc07da0b6c9b9820e97f25e';
    const config = resolve(files,'wiki-failover.nginx.conf');
    proxyContainer = docker('run','--detach','--rm','--name',group+'-proxy-'+id,'--network','host',
      '--read-only','--user','101:101','--cap-drop','ALL','--security-opt','no-new-privileges',
      '--tmpfs','/tmp:rw,nosuid,nodev,noexec,size=16m','--mount','type=bind,src='+config+',dst=/etc/nginx/nginx.conf,readonly',
      '--entrypoint','nginx',image,'-g','daemon off;').trim();
    report.proxy = {image,configHash:sha256(await readFile(config)),container:proxyContainer,handshakes:[]};
  }
  const primaryBrowser = await chromium.launch();
  browsers.push(primaryBrowser);
  const peerBrowser = await chromium.launch({args:['--host-resolver-rules=MAP 127.0.0.1:5080 127.0.0.1:'+(failover?'5082':'5081')]});
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
    const response = await page.goto(origin+(failover ? '/api/v4/user?fountain_audit='+id+'-'+node+'-'+side : '/users/sign_in'));
    assert.equal(response.status(),200);
    if (failover && node === 'peer') {
      const route = await response.headerValue('x-fountain-audit-upstream');
      report.checks.push({identityNode:node,route,status:response.status(),requestID:await response.headerValue('x-request-id')});
      assert.equal(route?.split(', ').at(-1),'127.0.0.1:5081');
    }
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
  await identify('baseline',owner,baselineSide);
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
    const room = {node,side,events:[]};
    (report.editors ??= []).push(room);
    tab.on('websocket', socket => socket.on('framereceived', ({payload}) => {
      if (typeof payload !== 'string' || room.events.length >= 12) return;
      let frame;
      try { frame = JSON.parse(payload); } catch { return; }
      if (!frame.identifier?.includes('CollaborativeEditing::WikiPageChannel')) return;
      const kind = frame.type ?? frame.message?.type;
      if (['init','confirm_subscription','reject_subscription'].includes(kind)) room.events.push(kind);
    }));
    const response = await tab.goto(url);
    report.checks.push({node,wikiReaderRequest:receipt(node,await response.headerValue('x-request-id'))});
    await tab.getByTestId('wiki-edit-button').click();
    return openRich(tab.locator('form.wiki-form'),side);
  };
  const append = async (tab,surface,text) => {
    const status = surface.locator('p').filter({hasText:'Status: ready.'});
    await status.click({position:{x:8,y:8}});
    await tab.keyboard.press('End');
    assert.ok(await status.evaluate(p=>p.contains(p.ownerDocument.getSelection()?.focusNode)),
      'Expected the caret in the visible status paragraph before typing');
    await tab.keyboard.insertText(text);
  };
  const paragraphText = p => p.evaluate(el=>{
    const copy=el.cloneNode(true);
    for (const label of copy.querySelectorAll('.collaboration-cursor-caret,[data-fountain-collaborator]')) label.remove();
    return copy.textContent;
  });
  const content = surface => paragraphText(surface.locator('p').last());
  const taskBox = (surface,label) => surface.locator('li').filter({hasText:label}).getByRole('checkbox');
  const shows = (surface,text) => expect.poll(()=>content(surface),{timeout:20000}).toBe(text);
  const first = await editor(owner,'baseline',baselineSide);
  const left = 'Status: ready.'+input.ownerEdit;
  await append(owner,first,input.ownerEdit);
  const peer = await peerBrowser.newPage();
  await observePage(peer,report,report.errors);
  await member.signInMember(peer,{});
  const peerState = await peer.context().storageState();
  if (failover) {
    const cdp = await peer.context().newCDPSession(peer);
    await cdp.send('Network.enable');
    const sockets = new Map();
    cdp.on('Network.webSocketCreated',({requestId,url})=>sockets.set(requestId,new URL(url).pathname));
    cdp.on('Network.webSocketHandshakeResponseReceived',({requestId,response})=>{
      if (response.status !== 101 || !/\/cable\/?$/u.test(sockets.get(requestId) ?? '')) return;
      const route = Object.entries(response.headers).find(([key])=>key.toLowerCase()==='x-fountain-audit-upstream')?.[1];
      report.proxy.handshakes.push({path:sockets.get(requestId),upstream:route?.split(', ').at(-1)});
    });
  }
  const second = await editor(peer,'peer',initialSide);
  try {
    await shows(second,left);
  } catch (error) {
    report.firstEdit = {owner:await content(first),developer:await content(second)};
    await first.screenshot({path:join(out,'owner-before-switch.png')});
    await second.screenshot({path:join(out,'developer-before-switch.png')});
    throw error;
  }
  await append(peer,second,input.peerEdit);
  const both = left+input.peerEdit;
  await shows(first,both);
  await peer.keyboard.press('Control+z');
  await shows(first,left);
  await peer.keyboard.press('Control+Shift+z');
  await shows(first,both);
  assert.equal(await saved(),input.source);
  if (failover) await expect.poll(()=>report.proxy.handshakes.at(-1)?.upstream).toBe('127.0.0.1:5081');
  await first.screenshot({path:join(out,'before-switch.png')});
  report.checks.push({bothAuthorsBeforeSwitch:both,savedBefore:input.source});
  const retainedRoot = keepTab ? await second.elementHandle() : null;
  const originalLoad = keepTab ? await peer.evaluate(() => performance.timeOrigin) : null;
  const localNote = failover ? ' Failover sign-off.' : ' Offline sign-off.';
  const ownerLine = surface => paragraphText(surface.locator('p').first());
  if (!keepTab) await peer.close();
  docker('stop','--time','30',name('peer'));
  const during = ' Edited during '+direction+'.';
  await append(owner,first,during);
  await shows(first,both+during);
  if (checklist) {
    await taskBox(first,input.checklist.label).check();
    await expect(taskBox(first,input.checklist.label)).toBeChecked();
  }
  assert.equal(inspect('peer').State.Running,false);
  if (keepTab) {
    await second.locator('p').first().click();
    await peer.keyboard.press('End');
    await peer.keyboard.insertText(localNote);
    await expect.poll(() => ownerLine(second)).toBe('Owner: Sam.'+localNote);
    if (failover) {
      await expect.poll(()=>report.proxy.handshakes.at(-1)?.upstream,{timeout:60000}).toBe('127.0.0.1:5080');
    } else {
      assert.equal(await ownerLine(first),'Owner: Sam.');
      assert.equal(await content(second),both);
      report.checks.push({isolatedPeerOwnerLine:await ownerLine(second),isolatedPrimaryStatus:await content(first)});
      await second.screenshot({path:join(out,'open-tab-offline.png')});
    }
  }
  assert.equal(await saved(),input.source);
  const replacePeer = async () => {
    deployPeer(finalSide==='fountain');
    let probe = admin;
    if (failover) {
      // A healthy container can still be inside NGINX's passive failure window.
      // Observe the preferred upstream through this browser before identifying it.
      report.proxy.recoveryProbes = [];
      await expect.poll(async () => {
        const sample = await admin.evaluate(async () => {
          const res = await fetch('/api/v4/user',{cache:'no-store'});
          return {status:res.status,route:res.headers.get('x-fountain-audit-upstream')};
        });
        report.proxy.recoveryProbes.push(sample);
        return sample.status===200 && sample.route?.split(', ').at(-1)==='127.0.0.1:5081';
      },{timeout:30000}).toBe(true);
      probe = await peerBrowser.newPage({storageState:ownerState});
    }
    await identify('peer',probe,finalSide);
    assert.notEqual(report.nodes[1].container,report.nodes[2].container);
  };
  if (!failover) await replacePeer();
  if (keepTab) {
    await expect.poll(() => ownerLine(first),{timeout:60000}).toBe('Owner: Sam.'+localNote);
    await shows(second,both+during);
    assert.equal(await peer.evaluate(() => performance.timeOrigin),originalLoad);
    assert.equal(await retainedRoot.evaluate(el=>el.isConnected),true);
    await peer.keyboard.press('Control+z');
    await expect.poll(() => ownerLine(first)).toBe('Owner: Sam.');
    await shows(second,both+during);
    await peer.keyboard.press('Control+Shift+z');
    await expect.poll(() => ownerLine(first)).toBe('Owner: Sam.'+localNote);
    assert.equal(await saved(),input.source);
    report.checks.push({originalEditor:initialSide,reconnectedTo:failover?baselineSide:finalSide,sameMountedEditor:true,
      afterReconnect:await ownerLine(first),survivingStatus:await content(second)});
    await second.screenshot({path:join(out,'open-tab-reconnected.png')});
  }
  const witness = failover ? peer : await peerBrowser.newPage({storageState:peerState});
  if (!failover) await observePage(witness,report,report.errors);
  const recovered = failover ? second : await editor(witness,'peer',finalSide);
  const writerSide = failover ? initialSide : finalSide;
  await shows(recovered,both+during);
  if (keepTab) assert.equal(await ownerLine(recovered),'Owner: Sam.'+localNote);
  const lastEdit = writerSide==='original' ? ' Checked on stock.' : ' Checked on Fountain.';
  const finalText = both+during+lastEdit;
  await append(witness,recovered,lastEdit);
  await shows(first,finalText);
  await witness.keyboard.press('Control+z');
  await shows(first,both+during);
  await witness.keyboard.press('Control+Shift+z');
  await shows(first,finalText);
  if (checklist) {
    await expect(taskBox(recovered,input.checklist.label)).toBeChecked();
    await expect(taskBox(recovered,'Notify the team')).not.toBeChecked();
    await taskBox(recovered,'Notify the team').check();
    await expect(taskBox(first,'Notify the team')).toBeChecked();
    report.checks.push({recoveredTask:input.checklist.label,peerCompleted:'Notify the team'});
  }
  await recovered.screenshot({path:join(out,'recovered-editor.png')});
  const saveRequests = [];
  if (failover) witness.on('response',response=>{
    if (response.request().isNavigationRequest() && response.request().method() === 'POST'
      && new URL(response.url()).pathname === new URL(url).pathname) saveRequests.push(response);
  });
  await witness.getByTestId('wiki-submit-button').click();
  const confirm = witness.getByTestId('wiki-confirm-message');
  const reader = witness.getByTestId('wiki-page-content');
  await expect(confirm.or(reader).first()).toBeVisible();
  if (await confirm.isVisible()) await confirm.click();
  await expect(reader.locator('p').last()).toHaveText(finalText);
  const persisted = await saved();
  let expected = input.source.replace('Status: ready.',finalText);
  if (keepTab) expected = expected.replace('Owner: **Sam**.','Owner: **Sam**.'+localNote);
  if (checklist) {
    expected = expected.replace('[ ] '+input.checklist.label,'[x] '+input.checklist.label)
      .replace('3. [ ] Notify the team','3. [x] Notify the team');
    // The packaged writer inserts an additional separator between these list types.
    if (writerSide==='original') expected = expected.replace('\n\n3. ','\n\n\n3. ');
  }
  assert.equal(persisted.replaceAll('\r\n','\n'),expected);
  await owner.goto(url);
  await expect(owner.getByTestId('wiki-page-content').locator('strong')).toHaveText('Sam');
  await expect(owner.getByTestId('wiki-page-content').locator('p').last()).toHaveText(finalText);
  if (keepTab) await expect(owner.getByTestId('wiki-page-content').locator('p').first()).toHaveText('Owner: Sam.'+localNote);
  if (checklist) {
    const finalReader = owner.getByTestId('wiki-page-content');
    assert.deepEqual(await finalReader.locator('input[type=checkbox]').evaluateAll(boxes=>boxes.map(box=>box.checked)),[true,true,false,true,true]);
    await expect(finalReader.locator('li.inapplicable')).toHaveText('Restart the old worker');
    await expect(finalReader.locator('ol')).toHaveAttribute('start','3');
  }
  await owner.getByTestId('wiki-page-content').screenshot({path:join(out,'saved-on-surviving-node.png')});
  if (failover) {
    assert.equal(inspect('peer').State.Running,false);
    assert.equal(saveRequests.length,1,'Expected one wiki form submission on the surviving node');
    const [response] = saveRequests;
    const route = await response.headerValue('x-fountain-audit-upstream');
    assert.equal(route?.split(', ').at(-1),'127.0.0.1:5080');
    report.proxy.save = {status:response.status(),route,requestID:receipt('baseline',await response.headerValue('x-request-id')),peerStopped:true};
    await replacePeer();
    const returned = await peerBrowser.newPage({storageState:peerState});
    await observePage(returned,report,report.errors);
    const returning = await returned.goto(url,{waitUntil:'commit'});
    assert.equal((await returning.headerValue('x-fountain-audit-upstream'))?.split(', ').at(-1),'127.0.0.1:5081');
    report.proxy.returnedPeerRequest = receipt('peer',await returning.headerValue('x-request-id'));
    await expect(returned.getByTestId('wiki-page-content').locator('p').last()).toHaveText(finalText);
    await expect(returned.getByTestId('wiki-page-content').locator('p').first()).toHaveText('Owner: Sam.'+localNote);
  }
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
    proxyContainer && (()=>docker('stop','--time','10',proxyContainer)),
    peerStarted && (()=>docker('stop','--time','30',name('peer')))].filter(Boolean)) {
    try {await cleanup();} catch(error){(report.cleanupErrors??=[]).push(String(error));report.passed=false;process.exitCode=1;}
  }
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({out,passed:report.passed,failure:report.failure,cleanup:report.cleanupErrors}));
}
