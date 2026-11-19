import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
// These are tests of interpretation policy, not real application evidence.
// @ts-expect-error Private JS audit helper intentionally has no published type entry.
import {classifyInvariant,compareGitLabCompatibility,suggestionBlock,clipboardParagraphs,conversionDescription} from '../integrations/gitlab/testing/compatibility.mjs';
it.each([
 [true,true,true,'parity'],[true,false,true,'improvement'],[true,true,false,'regression'],[true,false,false,'shared-limitation'],
 ['exact','changed-a','changed-b',null],[true,undefined,true,null],[true,true,undefined,null],
])('classifies only matched observed outcomes %j / %j / %j', (expected,original,fountain,classification)=>{
 expect(classifyInvariant(expected,original,fountain)).toBe(classification);
});
it('reads exact code source without trimming whitespace or private-use characters',()=>{
 expect(suggestionBlock('```suggestion:-2+0\nA\\n\uE000\u200b  \n\n```')).toEqual({params:'-2+0',source:'A\\n\uE000\u200b  \n\n'});
 expect(suggestionBlock('')).toEqual({source:'',params:null,emptyDocument:true});
 expect(suggestionBlock('not a supported suggestion carrier')).toBeUndefined();
 expect(suggestionBlock('```suggestion\nx\n```\n```suggestion\ny\n```')).toBeUndefined();
});
function testBuild(side: 'original' | 'fountain') {
 const native = side === 'fountain';
 const digest = '1'.repeat(64);
 const gitlabCommit = 'a'.repeat(40);
 const image = 'gitlab/gitlab-ce:test@sha256:' + digest;
 const frontendManifests = [digest + '  /public/assets/webpack/manifest.json'];
 const manifestSHA256 = createHash('sha256').update(frontendManifests[0]!).digest('hex');
 return {
   frontendManifests, side,
   buildIdentity: { side, expected: { gitlabVersion: '19.5.3', gitlabCommit, image,
     ...(native ? {packageVersion: '0.5.0-test', fountainRevision: 'b'.repeat(40), runtimeSHA256: digest, integrationSHA256: digest} : {}) },
     observed: {editor: native ? 'FountainJS' : 'ProseMirror', runtimeSHA256: native ? digest : null,
       integrationSHA256: native ? digest : null, manifestSHA256,
       scripts: [{path: '/assets/webpack/editor.js', browserSHA256: digest, deployedSHA256: digest}]} },
   assetMount: native ? [{readOnly: true}] : [],
 };
}
function reports(){
 const input={id:'handoff',scope:'handoff',range:{start:1,end:1},source:'exact\n'};
 const base={runId:'policy-test',fixtureHash:'fixture',harnessHashes:{driver:'driver'},browser:{version:'test'},
  fixture:{cases:[input],appendLine:'// review\n',proseSuffix:' confirmed'},
  deployment:{image:testBuild('original').buildIdentity.expected.image,imageId:'digest',backendMounts:['data'],backendEnvironmentHash:'same',cpus:2,memory:4},
  backend:{version:{version:'19.5.3',revision:'a'.repeat(11)},project:{id:1,defaultHead:'seed'},actor:'root',serverSources:['source']},collectionComplete:true,errors:[]};
 const observation={id:'handoff',input,prefillDOM:'exact',sourceAtFirstVisible:'```suggestion:-0+0\nexact\n```',sourceModeBeforeEdit:'```suggestion:-0+0\nexact\n```'};
 const sideReport = (side: 'original' | 'fountain') => {
   const {assetMount, ...identity} = testBuild(side);
   const copy = structuredClone(base);
   return {...copy, ...identity, deployment: {...copy.deployment, assetMount}};
 };
 return [{...sideReport('original'),observations:[{...structuredClone(observation),editorProof:{native:false,className:'tiptap ProseMirror'}}]},
 {...sideReport('fountain'),observations:[{...structuredClone(observation),prefillDOM:'exact\n',editorProof:{native:true,className:'fountain-editor'}}]}];
}
it('refuses to classify a mismatched backend, candidate instrument, input or browser as parity',()=>{
 for(const mutate of [
  (report:any)=>{report.deployment.backendEnvironmentHash='different';},
  (report:any)=>{report.buildIdentity.expected.gitlabCommit='a'.repeat(39)+'b';},
  (report:any)=>{report.backend.project.defaultHead='different';},
  (report:any)=>{report.browser.version='different';},
  (report:any)=>{report.harnessHashes.driver='different';},
  (report:any)=>{report.deployment.footnoteFilter='different-renderer';},
  (report:any)=>{report.observations[0].input.source='different\n';},
 ]){
  const [original,fountain]=reports();mutate(fountain);
  const result=compareGitLabCompatibility(original,fountain);
  expect(result.environment.matched).toBe(false);expect(result.rows.every((row:any)=>row.classification===null)).toBe(true);
  expect(result.regressionGate.passed).toBe(false);expect(result.featureAcceptance.passed).toBe(false);
 }
});
it.each(['missing original', 'missing candidate', 'stale runtime', 'stale host', 'different script', 'empty scripts', 'stock mount', 'changed manifest'])(
 'withholds every matched outcome for invalid build evidence: %s', reason => {
  const [original, fountain] = reports();
  const stock = original as any, candidate = fountain as any;
  switch (reason) {
   case 'missing original': delete stock.buildIdentity; break;
   case 'missing candidate': delete candidate.buildIdentity; break;
   case 'stale runtime': candidate.buildIdentity.observed.runtimeSHA256 = '2'.repeat(64); break;
   case 'stale host': candidate.buildIdentity.observed.integrationSHA256 = '2'.repeat(64); break;
   case 'different script': stock.buildIdentity.observed.scripts[0].browserSHA256 = '2'.repeat(64); break;
   case 'empty scripts': candidate.buildIdentity.observed.scripts = []; break;
   case 'stock mount': stock.deployment.assetMount = [{readOnly: true}]; break;
   case 'changed manifest': stock.frontendManifests = []; break;
  }
  const result = compareGitLabCompatibility(original, fountain);
  expect(result.rows.every((row: any) => row.classification === null)).toBe(true);
  expect(result.environment.matched).toBe(false);
  expect(result.comparisonComplete || result.featureAcceptance.passed || result.regressionGate.passed).toBe(false);
 });
it('keeps missing observations and unproven editor identity out of completed comparisons',()=>{
 const [original,fountain]=reports();delete (fountain.observations[0] as any).editorProof;
 const result=compareGitLabCompatibility(original,fountain);
 expect(result.summary.incomplete).toBe(4);expect(result.comparisonComplete).toBe(false);expect(result.regressionGate.passed).toBe(false);
});
it.each([undefined, {passed: false}, {passed: true}])('requires the requested deployment rollback to pass independently of workflow parity', rollback => {
 const [original, fountain] = reports();
 Object.assign(original, {rollbackRequested: true, rollback});
 const result = compareGitLabCompatibility(original, fountain);
 expect(result.summary.parity).toBe(result.summary.total);
 expect(result.featureAcceptance.passed).toBe(false);
});
it('checks each timed rollback record independently of its reported pass flag', () => {
 const [original,fountain] = reports();
 const input = {...original.fixture.cases[0]!,description:'Release',suffix:' now.',comment:'Reviewed'};
 original.fixture.cases[0] = input; fountain.fixture.cases[0] = input;
 original.observations[0]!.input = input; fountain.observations[0]!.input = input;
 const text = 'Release now. Checked after rollback.';
 const records = ['original','fountain'].map(writer => ({writer,case:input.id,iid:writer==='original'?1:2,
   quickSavePassed:true,quickSaveMeasured:true,quickSaveAfterReload:text,
   reviewedSaveAfterReload:'Release now. Verified in Markdown.',notes:['**Reviewed**'],
   gesture:{trustedKey:true,trustedClick:true,key:'.',button:'Save changes',paragraphs:[text],keyAt:0,clickAt:25}}));
 Object.assign(original,{rollbackRequested:true,rollback:{passed:true,records}});
 const passed = () => compareGitLabCompatibility(original,fountain).frontendRollback.passed;
 expect(passed()).toBe(true);
 records[1]!.gesture.clickAt = 150;
 expect(passed()).toBe(false);
 records[1]!.gesture.clickAt = 25;
 records[0]!.writer = 'fountain';
 expect(passed()).toBe(false);
});

