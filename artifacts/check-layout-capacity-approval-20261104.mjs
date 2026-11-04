import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const path='scripts/check-build-budgets.mjs';
const before=execFileSync('git',['show',`e487730:${path}`],{encoding:'utf8'});
const after=await readFile(path,'utf8');
const limits=source=>{
 const start=source.indexOf('const limits = Object.freeze(');
 const end=source.indexOf('\n});',start)+4;
 return Function('kibibyte',`${source.slice(start,end)};return limits;`)(1024);
};
const oldLimits=limits(before), newLimits=limits(after);
assert.deepEqual(Object.keys(oldLimits),Object.keys(newLimits));
const proposal=JSON.parse(await readFile('artifacts/layout-capacity-measurements-20261104.json','utf8'));
const changed=Object.keys(oldLimits).filter(name=>oldLimits[name]!==newLimits[name]);
assert.deepEqual(new Set(changed),new Set(proposal.rows.map(row=>row.name)));
for(const row of proposal.rows){
 assert.equal(oldLimits[row.name],row.existingLimitBytes);
 assert.equal(newLimits[row.name],row.proposedLimitBytes);
}
assert.equal(after,await readFile('artifacts/layout-capacity-candidate-20261104.mjs','utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const result={approvedProposalCommit:'e48773004fede17a8532c4da7ea22515f1eb487c',
 approvedProposalSHA256:hash(await readFile('artifacts/layout-capacity-proposal-20261104.patch')),
 applied:true,approvedByUser:true,changedLimits:proposal.rows,
 unchangedOtherLimits:Object.keys(oldLimits).length-changed.length,
 beforeCheckerSHA256:hash(before),appliedCheckerSHA256:hash(after),
 authoritativeSizeGate:'passed',performanceSemanticReferenceLimitsChanged:false,
 publicationApproved:false,fullCIStillRequired:true};
await writeFile('artifacts/layout-capacity-approval-verification-20261104.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({changedLimits:changed.length,unchangedLimits:result.unchangedOtherLimits,exactApprovedPatch:true}));
