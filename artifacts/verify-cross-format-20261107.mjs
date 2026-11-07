import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {dirname,relative,resolve} from 'node:path';
const read=async path=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const file=async path=>({path,bytes:(await stat(path)).size,sha256:await hash(path)});
const parent=await read('artifacts/legacy-migration-verification-20261106.json');
const focused=await read('artifacts/cross-format-focused-20261107.json');
const full=await read('artifacts/cross-format-full-source-20261107.json');
assert.equal(focused.numTotalTests,236);assert.equal(focused.numPassedTests,236);assert.equal(focused.numFailedTests,0);assert.equal(focused.numPendingTests,0);
const added=focused.testResults.find(row=>row.name.endsWith('yjs-cross-format-handoff.test.ts')).assertionResults;
assert.equal(added.length,40);assert(added.every(row=>row.status==='passed'));
assert.equal(full.numTotalTests,parent.fullSource.total+40);assert.equal(full.numPassedTests,parent.fullSource.passed+40);assert.equal(full.numFailedTests,6);assert.equal(full.numPendingTests,0);
const failures=full.testResults.flatMap(suite=>suite.assertionResults.filter(test=>test.status==='failed').map(test=>({file:relative('.',suite.name).replaceAll('\\','/'),name:test.fullName})));
assert.deepEqual(failures,parent.fullSource.requiredFailures);
const discovered=execFileSync('rg',['--files','tests','examples/extensions','-g','*.test.ts','-g','*.test.tsx'],{encoding:'utf8'}).trim().split(/\r?\n/).map(path=>path.replaceAll('\\','/')).sort();
assert.equal(discovered.length,296);assert.deepEqual(full.testResults.map(row=>relative('.',row.name).replaceAll('\\','/')).sort(),discovered);
const checks=await read('artifacts/cross-format-checks-20261107.json');
assert.deepEqual(checks.map(row=>row.check),['types','focused','full-source','build','api','headless','budget']);
for(const row of checks)assert.equal(row.exitCode,['full-source','budget'].includes(row.check)?1:0);
const budget=await readFile('artifacts/cross-format-budget-20261107.log','utf8');
assert.deepEqual(budget.split(/\r?\n/).filter(line=>line.startsWith('- ')&&line.includes('exceeds its budget')),['- dist/core.js exceeds its budget by 0.1 KiB','- all ESM runtime code exceeds its budget by 76.0 KiB','- all CommonJS runtime code exceeds its budget by 59.9 KiB']);
const runtime='artifacts/cross-format-build-20261107',compiled=new Set();
for(const name of await readdir(runtime))if(name.endsWith('.map')){
 const path=runtime+'/'+name,map=await read(path);
 for(let i=0;i<map.sources.length;i++){
  const source=resolve(dirname(path),map.sources[i]),local=relative('.',source).replaceAll('\\','/');
  if(!local.startsWith('src/')&&!local.startsWith('examples/backends/'))continue;
  assert.equal(map.sourcesContent[i],await readFile(source,'utf8'),`stale compiled source ${local}`);compiled.add(local);
 }
}
for(const path of ['src/yjs/index.ts','src/yjs/legacy-checkpoint.ts','src/yjs/legacy-migration.ts','src/yjs/retained-handoff.ts','src/yjs/retained-room-coordinator.ts','src/yjs/document-room.ts','src/yjs/cross-format-handoff.ts','examples/backends/retained-sqlite.ts'])assert(compiled.has(path),path);
const publicBaseline=await read('artifacts/retained-model-reuse-public-after-20261106.json');
assert.equal(publicBaseline.length,171);for(const row of publicBaseline)assert.equal(await hash(row.path),row.sha256,`changed public runtime ${row.path}`);
const unchanged=['src/yjs/index.ts','package.json','scripts/check-build-budgets.mjs'];
for(const path of unchanged){const original=execFileSync('git',['show',`0d677569:${path}`],{stdio:['ignore','pipe','pipe']});assert.equal(createHash('sha256').update(original).digest('hex'),await hash(path))}
const nodes=await Promise.all(['es','cjs'].map(mode=>read(`artifacts/cross-format-process-${mode}-20261107.json`)));
for(const node of nodes){assert.equal(node.passed,9);assert.equal(node.workers,5);assert.equal(node.dom,false);assert.deepEqual(node.protocols,['legacy','retained','legacy']);assert.equal(node.cases.length,9);assert(node.cases.some(value=>value.includes('raw operations')))}
const browser=await read('artifacts/cross-format-browser-20261107.json');
assert.equal(browser.stats.expected,9);for(const key of ['unexpected','flaky','skipped'])assert.equal(browser.stats[key],0);assert.equal(browser.config.workers,1);
const journeys=[];function visit(suites){for(const suite of suites){visit(suite.suites??[]);for(const spec of suite.specs??[])for(const test of spec.tests??[])journeys.push({name:spec.title,...test})}}visit(browser.suites);assert.equal(journeys.length,9);
const recordings=[],layouts=[],reports=[];
const text=node=>(node.text??'')+(node.content??[]).map(text).join('');
for(const journey of journeys){
 assert.equal(journey.status,'expected');assert.equal(journey.results.length,1);
 const attachments=journey.results[0].attachments,body=name=>JSON.parse(Buffer.from(attachments.find(item=>item.name===name).body,'base64').toString('utf8')),urls=body('runtime-modules');
 assert(!urls.some(path=>path.startsWith('/src/')));
 for(const name of ['engine','legacy-adapter','retained-adapter','legacy-checkpoint'])assert(urls.includes(`/artifacts/cross-format-build-20261107/${name}.js`));
 const recording=await file(attachments.find(item=>item.name==='video').path),trace=await file(attachments.find(item=>item.name==='trace').path);assert(recording.bytes>0&&trace.bytes>0);recordings.push({project:journey.projectName,name:journey.name,...recording,trace});
 const result=body('cross-format-result');assert.deepEqual(result.server,result.active);assert.equal(result.protocol,result.activeProtocol);
 if(journey.name.startsWith('migrates')){
  assert.equal(result.protocol,'legacy');assert.equal(result.archiveProtocol,'retained');assert(text(result.active).includes('OLD pending UNSAVED after rollback'));assert(text(result.archive).includes('NEW accepted'));assert.deepEqual(result.lastReplay,{replayed:true,current:false});
 }else if(journey.name.startsWith('restores')){
  assert.equal(result.protocol,'legacy');assert.equal(result.archiveProtocol,'retained');assert(!text(result.active).includes('OLD branch'));assert(text(result.offline).includes('OLD branch'));assert(text(result.archive).includes('NEW branch'));
 }else{
  assert.equal(result.protocol,'retained');assert.equal(result.archiveProtocol,'legacy');assert(text(result.active).includes('AFTER retry'));assert(text(result.archive).includes('PENDING after lost ack'));assert.deepEqual(result.lastReplay,{replayed:true,current:true});
  const raw=body('retired-raw-batch');assert.equal(raw.revision,1);assert(/^[a-f0-9]{64}$/.test(raw.sha256));assert(raw.bytes>0);
 }
 const layout=body('layout-samples');assert(layout.frames>0);assert.equal(layout.minViewport,1440);assert(layout.minPane>=200);assert(layout.maxOverflow<=2);assert.deepEqual(layout.invalid,[]);layouts.push({project:journey.projectName,name:journey.name,...layout});
 reports.push({project:journey.projectName,name:journey.name,...result});
}
const folder='artifacts/cross-format-visual-20261107';
const visual=await Promise.all((await readdir(folder)).filter(name=>/\.(png|webm)$/.test(name)).sort().map(name=>file(folder+'/'+name)));
assert.equal(visual.filter(row=>row.path.endsWith('.webm')).length,9);assert.equal(visual.filter(row=>row.path.endsWith('.png')).length,27);
const sources=['src/yjs/document-room.ts','src/yjs/cross-format-handoff.ts','src/yjs/retained-room-coordinator.ts','src/yjs/retained-handoff.ts','examples/backends/retained-sqlite.ts','tests/yjs-cross-format-handoff.test.ts','tests/manual/cross-format-real.spec.ts','artifacts/build-cross-format-20261107.mjs','artifacts/prepare-cross-format-audit-20261107.mjs','artifacts/cross-format-fixture-20261107.html','artifacts/cross-format-server-20261107.mjs','artifacts/cross-format-browser-20261107.config.ts','artifacts/cross-format-process-20261107.mjs','artifacts/curate-cross-format-20261107.mjs','artifacts/run-cross-format-checks-20261107.ps1','artifacts/verify-cross-format-20261107.mjs'];
const receipt={date:'2026-11-07',baselineCommit:'0d677569',goalComplete:false,publication:'Local private compatible-room migration/recovery only; no default switch or publication.',source:await Promise.all(sources.map(file)),fullSource:{...await file('artifacts/cross-format-full-source-20261107.json'),total:full.numTotalTests,passed:full.numPassedTests,failed:6,skipped:0,files:discovered.length,requiredFailures:failures},focused:{passed:236,newCases:added.map(row=>row.fullName)},checks,logs:await Promise.all(checks.map(row=>file(row.log))),compiled:{sourceModules:compiled.size,nodeCases:18,nodes},browser:{passed:9,scope:'Actual legacy/retained editors and HTTP/SQLite protocol authority; pending edits, rollback, historical receipt and read-only recovery archive.',recordings,layouts,reports},visualReview:{method:'All nine sampled filmstrips and selected complete stage screenshots; not full playback or physical-device certification.',artifacts:visual},invariants:{publicRuntimeAndCssByteIdentical:171,unchanged},documents:await Promise.all(['docs/YJS_CROSS_FORMAT_HANDOFF_AUDIT.md','docs/YJS_LEGACY_MIGRATION_AUDIT.md','docs/YJS_RETAINED_HANDOFF_AUDIT.md','docs/ROADMAP.md','docs/TIPTAP_PARITY.md','CHANGELOG.md'].map(file)),open:['Six default-adapter failures and safe adoption','General fragment namespace/nested-locator mapping beyond compatible named XML rooms','Cross-format semantic reconciliation and actual host/provider coordination','Crash-persistent client outbox','Production archive/raw-log retention, compaction and large-room costs','Three size overruns and fresh complete release CI','Overall parity']};
await writeFile('artifacts/cross-format-verification-20261107.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({newCases:40,fullPassed:full.numPassedTests,defaultFailures:6,nodeCases:18,browserCases:9,sourceModules:compiled.size,publicFilesUnchanged:171}));