it('does not convert a shared limitation into absolute feature acceptance',()=>{
 const [original,fountain]=reports();original.observations[0]!.sourceAtFirstVisible='';fountain.observations[0]!.sourceAtFirstVisible='';
 const result=compareGitLabCompatibility(original,fountain);
 expect(result.summary['shared-limitation']).toBe(1);expect(result.comparisonComplete).toBe(true);
 expect(result.regressionGate.passed).toBe(true);expect(result.featureAcceptance.passed).toBe(false);
});
it('fails the regression gate when the candidate alone loses exact source',()=>{
 const [original,fountain]=reports();fountain.observations[0]!.sourceAtFirstVisible='';
 const result=compareGitLabCompatibility(original,fountain);
 expect(result.summary.regression).toBe(1);expect(result.regressionGate.passed).toBe(false);
});

it('does not claim complete or feature acceptance when browser errors remain unexplained',()=>{
 const [original,fountain]=reports();(fountain.errors as any[]).push('unexplained browser failure');
 const result=compareGitLabCompatibility(original,fountain);
 expect(result.comparisonComplete).toBe(false);expect(result.regressionGate.passed).toBe(false);expect(result.featureAcceptance.passed).toBe(false);
});

it('requires a real attempt on the posted suggestion before crediting stale-source protection', () => {
 const pair = reports();
 const fixture = JSON.parse(readFileSync(new URL('../integrations/gitlab/fixtures/compatibility-stale-reviews.json', import.meta.url),'utf8'));
 const input = fixture.cases[1]; fixture.cases = [input];
 for (const report of pair) {
   report.fixture = fixture;
   Object.assign(report.observations[0]!,{id:input.id,input,status:'observed',readyToApply:true,
     confirmationOffered:true,applyResponse:{path:'/api/v4/suggestions/8/apply',status:400},
     saved:{body:'```suggestion:-0+0\nold();\nreviewed();\n```\n\n'+fixture.marker,suggestions:[{id:8,appliable:true}]},
     beforeApplyHead:'a'.repeat(40),setup:{seedCommit:'a'.repeat(40)},
     beforeApplyFile:{content:Buffer.from(input.source).toString('base64')},competingCommit:'b'.repeat(40),
     verifiedCompetingSource:input.remoteSource,afterReload:{source:input.remoteSource}});
 }
 const row = (key = 'afterReload.source') => compareGitLabCompatibility(...pair).rows.find((r:any)=>r.invariant===key);
 expect(row().classification).toBe('parity');
 const item = pair[1].observations[0] as any;
 expect(row('applyRefused').classification).toBe('parity');
 expect(row('visibleRefusal').status).toBe('missing-evidence');
 for (const report of pair) Object.assign(report.observations[0]!,{appliedBadgeVisible:false,alertText:['A file has been changed.']});
 expect(row('visibleRefusal').classification).toBe('parity');
 item.appliedBadgeVisible=true;
 expect(row('visibleRefusal').classification).toBe('regression');
 item.appliedBadgeVisible=false;item.alertText=[];
 expect(row('visibleRefusal').classification).toBe('regression');
 for (const status of [200,403,500]) {
   item.applyResponse.status = status;
   expect(row('applyRefused').classification).toBe('regression');
 }
 item.applyResponse.status = 400;
 item.afterReload.source = input.source;
 expect(row().classification).toBe('regression');
 item.confirmationOffered = false;
 expect(row().status).toBe('missing-evidence');
 item.confirmationOffered = true;
 item.applyResponse.path = '/api/v4/suggestions/9/apply';
 expect(row().status).toBe('missing-evidence');
 item.confirmationOffered = false;
 delete item.applyResponse;
 item.blockedAtControl = {id:8,appliable:false,buttonDisabled:true,confirmationHidden:true};
 expect(row('applyRefused').classification).toBe('parity');
 item.blockedAtControl.id = 9;
 expect(row().status).toBe('missing-evidence');
});

it('requires overlapping confirmed requests from distinct reviewers and a single durable edit', () => {
 const pair = reports();
 const fixture = JSON.parse(readFileSync(new URL('../integrations/gitlab/fixtures/compatibility-concurrent-reviews.json',import.meta.url),'utf8'));
 const input=fixture.cases[0], seed='a'.repeat(40), head='b'.repeat(40);
 const body='```suggestion:-0+0\nold();\nreviewed();\n```\n\n'+fixture.marker;
 for (const report of pair) {
   report.fixture = fixture;
   const state = {source:input.expectedSource,fileCommit:head,head,parents:[seed],message:'Reviewer A',noteId:5,body,suggestions:[{id:8,applied:true}]};
   Object.assign(report.observations[0]!,{id:input.id,input,status:'observed',
     saved:{id:5,body,suggestions:[{id:8,appliable:true,applied:false}]},beforeApplyHead:seed,setup:{seedCommit:seed},
     beforeApplyFile:{content:Buffer.from(input.source).toString('base64')},membership:{id:2,accessLevel:30},cleanupMembership:{id:2,accessLevel:10},
     reviewers:[{id:1,username:'root',message:'Reviewer A'},{id:2,username:fixture.username,message:'Reviewer B'}],
     submissions:[{actor:1,path:'/api/v4/suggestions/8/apply',status:200,requestStart:1,responseEnd:51,start:100,end:150,badge:true},
       {actor:2,path:'/api/v4/suggestions/8/apply',status:409,requestStart:1,responseEnd:51,start:115,end:165,alert:'Already applied'}],
     reloadedReviewers:[{actor:1,badge:true,canApply:false},{actor:2,badge:true,canApply:false}],
     afterDecision:{...state},afterReload:{...state}});
 }
 const row=(key:string)=>compareGitLabCompatibility(...pair).rows.find((r:any)=>r.invariant===key);
 expect(row('singleSuccess').classification).toBe('parity');
 expect(row('liveControls').status).toBe('missing-evidence');
 for (const report of pair) {
   const item=report.observations[0] as any;
   Object.assign(item.submissions[0],{applyVisible:false,alert:''});
   Object.assign(item.submissions[1],{applyVisible:true,badge:false});
 }
 expect(row('liveControls').classification).toBe('shared-limitation');
 const competing=(pair[1].observations[0] as any).submissions[1];
 Object.assign(competing,{badge:true,applyVisible:false});
 expect(row('liveControls').classification).toBe('shared-limitation');
 competing.alert='';
 expect(row('liveControls').classification).toBe('improvement');
 Object.assign(pair[0].deployment,{puma:{workers:0,minThreads:2,maxThreads:4}});
 expect(row('singleSuccess').classification).toBeNull();
 Object.assign(pair[1].deployment,{puma:{workers:0,minThreads:2,maxThreads:2}});
 expect(row('singleSuccess').classification).toBeNull();
 Object.assign(pair[1].deployment,{puma:{workers:0,minThreads:2,maxThreads:4}});
 const item=pair[1].observations[0] as any;
 item.submissions[1].start=150;item.submissions[1].end=200;
 expect(row('singleSuccess').status).toBe('missing-evidence');
 item.submissions[1].start=115;item.submissions[1].end=165;
 item.submissions[1].actor=1;
 expect(row('singleSuccess').status).toBe('missing-evidence');
 item.submissions[1].actor=2;item.submissions[1].status=500;
 expect(row('singleSuccess').classification).toBe('regression');
 item.submissions[1].status=409;item.afterReload.source+=fixture.appendLine;
 expect(row('afterReload.source').classification).toBe('regression');
 item.afterReload.parents=[head];item.afterReload.suggestions[0].id=9;
 expect(row('afterReload.commit').classification).toBe('regression');
 expect(row('afterReload.review').classification).toBe('regression');
});

