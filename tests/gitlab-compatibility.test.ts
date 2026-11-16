import {expect,it} from 'vitest';
// These are tests of interpretation policy, not real application evidence.
// @ts-expect-error Private JS audit helper intentionally has no published type entry.
import {classifyInvariant,compareGitLabCompatibility,suggestionBlock} from '../integrations/gitlab/testing/compatibility.mjs';
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
