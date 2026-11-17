import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {compareGitLabCompatibility} from '../integrations/gitlab/testing/compatibility.mjs';
const paths=['switch-20261116/comparison-2','deletion-keyboard-20261116/comparison-1','review-20261116/comparison-1','clipboard-ready-20261117/comparison-1','partial-ready-20261117/comparison-1','crossblock-caret-20261117/comparison-1','grid-transfer-20261117/comparison-1','grid-paint-20261117/comparison-1','task-lifecycle-20261117/comparison-1','task-recovery-20261117/comparison-1','task-menu-20261117/comparison-1','task-conversion-20261117/comparison-1','task-conversion-repair-20261117/comparison-2','task-containers-20261117/comparison-1','conflicts-20261117/comparison-1','access-20261117/comparison-1','access-repair-20261117/comparison-2'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),checks=[];
for(const path of paths){
 const stored=JSON.parse(readFileSync('artifacts/gitlab-compatibility/'+path+'/report.json','utf8'));
 const pair=['original','fountain'].map(side=>{const input=stored.inputs[side],bytes=readFileSync(input.path);assert.equal(sha(bytes),input.sha256);return JSON.parse(bytes);});
 const result=compareGitLabCompatibility(...pair);assert.deepEqual(result.summary,stored.summary,path);assert.equal(result.comparisonComplete,stored.comparisonComplete,path);assert.equal(result.regressionGate.passed,stored.regressionGate.passed,path);assert.equal(result.featureAcceptance.passed,stored.featureAcceptance.passed,path);
 checks.push({path,summary:result.summary,unchanged:true});
}
writeFileSync('artifacts/gitlab-compatibility/membership-removal-20261117/prior-corpus-replay-final.json',JSON.stringify({scope:'Reinterpretation of unchanged recorded observations; not fresh browser runs.',comparatorSha256:sha(readFileSync('integrations/gitlab/testing/compatibility.mjs')),checks},null,2)+'\n');
console.log(JSON.stringify(checks));