it('separates safe refusal from correct relocation and checks the resulting commit', () => {
 const pair = reports();
 const fixture = JSON.parse(readFileSync(new URL('../integrations/gitlab/fixtures/compatibility-relocated-reviews.json', import.meta.url),'utf8'));
 const input = fixture.cases[0]; fixture.cases = [input];
 const seed = 'a'.repeat(40), competing = 'b'.repeat(40), head = 'c'.repeat(40);
 for (const report of pair) {
   report.fixture = fixture;
   const state = {source:input.expectedAppliedSource,head,fileCommit:head,parents:[competing],sameNote:true,sameSuggestion:true,applied:true};
   Object.assign(report.observations[0]!,{id:input.id,input,status:'observed',readyToApply:true,
     confirmationOffered:true,applyResponse:{path:'/api/v4/suggestions/8/apply',status:200},
     saved:{body:'```suggestion:-0+0\nold();\nreviewed();\n```\n\n'+fixture.marker,suggestions:[{id:8,appliable:true}]},
     beforeApplyHead:seed,setup:{seedCommit:seed},beforeApplyFile:{content:Buffer.from(input.source).toString('base64')},
     competingCommit:competing,verifiedCompetingSource:input.remoteSource,afterDecision:{...state},afterReload:{...state}});
 }
 const row = (key:string) => compareGitLabCompatibility(...pair).rows.find((r:any)=>r.invariant===key)?.classification;
 expect(row('appliedAtNewLocation')).toBe('parity');
 const item = pair[1].observations[0] as any;
 delete item.afterReload.parents;
 expect(row('appliedAtNewLocation')).toBeNull();
 item.afterReload.parents = [seed];
 expect(row('appliedAtNewLocation')).toBe('regression');
 expect(row('afterReload.head')).toBe('regression');
 item.applyResponse.status = 400;
 const refused = {source:input.remoteSource,head:competing,fileCommit:competing,sameNote:true,sameSuggestion:true,applied:false};
 item.afterDecision = {...refused}; item.afterReload = {...refused};
 expect(row('appliedAtNewLocation')).toBe('regression');
 expect(row('afterReload.source')).toBe('parity');
 expect(row('afterReload.head')).toBe('parity');
 item.afterReload.source = input.source;
 expect(row('afterReload.source')).toBe('regression');
});

it('requires a disconnected mutation for the exact draft before scoring reconnect behavior', () => {
 const pair = reports();
 const input = {id:'retry',scope:'reconnect',description:'Release.',suffix:' Ship.'};
 for (const report of pair) {
   Object.assign(report.fixture, {cases:[input]});
   Object.assign(report.observations[0]!, {id:input.id,input,status:'observed',offline:true,
     failures:[{description:'Release. Ship.',error:'net::ERR_INTERNET_DISCONNECTED'}],
     serverWhileOffline:'Release.',recoveredDraft:['Release. Ship.']});
 }
 const row = () => compareGitLabCompatibility(...pair).rows.find((item: any) => item.invariant === 'recoveredDraft');
 expect(row().classification).toBe('parity');
 const stock = pair[0]!.observations[0] as any;
 stock.recoveredDraft = ['Release.'];
 expect(row().classification).toBe('improvement');
 stock.failures[0].error = 'net::ERR_ABORTED';
 expect(row().status).toBe('missing-evidence');
 stock.failures[0] = {description:'Different draft',error:'net::ERR_INTERNET_DISCONNECTED'};
 expect(row().status).toBe('missing-evidence');
});

it('requires independent authorized authors and detects an ordinary retry overwriting a newer save', () => {
 const pair = reports();
 const fixture = JSON.parse(readFileSync(new URL('../integrations/gitlab/fixtures/compatibility-offline-conflict.json',import.meta.url),'utf8'));
 const input = fixture.cases[1];
 const local = input.markdown.replace('Shared record.', 'Shared record.' + input.localSuffix);
 const remote = input.markdown.replace('Shared record.', 'Shared record.' + input.remoteSuffix);
 for (const report of pair) {
   const item = report.observations[0]!;
   Object.assign(report.fixture, {...fixture,cases:[input]});
   Object.assign(item, {id:input.id,input,status:'observed',remoteEditorProof:item.editorProof,
     actor:{id:8,username:fixture.username,isAdmin:false},onlineAuthorId:1,setup:{authorId:1},
     permissionBefore:true,membership:{id:8,accessLevel:30},cleanupMembership:{id:8,accessLevel:10},
     wasOffline:true,stillOffline:true,whileDisconnected:remote,
     failedWrites:[{description:local,error:'net::ERR_INTERNET_DISCONNECTED'}],
     beforeDecision:remote,explicitDecision:true});
 }
 const stock = pair[0].observations[0] as any;
 const row = () => compareGitLabCompatibility(...pair).rows.find((item: any) => item.invariant === 'beforeDecision');
 expect(row().classification).toBe('parity');
 stock.beforeDecision = local;
 expect(row().classification).toBe('improvement');
 stock.onlineAuthorId = stock.actor.id;
 expect(row().status).toBe('missing-evidence');
 stock.onlineAuthorId = 1;
 stock.failedWrites[0].description = remote;
 expect(row().status).toBe('missing-evidence');
});

it('requires measured trusted Save gestures and the intended visible edit on both sides', () => {
 const pair = reports();
 const input = {id:'rapid', scope:'quick-save', pace:'immediate', key:'.',expected:'Edited.'};
 for (const report of pair) {
   Object.assign(report.fixture, {cases:[input]});
   Object.assign(report.observations[0]!, {id:input.id, input, status:'observed',
     gesture:{key:'.', button:'Save changes', trustedKey:true, trustedClick:true, keyAt:10, clickAt:54, paragraphs:['Edited.']},
     afterSubmit:'Edited.', afterReload:'Edited.', reader:'Edited.', reopened:['Edited.'], pageErrors:[]});
 }
 const check = () => compareGitLabCompatibility(...pair);
 expect(check().summary.parity).toBe(5);
 const stock = pair[0]!.observations[0] as any;
 stock.afterReload = 'Edited';
 expect(check().summary.improvement).toBe(1);
 for (const patch of [{clickAt:110},{trustedClick:false},{paragraphs:['Edited']}]) {
   const valid = stock.gesture;
   stock.gesture = {...valid,...patch};
   expect(check().summary.incomplete).toBe(5);
   expect(check().featureAcceptance.passed).toBe(false);
   stock.gesture = valid;
 }
});

it('requires proof of both editor instances and distinguishes a leaked discussion draft from parity', () => {
 const [original, fountain] = reports();
 const fixture = JSON.parse(readFileSync(new URL('../integrations/gitlab/fixtures/compatibility-composers.json', import.meta.url), 'utf8'));
 const input = fixture.cases[0];
 for (const report of [original, fountain]) {
   report.fixture = fixture;
   Object.assign(report.observations[0]!, { id: input.id, input, status: 'observed',
     commentEditorProof: report.observations[0]!.editorProof,
     facts: { initialServer: { description: input.description, notes: [] } } });
 }
 const row = () => compareGitLabCompatibility(original, fountain).rows.find((item: { invariant: string }) => item.invariant === 'initialServer');
 expect(row().classification).toBe('parity');
 (fountain.observations[0] as any).facts.initialServer.notes.push(input.comment);
 expect(row().classification).toBe('regression');
 delete (fountain.observations[0] as any).commentEditorProof;
 expect(row().status).toBe('missing-evidence');
});

