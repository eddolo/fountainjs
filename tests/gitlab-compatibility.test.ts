import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
// These are tests of interpretation policy, not real application evidence.
// @ts-expect-error Private JS audit helper intentionally has no published type entry.
import {classifyInvariant,compareGitLabCompatibility,suggestionBlock,clipboardParagraphs,conversionDescription} from '../integrations/gitlab/testing/compatibility.mjs';
// @ts-expect-error Private integration comparator has no published declarations.
import {batchReviewChecks} from '../integrations/gitlab/testing/batch-review.mjs';
it('rejects a partial batch write even when the server refuses the batch and the original branch head is reported', () => {
 const input = {source:'a\nb\nc\n',range:{start:1},secondLine:3,competingSource:'a\nb\nnew\n'};
 const fixture = {appendLine:'extra\n',secondReplacement:'replacement',marker:'first',secondMarker:'second',commitMessage:'batch'};
 const seed = 'a'.repeat(40), head = 'b'.repeat(40);
 const notes = ['a','c'].map((text,index) => {
   const replacement = index ? 'replacement\n' : 'a\nextra\n';
   const suggestion = {id:index+20,from_line:index*2+1,to_line:index*2+1,from_content:text+'\n',to_content:replacement,applied:false,appliable:true};
   return {id:index+10,body:'```suggestion:-0+0\n'+replacement+'```\n\n'+(index?'second':'first'),suggestions:[suggestion]};
 });
 const before = {head:seed,fileCommit:seed,source:input.source,notes};
 const after = {head,fileCommit:head,parents:[seed],source:input.competingSource,notes:structuredClone(notes)};
 const item = {setup:{seedCommit:seed},batch:{before,beforeSubmit:structuredClone(before),competingCommit:{id:head,parents:[seed]},
   response:{status:400,request:{ids:[21,20],commit_message:'batch'}},after,reloaded:structuredClone(after)}};
 const score = () => batchReviewChecks(input,fixture,item).values;
 const validHead='c'.repeat(40), recoveredSource='a\nextra\nb\nnew\n';
 const eligibleBefore=structuredClone(after);
 eligibleBefore.notes[1]!.suggestions[0]!.appliable=false;
 const recovered={...structuredClone(eligibleBefore),head:validHead,fileCommit:validHead,parents:[head],message:'apply remaining',source:recoveredSource};
 recovered.notes[0]!.suggestions[0]!.applied=true;
 const recovery={queuedAfterRefusal:[true,true],remaining:[true,false],before:eligibleBefore,after:recovered,reloaded:structuredClone(recovered),
   response:{status:200,path:'/api/v4/suggestions/20/apply',request:{commit_message:'apply remaining'}},badges:[true,false]};
 const recoveryScore = () => batchReviewChecks({...input,recoverUnchanged:true,recoveredSource},{...fixture,recoveryMessage:'apply remaining'},
   {...item,batch:{...item.batch,reloaded:eligibleBefore,recovery}}).values;
 expect(recoveryScore()).toMatchObject({recoveryQueue:true,recoveryBefore:true,recoveryRequest:true,recoveryFile:true,recoveryCommit:true,recoveryNotes:true,recoveryBadges:true});
 recovery.reloaded.notes[1]!.suggestions[0]!.applied=true;
 recovery.reloaded.parents=[seed];
 expect(recoveryScore()).toMatchObject({recoveryNotes:false,recoveryCommit:false});
 expect(score()).toMatchObject({authored:true,untouched:true,submitted:true,decision:true,afterCommit:true,afterNotes:true,afterSource:true});
 after.notes[0]!.suggestions[0]!.applied=true;
 after.source='a\nextra\nb\nnew\n';
 item.batch.response.request.ids=[21,21];
 expect(score()).toMatchObject({submitted:false,decision:true,afterCommit:true,afterNotes:false,afterSource:false});
});
it('checks inclusive source ranges, atomic overlap refusal and a distinct adjacent control', () => {
 const seed='a'.repeat(40);
 const fixture={appendLine:'end\n',secondReplacement:'replacement',marker:'one',secondMarker:'two',commitMessage:'both'};
 const input={source:'a\nb\nc\nd\n',range:{start:2,end:3},secondLine:3};
 const notes=[['b\nc\n','b\nc\nend\n','-1+0','one'],['c\n','replacement\n','-0+0','two']].map(([from,to,offset,marker],i)=>({
   id:10+i,body:'```suggestion:'+offset+'\n'+to+'```\n\n'+marker,
   suggestions:[{id:20+i,from_line:2+i,to_line:3,from_content:from,to_content:to,applied:false,appliable:true}],
 }));
 const before={head:seed,fileCommit:seed,source:input.source,parents:['b'.repeat(40)],notes};
 const batch={before,beforeSubmit:structuredClone(before),after:structuredClone(before),reloaded:structuredClone(before),
   response:{status:400,body:{message:'Suggestions are not applicable as their lines cannot overlap.'},request:{ids:[20,21],commit_message:'both'}}};
 const score=()=>batchReviewChecks(input,fixture,{setup:{seedCommit:seed},batch}).values;
 expect(score()).toMatchObject({authored:true,decision:true,submitted:true,afterSource:true,afterCommit:true,afterNotes:true});
 batch.after.head='c'.repeat(40);
 batch.after.notes[0]!.suggestions[0]!.to_line=2;
 batch.response.body.message='A file has been changed.';
 expect(score()).toMatchObject({decision:false,afterCommit:false,afterNotes:false});
 expect(batchReviewChecks({...input,secondLine:4},fixture,{}).labels.decision).toBe('GitLab accepts the batch request');
});
it('distinguishes an open confirmation from fresh Reporter controls and verifies the same reviewer returns', () => {
 const seed='a'.repeat(40), fixture={username:'reviewer',appendLine:'end\n',commitMessage:'Keep this review message across the handoff'};
 const input={source:'a\nb\n',range:{start:1},secondLine:2,reviewerRoleChange:true};
 const actor={id:14,username:fixture.username};
 const role=(accessLevel:number)=>({...actor,accessLevel});
 const control={header:true,canApply:false,canAdd:false,queued:false};
 const reader={confirmEnabled:false,canApplyBatch:false,notes:[{...control},{...control}]};
 const before={head:seed,fileCommit:seed,source:input.source,notes:[]};
 const roles={actor,initial:role(30),lowered:role(20),restored:role(30),cleanup:role(10),
   open:{confirmEnabled:true,canApplyBatch:true},sampleMs:3100,fresh:reader,saved:structuredClone(before),requestsBeforeConfirmation:[] as string[]};
 const score=()=>batchReviewChecks(input,fixture,{setup:{seedCommit:seed},batch:{before,roles}}).values;
 expect(score()).toMatchObject({reviewerIdentity:true,reviewerLive:false,reviewerFresh:true,reviewerNoWrite:true});
 const message='Keep this review message across the handoff';
 const retained={...roles,accessNotice:true,draftBefore:message,draftAfter:message,
   returned:{confirmEnabled:true,notes:[{header:true,queued:true},{header:true,queued:true}]}};
 const retention=()=>batchReviewChecks(input,fixture,{setup:{seedCommit:seed},batch:{before,roles:retained}}).values;
 expect(retention()).toMatchObject({reviewerNotice:true,reviewerDraft:true});
 retained.draftAfter=''; retained.accessNotice=false;
 expect(retention()).toMatchObject({reviewerNotice:false,reviewerDraft:false});
 roles.fresh.notes[1]!.canApply=true;
 roles.restored.id++;
 roles.requestsBeforeConfirmation.push('/api/v4/suggestions/batch_apply');
 expect(score()).toMatchObject({reviewerIdentity:false,reviewerFresh:false,reviewerNoWrite:false});
});
it('requires the live reason on the changed note and rejects a hidden submission', () => {
 const reason="Can't apply as this line was changed in a more recent version.";
 const instruction='Remove this suggestion from the batch to continue the review.';
 const input={waitForLiveUpdate:true,source:'value',range:{start:1},secondLine:1};
 const update={disabled:true,confirmVisible:false,queue:[true,true],requests:[] as string[],text:reason+' '+instruction,otherText:''};
 const recovery={removedText:'',queuedAfterRefusal:[true,true],remaining:[true,false]};
 const item={setup:{seedCommit:'a'.repeat(40)},batch:{before:{notes:[]},confirmUnavailable:true,liveUpdate:update,visibleBadges:[false,false],recovery}};
 const score=()=>batchReviewChecks(input,{},item).values;
 expect(score()).toMatchObject({decision:true,submitted:true,feedback:true,promptScoped:true});
 update.requests.push('/api/v4/suggestions/batch_apply');
 recovery.removedText=instruction;
 expect(score()).toMatchObject({submitted:false,promptScoped:false});
 update.text=instruction;
 expect(score().feedback).toBe(false);
});
it('rejects swapped equal-line review targets and writes to an identical untouched copy', () => {
 const paths=['live/config.js','backup/config.js','untouched/config.js'];
 const input={source:'same\n',expectedSource:'same\nfirst\n',expectedSecondSource:'second\n',range:{start:1},secondLine:1,
   filePath:paths[0],secondFilePath:paths[1],untouchedFilePath:paths[2]};
 const seed='a'.repeat(40), head='b'.repeat(40);
 const notes=paths.slice(0,2).map((path,i)=>({id:i+1,position:{old_path:path,new_path:path,new_line:1},suggestions:[]}));
 const snapshot=(changed:string[], sources:string[], commits:string[])=>({
   head,notes:structuredClone(notes),files:Object.fromEntries(paths.map((p,i)=>[p,{source:sources[i],commit:commits[i]}])),
   changedPaths:changed.map(p=>({from:p,to:p})),
 });
 const before=snapshot(paths,paths.map(()=>input.source),paths.map(()=>seed));
 const after=snapshot(paths.slice(0,2),[input.expectedSource,input.expectedSecondSource,input.source],[head,head,seed]);
 const dismissed={queue:[true,true],requests:[] as string[],state:structuredClone(before)};
 const item={setup:{seedCommit:seed},batch:{before,beforeSubmit:structuredClone(before),dismissed,after,reloaded:structuredClone(after)}};
 const score=()=>batchReviewChecks(input,{},item).values;
 expect(score()).toMatchObject({positions:true,seedFiles:true,fileWrites:true,dismissed:true});
 dismissed.requests.push('/api/v4/suggestions/batch_apply');
 expect(score().dismissed).toBe(false);
 item.batch.reloaded.notes.reverse();
 expect(score().positions).toBe(false);
 after.files[paths[2]!]!.commit=head;
 expect(score().fileWrites).toBe(false);
 after.files[paths[2]!]!.commit=seed;
 after.changedPaths.push({from:paths[2]!,to:paths[2]!});
 expect(score().fileWrites).toBe(false);
});
it.each([
 [true,true,true,'parity'],[true,false,true,'improvement'],[true,true,false,'regression'],[true,false,false,'shared-limitation'],
 ['exact','changed-a','changed-b',null],[true,undefined,true,null],[true,true,undefined,null],
])('classifies only matched observed outcomes %j / %j / %j', (expected,original,fountain,classification)=>{
 expect(classifyInvariant(expected,original,fountain)).toBe(classification);
});
it('scores applied history from the reloaded record when the first body read still has the previous ID', () => {
 const pair = reports();
 const input = {id: 'handoff', scope: 'full-review', range: {start: 1, end: 1}, source: 'first\n', historyControls: true};
 const applied = {id: 8, applied: true, to_content: 'replacement\n'};
 for (const report of pair) {
   Object.assign(report.fixture, {cases: [input]});
   Object.assign(report.observations[0]!, {input, appliedNote: {suggestions: [applied]}, afterProseNote: {suggestions: [applied]},
     history: {phases: {}, initial: {suggestions: [report.side === 'original' ? {...applied, id: 9, applied: false} : applied]}}});
 }
 const rows = compareGitLabCompatibility(...pair).rows;
 for (const key of ['stableSuggestionId', 'appliedFlag'])
   expect(rows.find((row: any) => row.invariant === key).classification).toBe('improvement');
});
it('checks a widened proposal against the already-applied file and the identity of its neighbor', () => {
 const pair = reports();
 const input = {id: 'handoff', scope: 'full-review', range: {start: 1, end: 1}, source: 'first\nsecond\n', historyControls: true};
 const pending = {id: 10, applied: false, from_content: 'first\n', to_content: 'changed\n'};
 const neighbor = {id: 11, applied: false, from_content: 'first\n', to_content: 'another\n'};
 for (const report of pair) {
   Object.assign(report.fixture, {cases: [input], comparisonProposal: 'another', changedProposal: 'changed'});
   Object.assign(report.observations[0]!, {input, history: {phases: {
     change: {saved: {suggestions: [pending, neighbor]}},
     range: {saved: {suggestions: [{...pending}, {...neighbor, id: 12, from_content: 'first\n// review\n'}]}},
   }}});
 }
 const classifyRange = () => compareGitLabCompatibility(...pair).rows.find((row: any) => row.invariant === 'historyRange').classification;
 expect(classifyRange()).toBe('parity');
 const records = (pair[1]!.observations[0] as any).history.phases.range.saved.suggestions;
 records[1].from_content = 'first\nsecond\n';
 expect(classifyRange()).toBe('regression');
 records[1].from_content = 'first\n// review\n';
 records[0].id = 15;
 expect(classifyRange()).toBe('regression');
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
it('identifies the prepared Tiptap rollback build separately from packaged GitLab', async () => {
 // @ts-expect-error Private JS audit helper intentionally has no published type entry.
 const {buildIdentityError, preparedRollbackTree} = await import('../integrations/gitlab/testing/build-identity.mjs');
 const [prepared, fountain] = reports() as any[];
 prepared.side = prepared.buildIdentity.side = 'prepared';
 const digest = '2'.repeat(64);
 prepared.frontendManifests = [digest + '  /opt/gitlab/embedded/service/gitlab-rails/public/assets/webpack/manifest.rspack.json'];
 prepared.deployment.assetMount = [{readOnly:true}];
 const {expected, observed} = prepared.buildIdentity;
 Object.assign(expected,{sourceTree:preparedRollbackTree,rspackManifestSHA256:digest});
 observed.manifestSHA256 = createHash('sha256').update(prepared.frontendManifests[0]).digest('hex');
 expect(buildIdentityError(prepared)).toBeTruthy();
 observed.scripts[0].preparedHandoff = true;
 expect(buildIdentityError(prepared)).toBeTruthy();
 observed.scripts[0].preparedSaveEcho = true;
 expect(buildIdentityError(prepared)).toBeTruthy();
 expected.sourceTree = '075b931b09e4a1b2123bda61cc8f17a2d84c119c';
 expect(buildIdentityError(prepared)).toBeNull();
 observed.scripts[0].preparedToolbarFocus = true;
 expect(buildIdentityError(prepared)).toBeTruthy();
 expected.sourceTree = preparedRollbackTree;
 expect(buildIdentityError(prepared)).toBeNull();
 expect(compareGitLabCompatibility(prepared,fountain).environment.matched).toBe(false);
 expected.rspackManifestSHA256 = '3'.repeat(64);
 expect(buildIdentityError(prepared)).toBeTruthy();
});
it('requires both board and full-page editors and checks persisted marks after navigating back', () => {
 const [original, fountain] = reports() as any[];
 const fixture = JSON.parse(readFileSync(new URL('../integrations/gitlab/fixtures/compatibility-board-issues.json', import.meta.url), 'utf8'));
 const input = fixture.cases[0];
 for (const report of [original, fountain]) {
   report.fixture = fixture;
   const item = report.observations[0];
   const description = {text:input.prefix + input.bold, bold:[input.bold]};
   Object.assign(item, {id:input.id, input, status:'observed', fullEditorProof:item.editorProof, pageErrors:[],
     facts:{created:true, drawerReference:true, sameCard:true, drawerRead:description, fullPageRead:description, desktopSaveVisible:true, narrowSaveVisible:true, singleCardAtDrawerReady:true,
       reopenedDescription:description, reopenedComment:{text:input.comment, bold:[input.comment]},
       savedDescription:input.prefix + '**' + input.bold + '**', savedComments:['**' + input.comment + '**']}});
 }
 const compare = () => compareGitLabCompatibility(original, fountain);
 expect(compare().summary.parity).toBe(13);
 fountain.observations[0].facts.reopenedComment.bold = [];
 expect(compare().rows.find((row:any) => row.invariant === 'reopenedComment').classification).toBe('regression');
 delete fountain.observations[0].fullEditorProof;
 expect(compare().summary.incomplete).toBe(13);
});
it('withholds personal-template acceptance if another writer sees the template or the second editor is unidentified', () => {
 const [original, fountain] = reports() as any[];
 const fixture = JSON.parse(readFileSync(new URL('../integrations/gitlab/fixtures/compatibility-saved-replies.json', import.meta.url), 'utf8'));
 const input = fixture.cases.find((entry: {scope:string}) => entry.scope === 'saved-reply-accounts');
 for (const report of [original, fountain]) {
   report.fixture = {...fixture, cases:[input]};
   const item = report.observations[0];
   const writers: {username:string; markdown:string; text:string; label:string}[] = input.authors;
   Object.assign(item, {id:input.id, input, status:'observed', reporterEditorProof:item.editorProof, pageErrors:[],
     membership:{username:fixture.username,accessLevel:input.reporterAccess},
     facts:{notes:writers.map(writer => ({username:writer.username, body:writer.markdown}))}});
   for (const writer of writers) {
     item.facts[writer.label + 'Picker'] = {ownVisible:true,otherTitleCount:0,otherContentVisible:false};
     item.facts[writer.label + 'Reader'] = writers.map(other => other.text);
   }
 }
 const score = () => compareGitLabCompatibility(original, fountain);
 expect(score().summary.parity).toBe(7);
 fountain.observations[0].facts.reporterPicker.otherContentVisible = true;
 expect(score().rows.find((row:any) => row.invariant === 'reporterPicker').classification).toBe('regression');
 delete fountain.observations[0].reporterEditorProof;
 expect(score().summary.incomplete).toBe(7);
});
it('checks historical wiki source and retained revision identities independently of current reader text', () => {
 const [original, fountain] = reports() as any[];
 const fixture = JSON.parse(readFileSync(new URL('../integrations/gitlab/fixtures/compatibility-wiki-history.json',import.meta.url),'utf8'));
 const c = fixture.cases[0];
 const edited = c.source.replace(c.paragraph,c.paragraph + c.addition);
 const before = [{version:'v2',sha:'2'.repeat(40),message:'Edit'},{version:'v1',sha:'1'.repeat(40),message:'Create'}];
 const after = [{version:'v3',sha:'3'.repeat(40),message:c.restoreMessage},...before];
 for (const report of [original,fountain]) {
   report.fixture = fixture;
   Object.assign(report.observations[0], {id:c.id,input:c,status:'observed',pageErrors:[],initialSource:c.source,
     typed:c.paragraph+c.addition,editedReader:c.paragraph+c.addition,reopened:c.paragraph+c.addition,
     editedSource:edited,oldReader:c.paragraph,afterCancelSource:edited,restoredSource:c.source,restoredReader:c.paragraph,
     restoredOwner:['Release team'],before:structuredClone(before),after:structuredClone(after),
     revisions:after.map((row,index)=>({sha:row.sha,source:index===1?edited:c.source}))});
 }
 const compare = () => compareGitLabCompatibility(original,fountain);
 expect(compare().summary.parity).toBe(16);
 fountain.observations[0].revisions[1].source=c.source;
 fountain.observations[0].before[0].sha=before[1]!.sha;
 expect(compare().rows.filter((row:any)=>row.classification==='regression').map((row:any)=>row.invariant)).toEqual(['retainedHistory','revisionSources']);
 expect(compare().featureAcceptance.passed).toBe(false);
});
it('evaluates the stale restore notice, intervening revision and intentional retry independently', () => {
  const [original, fountain] = reports() as any[];
  const fixture = JSON.parse(readFileSync(new URL('../integrations/gitlab/fixtures/compatibility-wiki-restore-conflict.json', import.meta.url), 'utf8'));
  const input = fixture.cases[0];
  const paragraph = input.paragraph + input.addition + input.competingEdit;
  const edited = input.source.replace(input.paragraph, input.paragraph + input.addition);
  const latest = input.source.replace(input.paragraph, paragraph);
  const history = [input.restoreMessage, input.writerMessage, 'Edit', 'Seed'].map((message, index) =>
    ({version:'v' + (4 - index), sha:String(4 - index).repeat(40), message}));
  for (const report of [original, fountain]) {
    report.fixture = fixture;
    Object.assign(report.observations[0], {
      id:input.id, input, status:'observed', openLock:history[2]!.sha, retryLock:history[1]!.sha,
      before:history.slice(2), afterStaleHistory:history.slice(1), after:history, pageErrors:[],
      editedSource:edited, writerSource:latest, writerReader:paragraph, latestReader:paragraph, afterStale:latest,
      noticeText:'Someone edited the page the same time you did.', noticeVisible:true,
      noticeLinksToCurrentPage:true, reviewedFromNotice:paragraph,
      restoredSource:input.source, restoredReader:input.paragraph,
      revisions:history.map(({sha}, i) => ({sha, source:[input.source, latest, edited, input.source][i]})),
    });
  }
  const compare = () => compareGitLabCompatibility(original, fountain);
  expect(compare().featureAcceptance.passed).toBe(true);
  Object.assign(fountain.observations[0], {
    noticeText:'Review %{wikiLinkStart}the page%{wikiLinkEnd}.', reviewedFromNotice:input.paragraph,
    afterStale:input.source, retryLock:history[2]!.sha,
  });
  expect(compare().rows.filter((row:any) => row.classification === 'regression').map((row:any) => row.invariant))
    .toEqual(['readableNotice','reviewedFromNotice','afterStale','retriedAtV3']);
  expect(compare().featureAcceptance.passed).toBe(false);
});
it('requires the rename-history gate and checks sources at the path used by each revision', () => {
  const [original, fountain] = reports() as any[];
  const {cases} = JSON.parse(readFileSync(new URL('../integrations/gitlab/fixtures/compatibility-wiki-rename.json', import.meta.url), 'utf8'));
  const input = cases.find((entry: {followRenames:boolean}) => entry.followRenames);
  const edited = input.source.replace(input.paragraph, input.paragraph + input.addition);
  const history = [input.restoreMessage, input.renameMessage, 'Edit', 'Seed'].map((message,index) =>
    ({version:'v' + (4-index), sha:String(4-index).repeat(40), message}));
  for (const side of [original, fountain]) {
    side.fixture = {cases:[input]};
    Object.assign(side.observations[0], {id:input.id, input, status:'observed', slug:'old', newSlug:'new',
      renameProfile:{defaultEnabled:false, before:null, enabled:true, after:null, gate:{key:'actors',value:['Project:' + side.backend.project.id]}},
      before:history.slice(2), renamedHistory:history.slice(1), after:history, movedToExpectedPath:true,
      editedSource:edited, sourceAfterRename:edited, oldBookmarkRedirect:true, oldBookmarkReader:input.paragraph + input.addition,
      oldRevisionReader:input.paragraph, oldRevisionSource:input.source, selectedV1:true, historyReader:input.paragraph,
      restoredSource:input.source, restoredReader:input.paragraph, pageErrors:[],
      revisions:history.map(({sha}, i) => ({sha, slug:i < 2 ? 'new' : 'old', source:[input.source,edited,edited,input.source][i]})),
    });
  }
  const compare = () => compareGitLabCompatibility(original, fountain);
  expect(compare().featureAcceptance.passed).toBe(true);
  fountain.observations[0].revisions[3].slug = 'new';
  expect(compare().rows.find((row:any) => row.invariant === 'revisionSources')?.classification).toBe('regression');
  fountain.observations[0].renameProfile.after = {state:'on'};
  expect(compare().environment.matched).toBe(false);
  expect(compare().comparisonComplete).toBe(false);
});
it('checks the reopened title independently from the YAML source and visible body', () => {
  const [original, fountain] = reports() as any[];
  const fixture = JSON.parse(readFileSync(new URL('../integrations/gitlab/fixtures/compatibility-wiki-titles.json', import.meta.url), 'utf8'));
  const input = fixture.cases[0];
  const expectedSource = input.source.replace(input.headerBefore, () => input.headerAfter);
  for (const report of [original, fountain]) {
    report.fixture = {cases:[input]};
    Object.assign(report.observations[0], {id:input.id, input, status:'observed', initialTitle:'First rotation',
      savedTitle:input.newTitle, restoredTitle:'First rotation', editedSource:expectedSource});
  }
  fountain.observations[0].editedSource = expectedSource.replace('# maintainers', '');
  fountain.observations[0].restoredTitle = input.newTitle;
  const {rows} = compareGitLabCompatibility(original, fountain);
  const rating = (key:string) => rows.find((row:any) => row.invariant === key)?.classification;
  expect(rating('savedTitle')).toBe('parity');
  expect(rating('editedSource')).toBe('regression');
  expect(rating('recoveredTitle')).toBe('regression');
});
it('requires the mounted wiki controller to match its receipt on both deployments', () => {
 const [original, fountain] = reports() as any[];
 const path = 'app/controllers/concerns/wiki_actions.rb';
 const stock = '9238c854298dea8d7997442fa9f93dba048e6f02799e4711047b430e0b831c8c';
 const patched = '1'.repeat(64);
 for (const report of [original, fountain]) {
   report.deployment.wikiRestore = {revision:report.buildIdentity.expected.gitlabCommit,
     patchSHA256:'2'.repeat(64), files:{[path]:{original:stock,patched}}};
   report.backend.serverSources = [patched + '  /opt/gitlab/embedded/service/gitlab-rails/' + path];
 }
 expect(compareGitLabCompatibility(original,fountain).environment.matched).toBe(true);
 for (const report of [original,fountain]) report.backend.serverSources = [];
 expect(compareGitLabCompatibility(original,fountain).environment.matched).toBe(false);
});
it('requires the loaded suggestion services to match the declared backend on each editor', () => {
 const pair = reports();
 const files = {
   'app/services/notes/update_service.rb': '8387e916fc949a06bcd02b2b021a627d3711dfc0bab5ebf80269502ed098a5f2',
   'app/services/suggestions/create_service.rb': '62f36b02054509242ffd628ce2f8e0b2205a0faf5a9144ffd30f9fbc5cf38e4a',
 };
 for (const report of pair) {
   Object.assign(report, {suite: 'review-history'});
   report.backend.serverSources = Object.entries(files).map(([file, hash]) => hash + '  /opt/gitlab/embedded/service/gitlab-rails/' + file);
 }
 expect(compareGitLabCompatibility(...pair).environment.matched).toBe(true);
 for (const report of pair) Object.assign(report.deployment, {suggestionHistory: {
   revision: report.buildIdentity.expected.gitlabCommit, patchSHA256: '3'.repeat(64),
   files: Object.fromEntries(Object.entries(files).map(([file, original]) => [file, {original, patched: '4'.repeat(64)}])),
 }});
 expect(compareGitLabCompatibility(...pair).environment.matched).toBe(false);
 for (const report of pair) report.backend.serverSources = report.backend.serverSources.map(line => '4'.repeat(64) + line.slice(64));
 expect(compareGitLabCompatibility(...pair).environment.matched).toBe(true);
 (pair[0]!.deployment as any).suggestionHistory.files = {};
 expect(compareGitLabCompatibility(...pair).environment.matched).toBe(false);
});
it('refuses to classify a mismatched backend, candidate instrument, input or browser as parity',()=>{
 for(const mutate of [
  (report:any)=>{report.deployment.backendEnvironmentHash='different';},
  (report:any)=>{report.buildIdentity.expected.gitlabCommit='a'.repeat(39)+'b';},
  (report:any)=>{report.backend.project.defaultHead='different';},
  (report:any)=>{report.browser.version='different';},
  (report:any)=>{report.harnessHashes.driver='different';},
  (report:any)=>{report.buildProbeIssue={iid:7,descriptionSHA256:'different'};},
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
it('withholds paired feature acceptance when only the replacement completed the workflow', () => {
 const [original, fountain] = reports();
 (original as any).observations = [];
 (original as any).collectionComplete = false;
 const result = compareGitLabCompatibility(original, fountain);
 expect(result.environment.matched).toBe(true);
 expect(result.comparisonComplete).toBe(false);
 expect(result.featureAcceptance.passed).toBe(false);
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
   before:'Release now.',beforeNotes:['**Reviewed**'],quickSavePassed:true,quickSaveMeasured:true,quickSaveAfterReload:text,
   reviewedSaveAfterReload:'Release now. Verified in Markdown.',notes:['**Reviewed**'],
   gesture:{trustedKey:true,trustedClick:true,key:'.',button:'Save changes',paragraphs:[text],keyAt:0,clickAt:25}}));
 Object.assign(original,{rollbackRequested:true,rollback:{passed:true,records}});
 const passed = () => compareGitLabCompatibility(original,fountain).frontendRollback.passed;
 expect(passed()).toBe(true);
 records[0]!.before='_Release now._';
 expect(passed()).toBe(false);
 records[0]!.before='Release now.';
 records[1]!.gesture.clickAt = 150;
 expect(passed()).toBe(false);
 records[1]!.gesture.clickAt = 25;
 const firstEdit = 'Release now. First Markdown save.';
 const richEdit = firstEdit + ' Checked after rollback.';
 Object.assign(original.observations[0]!,{iid:1});
 Object.assign(fountain.observations[0]!,{iid:2});
 Object.assign((original as any).rollback,{formatVersion:2,candidateBuild:(fountain as any).buildIdentity.expected});
 expect(passed()).toBe(false);
 for (const record of records) {
   const firstMarkdownGesture = {trustedKey:true,trustedClick:true,key:'.',button:'Save changes',sourceValue:firstEdit,keyAt:3,clickAt:15};
   Object.assign(record,{firstMarkdownGesture, firstMarkdownAfterReload:firstEdit, firstMarkdownNotes:['**Reviewed**'],quickSaveAfterReload:richEdit});
   record.gesture.paragraphs = [richEdit];
 }
 expect(passed()).toBe(true);
 Object.assign(records[0]!,{firstMarkdownAfterReload:firstEdit.slice(0,-1)});
 expect(passed()).toBe(false);
 Object.assign(records[0]!,{firstMarkdownAfterReload:firstEdit});
 records[0]!.iid = 2;
 expect(passed()).toBe(false);
 records[0]!.iid = 1;
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
 stock.failedWrites[0].description = local;
 const latest = remote.replace('Shared record.'+input.remoteSuffix,'Shared record.'+input.remoteSuffix+' Later.');
 Object.assign(input,{lateSuffix:' Later.'});
 for (const report of pair) Object.assign(report.observations[0]!,{currentVersion:remote,lateServerVersion:latest,lateDisclosure:latest});
 const disclosure = () => compareGitLabCompatibility(...pair).rows.find((item:any)=>item.invariant==='lateDisclosure');
 expect(disclosure().classification).toBe('parity');
 stock.lateDisclosure = remote;
 expect(disclosure().classification).toBe('improvement');
 stock.lateServerVersion = remote;
 expect(disclosure().status).toBe('missing-evidence');
});

it('requires overlapping real issue writes before scoring draft retention', () => {
 const pair=reports();
 const fixture=JSON.parse(readFileSync(new URL('../integrations/gitlab/fixtures/compatibility-concurrent-issues.json',import.meta.url),'utf8'));
 const input=fixture.cases.find((entry:any)=>entry.kind==='simultaneous-issue');
 const sources=[input.localSuffix,input.remoteSuffix].map(s=>input.markdown.replace('Shared record.','Shared record.'+s));
 for (const report of pair) {
   Object.assign(report.fixture,{...fixture,cases:[input]});
   const item=report.observations[0]!;
   Object.assign(item,{id:input.id,input,status:'observed',remoteEditorProof:item.editorProof,
     actor:{id:8,username:fixture.username,isAdmin:false},membership:{id:8,accessLevel:30},cleanupMembership:{id:8,accessLevel:10},
     setup:{authorId:1},onlineAuthorId:1,permissionBefore:true,baselineBeforeSaves:input.markdown,
     issueGid:'gid://gitlab/WorkItem/7',persisted:sources[0],afterReload:sources[0],reader:['Shared record.'+input.localSuffix,'End marker.'],
     submissions:[8,1].map((actor,i)=>({actor,description:sources[i],status:200,mutationReturned:true,
       start:100+i,end:110+i,requestStart:2,responseEnd:12,updateId:i===0?'gid://gitlab/WorkItem/7':null,errors:i===0?[]:['Conflict']})),
     decisions:[{actor:8,draftVisible:false,warnings:[]},{actor:1,draftVisible:true,warnings:['Conflict']}]});
 }
 const result=()=>compareGitLabCompatibility(...pair);
 expect(result().summary.parity).toBe(7);
 const stock=pair[0].observations[0] as any;
 stock.submissions[1].status=500;
 expect(result().summary.improvement).toBe(1);
 stock.submissions[1].status=200;
 stock.submissions[1].updateId=stock.issueGid;
 stock.submissions[1].errors=[];
 stock.decisions[1].draftVisible=false;
 expect(result().summary.improvement).toBe(2);
 stock.submissions[1].start=stock.submissions[0].end;
 expect(result().summary.incomplete).toBe(7);
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

it('requires a fresh process start, the same deployed build, and the exact saved issue after restart', () => {
  const pair = reports();
  const fixture = JSON.parse(readFileSync(new URL('../integrations/gitlab/fixtures/compatibility-composers.json', import.meta.url), 'utf8'));
  const input = fixture.cases[0];
  const description = input.description + input.suffix;
  for (const report of pair) {
    report.fixture = fixture;
    Object.assign(report.observations[0]!, { iid: 7, id: input.id, input, status: 'observed',
      commentEditorProof: report.observations[0]!.editorProof, facts: {} });
    Object.assign(report.deployment, { backendMounts: [{ name: 'test-data', destination: '/data' }] });
    Object.assign(report, { restartRequested: true, restart: { before: '2026-11-19T12:00:00Z', after: '2026-11-19T12:05:00Z',
      containerId: 'd'.repeat(64), buildIdentity: structuredClone(report.buildIdentity),
      mounts: [{ Type: 'volume', Name: 'test-data', Destination: '/data' }],
      records: [{ iid: 7, id: input.id, description, notes: ['**' + input.comment + '**'], readerDescription: description, readerBold: [input.comment] }] } });
  }
  const row = () => compareGitLabCompatibility(...pair).rows.find((r: { invariant: string }) => r.invariant === 'afterRestart');
  expect(row().classification).toBe('parity');
  const evidence = (pair[1] as any).restart;
  evidence.records[0].description = 'lost edit';
  expect(row().classification).toBe('regression');
  evidence.records[0].iid = 8;
  expect(row().status).toBe('missing-evidence');
  evidence.after = evidence.before;
  expect(compareGitLabCompatibility(...pair).environment.matched).toBe(false);
  evidence.after = '2026-11-19T12:05:00Z';
  evidence.buildIdentity.observed.runtimeSHA256 = '0'.repeat(64);
  expect(compareGitLabCompatibility(...pair).environment.matched).toBe(false);
});

function deletionReports(replacement:string){
 const pair=reports();
 for(const report of pair){
  const input:any=report.fixture.cases[0];input.scope='deletion';input.replacement=replacement;
  const item:any=report.observations[0];item.input=structuredClone(input);
  const fencedBody=replacement && !replacement.endsWith('\n') ? replacement+'\n' : replacement;
  item.sourceAtFirstVisible='```suggestion:-0+0\n'+fencedBody+'```';item.sourceModeBeforeEdit=item.sourceAtFirstVisible;
  item.saved={body:item.sourceAtFirstVisible};item.reopenedSource=item.sourceAtFirstVisible;
  item.deletion={richSource:replacement,explicitDeletionExplanation:true,confirmationPresent:replacement.length>0,blockedBeforeConsent:replacement.length>0,confirmed:replacement.length>0};
  item.setup={seedCommit:'seed'};item.beforeApplyFile={content:Buffer.from(input.source).toString('base64')};item.beforeApplyHead='seed';
  item.appliedFile={content:''};item.appliedCommit={id:'applied',parent_ids:['seed']};item.appliedNote={suggestions:[{applied:true}]};
 }
 return pair;
}
it.each(['','\n','\u00a0\t\u3000','\u00a0\t\u3000\n\n'])('checks real deletion semantics separately from exact proposal source %j',(replacement)=>{
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
it('requires measured line separation for a soft-wrapped selection',()=>{
 const [original,fountain]=partialReports();
 for(const report of [original,fountain]){
  (report.fixture.cases[0] as any).requireWrappedSelection=true;
  const item:any=report.observations[0];item.input=structuredClone(report.fixture.cases[0]);
  item.copySelection={...item.copySelection,wrap:{startY:100,endY:140,lineHeight:20}};
 }
 (fountain.observations[0] as any).copySelection.wrap.endY=102;
 const scored=compareGitLabCompatibility(original,fountain);
 expect(scored.rows.find((row:any)=>row.invariant==='copySelection.wrapped').classification).toBe('regression');
 expect(scored.rows.find((row:any)=>row.invariant==='cutSelection.wrapped').status).toBe('missing-evidence');
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
