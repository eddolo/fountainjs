import {expect,it} from 'vitest';
// @ts-expect-error Private audit interpreter intentionally has no public type entry.
import {inspectGitLabAccessFeedback} from '../integrations/gitlab/testing/access-feedback.mjs';
function report(){return {side:'fountain',collectionComplete:true,errors:[],fixture:{cases:[{id:'revoked',kind:'revocation'}]},observations:[{id:'revoked',status:'observed',actorErrors:[],editorProof:{native:true,className:'fountain-editor'},mutations:[{stage:'revoke-edit-access',canUpdate:false}],errorAlerts:['You no longer have permission to edit this description. Your draft has been kept.'],pendingSource:'Pending draft.',retainedSource:'Pending draft.'}]};}
it('passes only complete native authority, explanation, conflict and source evidence',()=>{
 expect(inspectGitLabAccessFeedback(report()).passed).toBe(true);
});
it('rejects the reproduced false conflict even when the source survives',()=>{
 const value=report();value.observations[0].errorAlerts.push('Someone edited the description at the same time you did.');const result=inspectGitLabAccessFeedback(value);expect(result.passed).toBe(false);expect(result.checks[0].exactDraftRetained).toBe(true);expect(result.checks[0].noFalseConflict).toBe(false);
});
it('rejects missing actual returned authority',()=>{
 const value=report();value.observations[0].mutations=[];expect(inspectGitLabAccessFeedback(value).passed).toBe(false);
});
it('rejects missing failure explanation, draft loss, editor proof or incomplete collection',()=>{
 const examples=[report(),report(),report(),report()];examples[0].observations[0].errorAlerts=[];examples[1].observations[0].retainedSource='Other source';examples[2].observations[0].editorProof.native=false;examples[3].collectionComplete=false;for(const value of examples)expect(inspectGitLabAccessFeedback(value).passed).toBe(false);
});