function deletionReports(replacement:string){
 const pair=reports();
 for(const report of pair){
  const input:any=report.fixture.cases[0];input.scope='deletion';input.replacement=replacement;
  const item:any=report.observations[0];item.input=structuredClone(input);
  item.sourceAtFirstVisible='```suggestion:-0+0\n'+replacement+'```';item.sourceModeBeforeEdit=item.sourceAtFirstVisible;
  item.saved={body:item.sourceAtFirstVisible};item.reopenedSource=item.sourceAtFirstVisible;
  item.deletion={richSource:replacement,explicitDeletionExplanation:true,confirmationPresent:replacement.length>0,blockedBeforeConsent:replacement.length>0,confirmed:replacement.length>0};
  item.setup={seedCommit:'seed'};item.beforeApplyFile={content:Buffer.from(input.source).toString('base64')};item.beforeApplyHead='seed';
  item.appliedFile={content:''};item.appliedCommit={id:'applied',parent_ids:['seed']};item.appliedNote={suggestions:[{applied:true}]};
 }
 return pair;
}
it.each(['','\n'])('checks real deletion semantics separately from exact proposal source %j',(replacement)=>{
 const [original,fountain]=deletionReports(replacement);
 const result=compareGitLabCompatibility(original,fountain);
 expect(result.summary).toEqual({parity:15,improvement:0,regression:0,'shared-limitation':0,incomplete:0,total:15});
 expect(result.featureAcceptance.passed).toBe(true);
});
it('does not credit a whitespace warning when acceptance was not blocked before consent',()=>{
 const [original,fountain]=deletionReports('\n');
 const a:any=original.observations[0],b:any=fountain.observations[0];
 a.deletion.explicitDeletionExplanation=false;a.deletion.confirmationPresent=false;a.deletion.blockedBeforeConsent=false;a.deletion.confirmed=false;
 b.deletion.blockedBeforeConsent=false;
 const result=compareGitLabCompatibility(original,fountain);
 expect(result.rows.find((row:any)=>row.invariant==='deletionExplanation').classification).toBe('improvement');
 expect(result.rows.find((row:any)=>row.invariant==='consent').classification).toBe(null);
 expect(result.regressionGate.passed).toBe(false);expect(result.featureAcceptance.passed).toBe(false);
});
it('does not hide changed whitespace source behind an equivalent deletion result',()=>{
 const [original,fountain]=deletionReports('\n');
 (fountain.observations[0] as any).saved.body='```suggestion:-0+0\n```';
 const result=compareGitLabCompatibility(original,fountain);
 expect(result.rows.find((row:any)=>row.invariant==='savedSource').classification).toBe('regression');
 expect(result.rows.find((row:any)=>row.invariant==='appliedSource').classification).toBe('parity');
 expect(result.regressionGate.passed).toBe(false);
});

function reviewReports(){
 const pair=reports();
 for(const report of pair){
  const input:any=report.fixture.cases[0];Object.assign(input,{scope:'review',source:'before\nexact\nafter\nkeep\n',range:{start:2,end:2},editedRange:{start:1,end:3},replacement:'new\n'});
  (report.fixture as any).marker='review';const item:any=report.observations[0];item.input=structuredClone(input);
  item.saved={body:'```suggestion:-0+0\nexact\n```\n\nreview'};
  const before={source:'new\n',range:{start:2,end:2}},after={source:'new\n',range:{start:1,end:3}};
  item.review={initial:{source:'exact\n',range:{start:2,end:2}},beforeRange:before,afterRange:after,afterUndo:before,afterRedo:after,
   sourceBeforeSave:'```suggestion:-1+1\nnew\n```\n\nreview',saved:{body:'```suggestion:-1+1\nnew\n```\n\nreview'}};
  item.reopenedSource=item.review.saved.body;item.setup={seedCommit:'seed'};item.beforeApplyHead='seed';item.beforeApplyFile={content:Buffer.from(input.source).toString('base64')};
  item.appliedFile={content:Buffer.from('new\nkeep\n').toString('base64')};item.appliedCommit={id:'apply',parent_ids:['seed']};item.appliedNote={suggestions:[{applied:true}]};
 }
 return pair;
}
it('checks posted source/range history and final file effects independently',()=>{
 const result=compareGitLabCompatibility(...reviewReports());expect(result.summary.parity).toBe(21);expect(result.summary.total).toBe(21);expect(result.featureAcceptance.passed).toBe(true);
});
it('fails reviewed range/history source loss even when the applied file is correct',()=>{
 const [original,fountain]=reviewReports();(fountain.observations[0] as any).review.afterUndo={source:'lost\n',range:{start:2,end:2}};
 const result=compareGitLabCompatibility(original,fountain);expect(result.summary.regression).toBe(1);expect(result.regressionGate.passed).toBe(false);
 expect(result.rows.find((row:any)=>row.invariant==='appliedSource').classification).toBe('parity');
});

function clipboardReports(){
 const pair=reports();
 for(const report of pair){
  const input:any=report.fixture.cases[0];Object.assign(input,{scope:'clipboard',expectedGraph:{headings:[{level:2,text:'Heading'}],tasks:[{text:'Task',checked:true}],code:['A\\n\uE000']},plainTokens:['A\\n','\uE000']});
  const item:any=report.observations[0];item.input=structuredClone(input);
  for(const key of ['initial','externalRich','undo'])item[key]=structuredClone(input.expectedGraph);
  for(const key of ['pasted','redo','afterCutPaste','reopened'])item[key]=Object.fromEntries(Object.entries(input.expectedGraph).map(([name,values]:any)=>[name,[...values,...values]]));
  item.cut={headings:[],tasks:[],code:[]};item.clipboard={text:'A\\n\uE000',html:'<p>rich</p>'};item.externalPlain=item.clipboard.text;item.appendClipboardText=item.clipboard.text;item.appendSelection={readyForPaste:{collapsed:true,inside:true,activeInside:true,anchorText:'',anchorOffset:0}};
 }
 return pair;
}
it('checks clipboard source/marks/tasks/history separately from the eventual save',()=>{
 const result=compareGitLabCompatibility(...clipboardReports());expect(result.featureAcceptance.passed).toBe(true);expect(result.summary.total).toBe(28);
});
it('detects internal task loss without requiring a generic external editor to implement task widgets',()=>{
 const [original,fountain]=clipboardReports();const item:any=fountain.observations[0];item.externalRich.tasks=[];item.pasted.tasks=[];
 const result=compareGitLabCompatibility(original,fountain);expect(result.summary.regression).toBe(1);expect(result.regressionGate.passed).toBe(false);
 expect(result.rows.some((row:any)=>row.invariant==='externalRich.tasks')).toBe(false);
});
it('cannot classify a clipboard comparison without actual active editor proof',()=>{
 const [original,fountain]=clipboardReports();delete (fountain.observations[0] as any).editorProof;
 const result=compareGitLabCompatibility(original,fountain);expect(result.summary.incomplete).toBe(28);expect(result.regressionGate.passed).toBe(false);
});

it('does not approve clipboard claims from runs that lack actual append caret/clipboard preconditions',()=>{
 const [original,fountain]=clipboardReports();delete (original.observations[0] as any).appendSelection;delete (original.observations[0] as any).appendClipboardText;
 const result=compareGitLabCompatibility(original,fountain);expect(result.summary.incomplete).toBe(2);expect(result.comparisonComplete).toBe(false);expect(result.regressionGate.passed).toBe(false);
});

function partialReports(){
 const pair=reports();
 for(const report of pair){
  const input:any=report.fixture.cases[0];Object.assign(input,{scope:'partial',direction:'backward',selectedText:'bold link',initialGraph:{prose:['start bold link tail'],bold:['bold']},cutGraph:{prose:['start  tail'],bold:[]},pastedGraph:{prose:['start bold link tail','bold link'],bold:['bold','bold']},fragment:{text:'bold link',bold:['bold'],links:[]}});
  const item:any=report.observations[0];item.input=structuredClone(input);
  for(const phase of ['initial','cutUndo','pasteUndo'])item[phase]=structuredClone(input.initialGraph);
  item.cut=structuredClone(input.cutGraph);for(const phase of ['pasted','pasteRedo','reopened'])item[phase]=structuredClone(input.pastedGraph);
  item.copySelection={text:'bold link',direction:'backward',inside:true,activeInside:true,collapsed:false};item.cutSelection=item.copySelection;
  item.clipboard={text:'bold link',html:'<strong>bold</strong> link'};item.cutClipboardText='bold link';item.beforePasteClipboardText='bold link';item.externalFragment=input.fragment;
  item.pasteSelection={collapsed:true,inside:true,activeInside:true,anchorText:'',anchorOffset:0};item.documentReady={initial:true,reopened:true};
 }
 return pair;
}
it('verifies directed partial selection, clipboard, marks and history separately',()=>{
 const result=compareGitLabCompatibility(...partialReports());expect(result.summary.total).toBe(26);expect(result.summary.parity).toBe(26);expect(result.featureAcceptance.passed).toBe(true);
});
it('does not treat forward selection as equivalent evidence for a backward workflow',()=>{
 const [original,fountain]=partialReports();(fountain.observations[0] as any).copySelection={...(fountain.observations[0] as any).copySelection,direction:'forward'};
 const result=compareGitLabCompatibility(original,fountain);expect(result.rows.find((row:any)=>row.invariant==='copySelection').classification).toBe('regression');expect(result.regressionGate.passed).toBe(false);
});
it('detects partial-paste mark loss even when text and saved content match',()=>{
 const [original,fountain]=partialReports();(fountain.observations[0] as any).pasted.bold=['bold'];
 const result=compareGitLabCompatibility(original,fountain);expect(result.rows.find((row:any)=>row.invariant==='pasted.bold').classification).toBe('regression');expect(result.regressionGate.passed).toBe(false);
});

