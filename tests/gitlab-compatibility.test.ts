import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
// These are tests of interpretation policy, not real application evidence.
// @ts-expect-error Private JS audit helper intentionally has no published type entry.
import {classifyInvariant,compareGitLabCompatibility,suggestionBlock,clipboardParagraphs} from '../integrations/gitlab/testing/compatibility.mjs';
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
function reports(){
 const input={id:'handoff',scope:'handoff',range:{start:1,end:1},source:'exact\n'};
 const base={runId:'policy-test',fixtureHash:'fixture',harnessHashes:{driver:'driver'},browser:{version:'test'},
  fixture:{cases:[input],appendLine:'// review\n',proseSuffix:' confirmed'},
  deployment:{image:'pinned',imageId:'digest',backendMounts:['data'],backendEnvironmentHash:'same',cpus:2,memory:4},
  backend:{version:'pinned',project:{id:1,defaultHead:'seed'},actor:'root',serverSources:['source']},collectionComplete:true,errors:[]};
 const observation={id:'handoff',input,prefillDOM:'exact',sourceAtFirstVisible:'```suggestion:-0+0\nexact\n```',sourceModeBeforeEdit:'```suggestion:-0+0\nexact\n```'};
 return [{...structuredClone(base),side:'original',observations:[{...structuredClone(observation),editorProof:{native:false,className:'tiptap ProseMirror'}}]},
 {...structuredClone(base),side:'fountain',observations:[{...structuredClone(observation),prefillDOM:'exact\n',editorProof:{native:true,className:'fountain-editor'}}]}];
}
it('refuses to classify a mismatched backend, candidate instrument, input or browser as parity',()=>{
 for(const mutate of [
  (report:any)=>{report.deployment.backendEnvironmentHash='different';},
  (report:any)=>{report.backend.project.defaultHead='different';},
  (report:any)=>{report.browser.version='different';},
  (report:any)=>{report.harnessHashes.driver='different';},
  (report:any)=>{report.observations[0].input.source='different\n';},
 ]){
  const [original,fountain]=reports();mutate(fountain);
  const result=compareGitLabCompatibility(original,fountain);
  expect(result.environment.matched).toBe(false);expect(result.rows.every((row:any)=>row.classification===null)).toBe(true);
  expect(result.regressionGate.passed).toBe(false);expect(result.featureAcceptance.passed).toBe(false);
 }
});
it('keeps missing observations and unproven editor identity out of completed comparisons',()=>{
 const [original,fountain]=reports();delete (fountain.observations[0] as any).editorProof;
 const result=compareGitLabCompatibility(original,fountain);
 expect(result.summary.incomplete).toBe(4);expect(result.comparisonComplete).toBe(false);expect(result.regressionGate.passed).toBe(false);
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
