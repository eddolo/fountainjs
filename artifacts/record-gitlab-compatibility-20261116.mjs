import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),prefix='artifacts/gitlab-compatibility/switch-20261116/';
const read=path=>readFile(new URL(path,root),'utf8'),json=async path=>JSON.parse(await read(path));
const comparison=await json(prefix+'comparison-2/report.json'),original=await json(prefix+'original-1/report.json'),fountain=await json(prefix+'fountain-1/report.json');
assert.deepEqual(comparison.summary,{parity:20,improvement:12,regression:0,'shared-limitation':4,incomplete:0,total:36});
assert.equal(comparison.environment.matched,true);assert.equal(comparison.comparisonComplete,true);assert.equal(comparison.regressionGate.passed,true);assert.equal(comparison.featureAcceptance.passed,false);
assert.equal(original.collectionComplete,true);assert.equal(fountain.collectionComplete,true);assert.deepEqual(original.errors,[]);assert.deepEqual(fountain.errors,[]);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const [side,report]of [['original',original],['fountain',fountain]]){
 assert.equal(report.fixtureHash,hash(await readFile(new URL('integrations/gitlab/fixtures/compatibility-suggestions.json',root))));
 for(const [path,sha]of Object.entries(report.harnessHashes))assert.equal(hash(await readFile(new URL(path,root))),sha);
 assert.equal(comparison.inputs[side].sha256,hash(await readFile(new URL(prefix+side+'-1/report.json',root))));
}
for(const [path,sha]of Object.entries(comparison.comparatorHashes))assert.equal(hash(await readFile(new URL(path,root))),sha);
assert.match(await read('artifacts/compatibility-all-unit-20261116.log'),/1377 passed/);assert.match(await read('artifacts/compatibility-all-unit-20261116.log'),/54 passed/);
assert.equal(await read('artifacts/compatibility-types-20261116.log'),'');
const source=await json(prefix+'source-provenance.json');assert.equal(source.packagedServerSourcesMatch,true);
const deployment=JSON.parse(execFileSync('wsl',['-d','Ubuntu','--','docker','inspect','fountain-gitlab-integration-baseline-1'],{encoding:'utf8'}))[0];
assert.equal(deployment.State.Running,false);assert.equal(deployment.Config.Image,original.deployment.image);
const paths=[
'scripts/run-gitlab-compatibility.mjs','scripts/audit-gitlab-compatibility-suggestions.mjs','scripts/compare-gitlab-compatibility.mjs',
'integrations/gitlab/testing/compatibility.mjs','integrations/gitlab/fixtures/compatibility-suggestions.json','tests/gitlab-compatibility.test.ts',
'integrations/gitlab/COMPATIBILITY_SUITE_PLAN.md','integrations/gitlab/COMPATIBILITY_RESULTS.md',
'artifacts/record-gitlab-compatibility-source-20261116.mjs',
'artifacts/compatibility-original-20261116.log','artifacts/compatibility-original-switch-20261116.log','artifacts/compatibility-fountain-switch-20261116.log',
'artifacts/compatibility-all-unit-20261116.log','artifacts/compatibility-types-20261116.log',
'artifacts/gitlab-compatibility/suggestions-20261116/original-1/report.json',
...['original-1/report.json','fountain-1/report.json','comparison-2/report.json','comparison-2/report.md','source-provenance.json'].map(path=>prefix+path),
];
for(const side of ['original-1','fountain-1'])for(const name of await readdir(new URL(prefix+side+'/',root)))if(name.endsWith('.png'))paths.push(prefix+side+'/'+name);
const hashes={};for(const path of paths)hashes[path]=hash(await readFile(new URL(path,root)));
const receipt={scope:'First matched real GitLab source-handoff and repository/prose workflows; four scenarios and 36 per-invariant classifications, not broad product superiority.',
 parentRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 comparison:{path:prefix+'comparison-2/report.json',...comparison.summary,complete:true,environmentMatched:true,regressionGatePassed:true,absoluteFeatureAcceptance:false},
 findings:[
  'Observed rapid original-editor rich-to-source handoff loses inserted source; tested Fountain candidate retains it.',
  'Original lossy diff prefill changes literal backslash-n into U+E000 through actual save/application; candidate preserves both source values.',
  'Ordinary settled source/save/application/prose behaviors match under the declared invariants.',
  'Both actual editor workflows clear Applied flag and recreate suggestion identity on prose-only note updates; unmet requirements remain open.',
 ],
 verification:{integrationUnit:{passed:1377,files:54,comparisonPolicyCases:13,workers:2},types:'strict TypeScript passed',
  visualReview:'Inspected matched source fields, settled proposals and after-prose readers. Exact saved payloads and repository files supply code-point evidence.',
  deployment:'Same image/backend mounts/server sources/configuration, actor/permissions, project/default head, browser and fixtures; different declared frontend asset selector/mount.',
  provenance:source,applicationStopped:true},
 limits:[
  'One matched Linux Chromium run per profile; no frequency/performance/latest-framework/mobile claim.',
  'Immediate handoff ends after source observation; settled profile continues through saving, real application and applied-note prose editing.',
  'Recorded handoff timing identifies switch-action entry, not completed pointer latency.',
  'Counts are correlated assertions across two underlying improvements, not twelve independent features.',
  'Earlier failed discovery is retained separately and is excluded from paired classifications.',
  'No matched cold restart, roles/concurrency, posted-range changes, clipboard/table/media or whitespace-warning comparison yet.',
  'No editor-runtime/public API/capacity limit/version/publication or overall parity-row change.',
 ],hashes};
await writeFile(new URL('artifacts/gitlab-compatibility-integration-20261116.json',root),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({summary:comparison.summary,regressionGate:true,absoluteFeatureAcceptance:false,applicationStopped:true}));