it.each([['','parity'],['\u200B','regression']])('distinguishes empty caret wrappers from actual invisible marked content %j',(text,classification)=>{
 const [original,fountain]=partialReports();(fountain.observations[0] as any).cut.bold=[text];
 const result=compareGitLabCompatibility(original,fountain);expect(result.rows.find((row:any)=>row.invariant==='cut.bold').classification).toBe(classification);
});
it('rejects partial-selection evidence without actual document-load receipts',()=>{
 const [original,fountain]=partialReports();delete (original.observations[0] as any).documentReady;
 const result=compareGitLabCompatibility(original,fountain);expect(result.summary.incomplete).toBe(2);expect(result.regressionGate.passed).toBe(false);
});

it('detects cross-paragraph paste collapse even when all characters and marks survive',()=>{
 const [original,fountain]=partialReports();
 for(const report of [original,fountain]){
  const input:any=report.fixture.cases[0];input.pastedGraph.prose=['start bold link tail','bold','link'];
  const item:any=report.observations[0];item.input=structuredClone(input);
  for(const phase of ['pasted','pasteRedo','reopened'])item[phase].prose=structuredClone(input.pastedGraph.prose);
 }
 (fountain.observations[0] as any).pasted.prose=['start bold link tail','boldlink'];
 const result=compareGitLabCompatibility(original,fountain);
 expect(result.rows.find((row:any)=>row.invariant==='pasted.prose').classification).toBe('regression');
 expect(result.regressionGate.passed).toBe(false);
});

it.each(['one\ntwo','one\n\ntwo'])('accepts a text clipboard boundary between two nonempty paragraphs %j',value=>{
 expect(clipboardParagraphs(value)).toEqual(['one','two']);
});
it.each(['onetwo','one\n\n\ntwo','one\r\ntwo','one\n\u200Btwo','one \ntwo'])('retains plain clipboard differences rather than hiding loss %j',value=>{
 expect(clipboardParagraphs(value)).not.toEqual(['one','two']);
});
it('keeps missing plain clipboard evidence missing',()=>{expect(clipboardParagraphs(undefined)).toBeUndefined();});

it('classifies actual plain-paste boundary loss separately from an obstructed host save button',()=>{
 const [original,fountain]=partialReports();
 for(const report of [original,fountain]){
  const input:any=report.fixture.cases[0];input.clipboardParagraphs=['bold','link'];input.verifySaveAccess=true;
  const item:any=report.observations[0];item.input=structuredClone(input);
  const text=report.side==='original'?'boldlink':'bold\nlink';
  item.clipboard.text=text;item.cutClipboardText=text;item.beforePasteClipboardText=text;item.externalPlain=text;
  item.saveButtonReachable=report.side==='original';
 }
 const result=compareGitLabCompatibility(original,fountain);
 for(const invariant of ['clipboard.text','externalPlain.paragraphs','cutClipboardText','beforePasteClipboardText'])
  expect(result.rows.find((row:any)=>row.invariant===invariant).classification).toBe('improvement');
 expect(result.rows.find((row:any)=>row.invariant==='saveButtonReachable').classification).toBe('regression');
 expect(result.regressionGate.passed).toBe(false);expect(result.featureAcceptance.passed).toBe(false);
});

it('does not approve keyboard cross-paragraph evidence without its declared caret readiness',()=>{
 const [original,fountain]=partialReports();
 for(const report of [original,fountain]){const input:any=report.fixture.cases[0];input.requireCaretReady=true;(report.observations[0] as any).input=structuredClone(input);}
 const result=compareGitLabCompatibility(original,fountain);expect(result.summary.incomplete).toBe(2);expect(result.regressionGate.passed).toBe(false);
});

function gridReports(){
 const fixture=JSON.parse(readFileSync(new URL('../integrations/gitlab/fixtures/compatibility-grid.json',import.meta.url),'utf8'));
 const pair=reports();
 for(const report of pair){
  const input=structuredClone(fixture.cases[0]);report.fixture.cases=[input];
  const item:any=report.observations[0];item.id=input.id;item.input=structuredClone(input);
  for(const phase of ['initial','cutUndo','pasteUndo'])item[phase]=structuredClone(input.initialGraph);
  for(const phase of ['pasted','pasteRedo','reopened'])item[phase]=structuredClone(input.pastedGraph);
  item.cut=structuredClone(input.cutGraph);item.copySelection={cells:input.selectedCells,outsidePaintUnchanged:true};item.cutSelection={cells:input.selectedCells,outsidePaintUnchanged:true};
  item.clipboard={text:input.plain,html:'<table><tbody><tr><td>Actual payload</td></tr></tbody></table>'};
  item.cutClipboardText=input.plain;item.beforePasteClipboardText=input.plain;item.externalPlain=input.plain;item.externalRich=structuredClone(input.externalGraph);
  item.destinationReady=true;item.saveButtonReachable=true;item.documentReady={initial:true,reopened:true};
 }
 return pair;
}
it('checks real-grid interpretation separately from selection, geometry, TSV and persistence',()=>{
 const result=compareGitLabCompatibility(...gridReports());expect(result.summary.parity).toBe(21);expect(result.featureAcceptance.passed).toBe(true);
});
it.each([
 ['pasted.graph',(item:any)=>item.pasted.tables[1].pop()],
 ['externalRich',(item:any)=>{item.externalRich.tables[0][0][0].tag='TH';}],
 ['cut.graph',(item:any)=>{item.cut.tables[0][1][2].paragraphs=['Changed outside the rectangle'];}],
 ['copySelection.cells',(item:any)=>{item.copySelection.cells=[];}],
 ['clipboard.text',(item:any)=>{item.clipboard.text='A boldB linkCD';}],
])('rejects table-transfer corruption %s',(invariant,mutate)=>{
 const [original,fountain]=gridReports();mutate(fountain.observations[0]);
 const result=compareGitLabCompatibility(original,fountain);expect(result.rows.find((row:any)=>row.invariant===invariant).classification).toBe('regression');expect(result.regressionGate.passed).toBe(false);
});

it('rejects stray selection paint even when table semantics and clipboard remain correct',()=>{
 const [original,fountain]=gridReports();(fountain.observations[0] as any).copySelection.outsidePaintUnchanged=false;
 const result=compareGitLabCompatibility(original,fountain);expect(result.rows.find((row:any)=>row.invariant==='copySelection.outsidePaint').classification).toBe('regression');expect(result.regressionGate.passed).toBe(false);
});
it('requires the declared unselected-cell pixel control',()=>{
 const [original,fountain]=gridReports();delete (original.observations[0] as any).copySelection.outsidePaintUnchanged;
 const result=compareGitLabCompatibility(original,fountain);expect(result.summary.incomplete).toBe(1);expect(result.regressionGate.passed).toBe(false);
});

function taskReports(){
 const fixture=JSON.parse(readFileSync(new URL('../integrations/gitlab/fixtures/compatibility-tasks.json',import.meta.url),'utf8'));
 const pair=reports();
 for(const report of pair){
  const input=structuredClone(fixture.cases[0]);report.fixture.cases=[input];
  const item:any=report.observations[0];item.id=input.id;item.input=structuredClone(input);item.graphs=structuredClone(input.expectedGraphs);
  item.beforeEnter={inside:true,activeInside:true,collapsed:true,text:'Share draft',offset:11};item.documentReady={initial:true,reopened:true};item.emptyTaskLayout={visible:true};item.emptyCaret={inside:true,activeInside:true,collapsed:true,text:'',offset:0};
  item.exitCaret={inside:true,activeInside:true,collapsed:true,text:'',offset:0,inTask:false};item.selectedForRemoval='Follow up';item.saveButtonReachable=true;
 }
 return pair;
}
it('classifies the complete task lifecycle without inferring editability from import success',()=>{
 const result=compareGitLabCompatibility(...taskReports());expect(result.summary.parity).toBe(26);expect(result.featureAcceptance.passed).toBe(true);
});
it.each([
 ['toggleUndo.graph',(item:any)=>{item.graphs.toggleUndo.tasks[0].checked=true;}],
 ['newEmpty.graph',(item:any)=>{item.graphs.newEmpty.tasks.pop();}],
 ['newEmpty.visible',(item:any)=>{item.emptyTaskLayout.visible=false;}],
 ['newEmpty.caret.inside',(item:any)=>{item.emptyCaret.inside=false;}],
 ['liftUndo.graph',(item:any)=>{item.graphs.liftUndo.tasks.at(-1).depth=1;}],
 ['exited.graph',(item:any)=>{item.graphs.exited.prose.shift();}],
 ['exit.caret',(item:any)=>{item.exitCaret.inTask=true;}],
 ['reopened.graph',(item:any)=>{item.graphs.reopened.tasks[2].depth=0;}],
])('rejects task-editing regressions independently: %s',(invariant,mutate)=>{
 const [original,fountain]=taskReports();mutate(fountain.observations[0]);const result=compareGitLabCompatibility(original,fountain);
 expect(result.rows.find((row:any)=>row.invariant===invariant).classification).toBe('regression');expect(result.regressionGate.passed).toBe(false);
});
it('leaves a missing task-state observation incomplete rather than treating it as shared behavior',()=>{
 const [original,fountain]=taskReports();delete (original.observations[0] as any).graphs.lifted;
 const result=compareGitLabCompatibility(original,fountain);expect(result.summary.incomplete).toBe(1);expect(result.comparisonComplete).toBe(false);
});

function taskRecoveryReports(index=0){
 const fixture=JSON.parse(readFileSync(new URL('../integrations/gitlab/fixtures/compatibility-task-recovery.json',import.meta.url),'utf8'));
 const pair=reports();
 for(const report of pair){
  const input=structuredClone(fixture.cases[index]);report.fixture.cases=[input];
  const item:any=report.observations[0];item.id=input.id;item.input=structuredClone(input);item.graphs=structuredClone(input.expectedGraphs);
  item.selectedTaskText='Remove this task';item.selectedParagraph='Write literal here.';
  for(const [phase,graph]of [['saved','reopened'],['toggledSaved','toggleRedo'],['readerAfter','readerReopened']]){
   const tasks=input.expectedGraphs[graph].tasks;item[phase]={state:input.expectedState,task_completion_status:{count:tasks.length,completed_count:tasks.filter((task:any)=>task.checked).length}};
  }
  item.savedReachable=true;item.toggledSavedReachable=true;item.reopenedCheckbox={visible:true,enabled:true};item.readerCheckbox={visible:true,enabled:true};item.readerPersisted=true;
 }
 return pair;
}
it.each([0,1])('classifies explicit root-command and scoped-literal recovery profiles independently (%i)',index=>{
 const result=compareGitLabCompatibility(...taskRecoveryReports(index));expect(result.summary.parity).toBe(28);expect(result.featureAcceptance.passed).toBe(true);
});
it.each([
 ['reader.persisted',(item:any)=>{item.readerPersisted=false;}],
 ['saved.state',(item:any)=>{item.saved.state='closed';}],
 ['readerAfter.tasks',(item:any)=>{item.readerAfter.task_completion_status.completed_count=2;}],
 ['readerReopened.graph',(item:any)=>{item.graphs.readerReopened.tasks[2].depth=0;}],
 ['textUndo.graph',(item:any)=>{item.graphs.textUndo.tasks[1].text='Lost original task';}],
])('rejects live recovery corruption independently: %s',(invariant,mutate)=>{
 const [original,fountain]=taskRecoveryReports(1);mutate(fountain.observations[0]);const result=compareGitLabCompatibility(original,fountain);
 expect(result.rows.find((row:any)=>row.invariant===invariant).classification).toBe('regression');expect(result.regressionGate.passed).toBe(false);
});
it('does not infer a working reopened checkbox from the saved task count',()=>{
 const [original,fountain]=taskRecoveryReports();delete (fountain.observations[0] as any).reopenedCheckbox;
 const result=compareGitLabCompatibility(original,fountain);expect(result.summary.incomplete).toBe(2);expect(result.comparisonComplete).toBe(false);
});

function taskMenuReports(index=0){
 const fixture=JSON.parse(readFileSync(new URL('../integrations/gitlab/fixtures/compatibility-task-menu.json',import.meta.url),'utf8'));
 const pair=reports();
 for(const report of pair){
  const input=structuredClone(fixture.cases[index]);report.fixture.cases=[input];
  const item:any=report.observations[0];item.id=input.id;item.input=structuredClone(input);item.graphs=structuredClone(input.expectedGraphs);
  for(const phase of ['disabled','restored','deleted'])item[phase]={target:{text:input.target.text,depth:input.target.depth,sourcepos:'5:3-5:21'},sourceDeltaExact:true,after:{state:'opened',task_completion_status:{count:phase==='restored'?4:3,completed_count:1}}};
  for(const phase of ['saved','retained']){item[phase]={state:'opened'};item[phase+'Reachable']=true;}
  item.thirdStateSourceRetained=true;
 }
 return pair;
}
it.each([0,1])('classifies reader-menu third-state and source-position coverage (%i)',index=>{
 const result=compareGitLabCompatibility(...taskMenuReports(index));expect(result.summary.parity).toBe(27);expect(result.featureAcceptance.passed).toBe(true);
});
it.each([
 ['disabled.target',(item:any)=>{item.disabled.target.depth=0;}],
 ['disabled.counts',(item:any)=>{item.disabled.after.task_completion_status.count=4;}],
 ['restored.source',(item:any)=>{item.restored.sourceDeltaExact=false;}],
 ['retainedEditor.graph',(item:any)=>{item.graphs.retainedEditor.tasks[2].state='pending';}],
 ['retainedReader.graph',(item:any)=>{item.graphs.retainedReader.strikes=[];}],
 ['deleted.counts',(item:any)=>{item.deleted.after.task_completion_status.count=4;}],
])('rejects reader-menu corruption without masking it as a successful action: %s',(invariant,mutate)=>{
 const [original,fountain]=taskMenuReports();mutate(fountain.observations[0]);const result=compareGitLabCompatibility(original,fountain);
 expect(result.rows.find((row:any)=>row.invariant===invariant).classification).toBe('regression');expect(result.regressionGate.passed).toBe(false);
});
it('requires evidence that not-applicable source survived rich editing',()=>{
 const [original,fountain]=taskMenuReports();delete (fountain.observations[0] as any).thirdStateSourceRetained;
 const result=compareGitLabCompatibility(original,fountain);expect(result.summary.incomplete).toBe(1);expect(result.comparisonComplete).toBe(false);
});

function taskConversionReports(index=0,containers=false){
 const fixture=JSON.parse(readFileSync(new URL('../integrations/gitlab/fixtures/'+(containers?'compatibility-task-containers.json':'compatibility-task-conversion.json'),import.meta.url),'utf8'));
 const pair=reports();
 for(const report of pair){
  const input=structuredClone(fixture.cases[index]);report.fixture.cases=[input];
  const item:any=report.observations[0];item.id=input.id;item.input=structuredClone(input);
  item.setup={iid:42};item.modalTitle=input.childTitle;item.prefill='\n'+input.expectedDescription+'\n';
  item.child={title:input.childTitle,type:'Task',parentIid:'42',description:input.expectedDescription};
  item.childEditorProof=structuredClone(item.editorProof);item.modalEditorProof=structuredClone(item.editorProof);
  item.parentAfter={state:'opened',task_completion_status:{count:input.expectedParent.tasks.length,completed_count:1}};item.parentResaved=structuredClone(item.parentAfter);item.parentResaveReachable=true;
  item.graphs={prefill:{codes:[input.expectedCode]},before:{codes:[input.expectedCode]},readerBefore:{codes:[input.expectedCode]},parentReopened:structuredClone(input.expectedParent),parentResaved:structuredClone(input.expectedParentResaved),childReopened:{codes:[input.expectedCode],bold:['bold'],links:[{text:'link',href:'https://example.com/reference'}]}};
  if(input.trackQuotes){const depths=input.expectedParent.tasks.map((task:{depth:number})=>task.depth);const target=input.targetOrdinal??1;const depth=depths[target];depths[target]=depth+1;depths.splice(target,0,depth);for(const phase of ['before','readerBefore'])Object.assign(item.graphs[phase],structuredClone(input.expectedInitialQuotes),{tasks:depths.map((depth:number)=>({depth}))});for(const phase of ['prefill','childReopened'])item.graphs[phase].quoteBlockCount=0;}
 }
 return pair;
}
it.each([0,1,2,3])('requires complete real-child conversion outcomes (%i)',index=>{
 const result=compareGitLabCompatibility(...taskConversionReports(index));expect(result.summary.parity).toBe(20);expect(result.featureAcceptance.passed).toBe(true);
});
it('preserves significant indentation and invisible characters when comparing conversion source',()=>{
 expect(conversionDescription('\n  code\n\tinner\n\u200b\n')).toBe('  code\n\tinner\n\u200b');
 expect(conversionDescription(' x \r\n')).toBe(' x \r');expect(conversionDescription(undefined)).toBeUndefined();
});
it('classifies shared code damage as an unmet feature rather than successful parity',()=>{
 const pair=taskConversionReports();for(const report of pair){const item:any=report.observations[0];item.graphs.prefill.codes=[item.graphs.prefill.codes[0].replace('    return','return')];}
 const result=compareGitLabCompatibility(...pair);expect(result.rows.find((row:any)=>row.invariant==='modal.code').classification).toBe('shared-limitation');expect(result.featureAcceptance.passed).toBe(false);
});
it.each([
 ['child.parent',(item:any)=>{item.child.parentIid='43';}],
 ['child.description',(item:any)=>{item.child.description=item.child.description.replace('    return','return');}],
 ['parent.graph',(item:any)=>{item.graphs.parentReopened.tasks.splice(1,1);}],
 ['child.code',(item:any)=>{item.graphs.childReopened.codes=['def identity(value):\nreturn value'];}],
 ['child.editor',(item:any)=>{item.childEditorProof={native:false,className:'ProseMirror'};}],
])('rejects conversion damage or wrong linkage: %s',(invariant,mutate)=>{
 const [original,fountain]=taskConversionReports();mutate(fountain.observations[0]);const result=compareGitLabCompatibility(original,fountain);
 expect(result.rows.find((row:any)=>row.invariant===invariant).classification).toBe('regression');expect(result.regressionGate.passed).toBe(false);
});
it('requires observed parent linkage rather than assuming a matching title proves it',()=>{
 const [original,fountain]=taskConversionReports();delete (fountain.observations[0] as any).child.parentIid;
 const result=compareGitLabCompatibility(original,fountain);expect(result.summary.incomplete).toBe(1);expect(result.comparisonComplete).toBe(false);
});

it.each([0,1,2,3])('requires intact quote ownership and detached child wrappers (%i)',index=>{
 const result=compareGitLabCompatibility(...taskConversionReports(index,true));expect(result.summary.parity).toBe(26);expect(result.featureAcceptance.passed).toBe(true);
});
it('rejects leaking parent-only quotes into the created child',()=>{
 const [original,fountain]=taskConversionReports(0,true);(fountain.observations[0] as any).graphs.childReopened.quoteBlockCount=1;
 const result=compareGitLabCompatibility(original,fountain);expect(result.rows.find((row:any)=>row.invariant==='childReopened.quotes').classification).toBe('regression');
});
it('requires captured quote ownership instead of treating missing instrumentation as a failure',()=>{
 const [original,fountain]=taskConversionReports(0,true);delete (fountain.observations[0] as any).graphs.before.taskQuoteDepths;
 const result=compareGitLabCompatibility(original,fountain);expect(result.rows.find((row:any)=>row.invariant==='before.quotes').classification).toBe(null);expect(result.summary.incomplete).toBe(1);
});

function conflictPolicyReports(): any[]{
 const fixture=JSON.parse(readFileSync(new URL('../integrations/gitlab/fixtures/compatibility-conflicts.json',import.meta.url),'utf8'));
 const pair=reports();for(const report of pair){report.fixture=fixture;report.observations=fixture.cases.map((input:any)=>({id:input.id,input,editorProof:report.observations[0].editorProof,remoteEditorProof:report.observations[0].editorProof,
  graphs:{initial:input.expectedInitial,remoteInitial:input.expectedInitial,local:input.expectedLocal,remoteSaved:input.expectedRemote,resolved:input.expectedResolved,final:input.expectedFinal},
  independentContexts:true,noAutomaticOverwrite:true,localDraftRetained:true,conflictObserved:true,conflictSourceExact:true,conflictSourceReadonly:true,resolutionSourceExact:true,freshWarningAbsent:true,freshSourceMatchesServer:true,normalSaveReachable:true,finalSourceMatchesServer:true,explicitOverwrite:true,remoteErrors:[]}));}
 return pair;
}
it('interprets completed two-session conflict requirements without treating policy fixtures as browser proof',()=>{
 const result=compareGitLabCompatibility(...conflictPolicyReports());expect(result.summary).toEqual({parity:37,improvement:0,regression:0,'shared-limitation':0,incomplete:0,total:37});expect(result.featureAcceptance.passed).toBe(true);
});
it('fails feature acceptance for a shared absent conflict warning',()=>{
 const pair=conflictPolicyReports();for(const report of pair)for(const item of report.observations)item.conflictObserved=false;
 const result=compareGitLabCompatibility(...pair);expect(result.summary['shared-limitation']).toBe(2);expect(result.regressionGate.passed).toBe(true);expect(result.featureAcceptance.passed).toBe(false);
});
it('does not credit a second session without actual editor proof',()=>{
 const pair=conflictPolicyReports();delete pair[1].observations[0].remoteEditorProof;
 const result=compareGitLabCompatibility(...pair);expect(result.summary.incomplete).toBe(18);expect(result.regressionGate.passed).toBe(false);
});
it('flags draft loss, premature overwrite and stale-session warnings as regressions',()=>{
 for(const key of ['localDraftRetained','noAutomaticOverwrite','freshWarningAbsent']){
  const pair=conflictPolicyReports();pair[1].observations[0][key]=false;
  const result=compareGitLabCompatibility(...pair);expect(result.summary.regression).toBe(1);expect(result.regressionGate.passed).toBe(false);expect(result.featureAcceptance.passed).toBe(false);
 }
});

function accessPolicyReports(): any[]{
 const fixture=JSON.parse(readFileSync(new URL('../integrations/gitlab/fixtures/compatibility-access.json',import.meta.url),'utf8'));
 const pair=reports();for(const report of pair){report.fixture=fixture;const proof=report.observations[0].editorProof;
  report.observations=fixture.cases.map((input:any)=>({id:input.id,input,actor:{id:2,username:fixture.username,isAdmin:false},setup:{authorId:1},membership:{id:2,accessLevel:input.initialAccessLevel},cleanupMembership:{accessLevel:10},editorProof:proof,
   graphs:{initial:input.expectedGraph,reloaded:input.expectedGraph,confirmed:input.expectedConfirmed,recovered:input.expectedPending,final:input.expectedPending},permissionBefore:input.kind==='revocation',permissionRevoked:false,permissionRestored:true,
   editControlAbsent:true,editableRootsAbsent:true,writeDenied:true,serverUnchanged:true,anonymousContentAbsent:true,anonymousEditAbsent:true,anonymousAPIDenied:true,
   initialWriteSucceeded:true,draftStayedLocal:true,revokedWriteBlocked:true,deniedSaveReported:true,draftRetainedAfterDenial:true,draftRecoveredAfterReload:true,finalSourceExact:true,finalReopenExact:true,actorErrors:[]}));}
 return pair;
}
it('interprets bounded non-author Guest and live-revocation evidence separately from browser execution',()=>{
 const result=compareGitLabCompatibility(...accessPolicyReports());expect(result.summary).toEqual({parity:31,improvement:0,regression:0,'shared-limitation':0,incomplete:0,total:31});expect(result.featureAcceptance.passed).toBe(true);
});
it('refuses a reader claim made with an administrator or record author',()=>{
 for(const patch of [{isAdmin:true},{id:1}]){const pair=accessPolicyReports();Object.assign(pair[1].observations[0].actor,patch);const result=compareGitLabCompatibility(...pair);expect(result.summary.incomplete).toBe(13);expect(result.regressionGate.passed).toBe(false);}
});
it('fails acceptance if both editors silently lose the denied draft',()=>{
 const pair=accessPolicyReports();for(const report of pair)report.observations[1].draftRetainedAfterDenial=false;
 const result=compareGitLabCompatibility(...pair);expect(result.summary['shared-limitation']).toBe(1);expect(result.featureAcceptance.passed).toBe(false);
});
it('requires actual rich editor proof for the active Developer workflow',()=>{
 const pair=accessPolicyReports();delete pair[1].observations[1].editorProof;const result=compareGitLabCompatibility(...pair);expect(result.summary.incomplete).toBe(11);expect(result.regressionGate.passed).toBe(false);
});
it('rejects native unauthorized writes or anonymous content disclosure',()=>{
 for(const [index,key]of [[0,'writeDenied'],[0,'anonymousContentAbsent'],[1,'revokedWriteBlocked']] as const){const pair=accessPolicyReports();pair[1].observations[index][key]=false;const result=compareGitLabCompatibility(...pair);expect(result.summary.regression).toBe(1);expect(result.regressionGate.passed).toBe(false);}
});

it('requires the same actual non-admin actor on both sides, not just the same role label',()=>{
 const pair=accessPolicyReports();pair[1].observations[0].actor.id=3;pair[1].observations[0].membership.id=3;const result=compareGitLabCompatibility(...pair);expect(result.environment.matched).toBe(false);expect(result.environment.mismatches).toContain('guest-readonly.actor');expect(result.summary.incomplete).toBe(31);
});

function membershipRemovalPolicyReports(): any[]{
 const fixture=JSON.parse(readFileSync(new URL('../integrations/gitlab/fixtures/compatibility-access-removal.json',import.meta.url),'utf8'));
 const pair=accessPolicyReports();for(const report of pair){
  const base=report.observations[1];report.fixture=fixture;
  report.observations=fixture.cases.map((input:any)=>{const pending=input.pendingMode==='empty'?'':'Pending source';return {...base,id:input.id,input,
   graphs:{initial:structuredClone(input.expectedGraph),confirmed:structuredClone(input.expectedConfirmed),recovered:structuredClone(input.expectedPending),final:structuredClone(input.expectedPending),deniedBeforeInspection:structuredClone(input.expectedPending),deniedAfterInspection:structuredClone(input.expectedPending)},
   confirmedSource:'Confirmed source',confirmedSaved:{description:'Confirmed source'},pendingSource:pending,retainedSource:pending,recoveredSource:pending,finalReopenedSource:pending,
   membersAfterRemoval:[],accessBeforeRemoval:{restJSON:true,graphqlEnvelope:true,restStatus:200,restDescription:'Confirmed source',graphqlStatus:200,graphqlErrors:[],itemPresent:true,graphqlDescription:'Confirmed source'},
   accessAfterRemoval:{restJSON:true,graphqlEnvelope:true,restStatus:404,restDescription:null,graphqlStatus:200,graphqlErrors:[],itemPresent:false,graphqlDescription:null},
   sessionAfterRemoval:{id:2,username:fixture.username},removedRESTWriteStatus:404,afterRESTProbe:{description:'Confirmed source'},errorAlerts:['Access was denied.'],errorAlertsAfterInspection:['Access was denied.'],
   deniedInspection:{loadingCount:0,richVisible:true,errorCode:null,alerts:['Access was denied.'],recoverySource:null},
   finalSaved:{description:input.pendingMode==='empty'?null:pending},finalSourceExact:input.pendingMode!=='empty',finalEmptyStored:input.pendingMode==='empty',
  };});
 }
 return pair;
}
it('interprets full membership-removal controls and text/empty recovery as separate bounded evidence',()=>{
 const result=compareGitLabCompatibility(...membershipRemovalPolicyReports());
 expect(result.summary).toEqual({parity:64,improvement:0,regression:0,'shared-limitation':0,incomplete:0,total:64});
 expect(result.featureAcceptance.passed).toBe(true);
});
it.each([
 (item:any)=>{item.accessAfterRemoval.restStatus=200;},
 (item:any)=>{item.accessAfterRemoval.restDescription='Leaked private source';},
 (item:any)=>{item.accessAfterRemoval.itemPresent=true;},
 (item:any)=>{item.accessAfterRemoval.graphqlEnvelope=false;},
 (item:any)=>{item.membersAfterRemoval=[{id:2,username:'fountain_compat_access',accessLevel:30}];},
 (item:any)=>{item.sessionAfterRemoval.id=3;},
 (item:any)=>{item.removedRESTWriteStatus=200;},
 (item:any)=>{item.afterRESTProbe.description='Unauthorized change';},
 (item:any)=>{item.errorAlerts=['Someone edited the description at the same time you did.'];},
 (item:any)=>{item.errorAlertsAfterInspection=['An error occurred while trying to render the rich text editor.'];},
 (item:any)=>{item.deniedInspection.richVisible=false;},
 (item:any)=>{item.deniedInspection.loadingCount=1;},
 (item:any)=>{item.deniedInspection.errorCode='GITLAB_NATIVE_OPERATION_FAILED';},
])('rejects contradictory raw authorization or feedback evidence even with passing observation flags',mutate=>{
 const pair=membershipRemovalPolicyReports();mutate(pair[1].observations[0]);const result=compareGitLabCompatibility(...pair);
 expect(result.summary.regression).toBe(1);expect(result.regressionGate.passed).toBe(false);expect(result.featureAcceptance.passed).toBe(false);
});
it('requires observed positive controls and denies missing removal receipts a completed comparison',()=>{
 for(const key of ['accessBeforeRemoval','accessAfterRemoval','membersAfterRemoval','sessionAfterRemoval','removedRESTWriteStatus','afterRESTProbe','errorAlerts','errorAlertsAfterInspection','deniedInspection']){
  const pair=membershipRemovalPolicyReports();delete pair[1].observations[0][key];const result=compareGitLabCompatibility(...pair);
  expect(result.summary.incomplete).toBeGreaterThan(0);expect(result.comparisonComplete).toBe(false);expect(result.regressionGate.passed).toBe(false);
 }
});
it('does not mistake null/missing recovered draft source for an intentionally empty draft',()=>{
 for(const value of [null,undefined,'Server content']){
  const pair=membershipRemovalPolicyReports();pair[1].observations[1].recoveredSource=value;const result=compareGitLabCompatibility(...pair);
  expect(result.featureAcceptance.passed).toBe(false);expect(result.regressionGate.passed).toBe(false);
 }
});
it('ignores only a caret paragraph for explicit empty intent while preserving substantive content checks',()=>{
 const pair=membershipRemovalPolicyReports();pair[1].observations[1].graphs.recovered.prose=[''];
 expect(compareGitLabCompatibility(...pair).featureAcceptance.passed).toBe(true);
 pair[1].observations[1].graphs.recovered.prose=['Unexpected text'];
 expect(compareGitLabCompatibility(...pair).summary.regression).toBe(1);
});

it('does not count a private empty HTML carrier as the author clearing Markdown',()=>{
 const pair=membershipRemovalPolicyReports();pair[1].observations[1].pendingSource='<p data-fountain-empty="text"></p>';
 const result=compareGitLabCompatibility(...pair);
 expect(result.rows.find((row:any)=>row.case==='developer-removed-empty'&&row.invariant==='removal.empty.intent')?.classification).toBe('regression');
 expect(result.featureAcceptance.passed).toBe(false);
});

it('requires a completed loading observation for the removal render claim',()=>{
 const pair=membershipRemovalPolicyReports();delete pair[1].observations[0].deniedInspection.loadingCount;
 const result=compareGitLabCompatibility(...pair);expect(result.comparisonComplete).toBe(false);expect(result.summary.incomplete).toBeGreaterThan(0);
});
