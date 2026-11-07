import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {dirname,relative,resolve} from 'node:path';

const prefix='artifacts/yjs-namespace-',date='20261107',baselineCommit='aee2b0e7';
const read=async path=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const file=async path=>({path,bytes:(await stat(path)).size,sha256:await hash(path)});
const artifact=name=>`${prefix}${name}-${date}.json`;
const parent=await read('artifacts/yjs-history-policy-verification-20261107.json');
const before=await read(artifact('before')),focused=await read(artifact('focused')),full=await read(artifact('full-source'));
assert.equal(before.numTotalTests,28);assert.equal(before.numPassedTests,3);assert.equal(before.numFailedTests,25);assert.equal(before.numPendingTests,0);
const priorFailures=before.testResults.flatMap(s=>s.assertionResults.filter(t=>t.status==='failed').map(t=>t.fullName));
assert.equal(priorFailures.length,25);assert.equal(before.testResults.length,1);assert(before.testResults[0].name.endsWith('yjs-namespace-migration.test.ts'));
assert.equal(focused.numTotalTests,264);assert.equal(focused.numPassedTests,264);assert.equal(focused.numFailedTests,0);assert.equal(focused.numPendingTests,0);
const regressions=focused.testResults.find(s=>s.name.endsWith('yjs-namespace-migration.test.ts')).assertionResults;
assert.equal(regressions.length,28);assert(regressions.every(t=>t.status==='passed'));assert(priorFailures.every(name=>regressions.some(t=>t.fullName===name)));
assert.equal(full.numTotalTests,parent.fullSource.total+28);assert.equal(full.numPassedTests,parent.fullSource.passed+28);assert.equal(full.numFailedTests,6);assert.equal(full.numPendingTests,0);
const failures=full.testResults.flatMap(s=>s.assertionResults.filter(t=>t.status==='failed').map(t=>({file:relative('.',s.name).replaceAll('\\','/'),name:t.fullName})));
assert.deepEqual(failures,parent.fullSource.requiredFailures);
const discovered=execFileSync('rg',['--files','tests','examples/extensions','-g','*.test.ts','-g','*.test.tsx'],{encoding:'utf8'}).trim().split(/\r?\n/).map(p=>p.replaceAll('\\','/')).sort();
assert.equal(discovered.length,299);assert.deepEqual(full.testResults.map(s=>relative('.',s.name).replaceAll('\\','/')).sort(),discovered);
const checks=await read(artifact('checks'));
assert.deepEqual(checks.map(c=>c.check),['types','focused','full-source','build','api','headless','budget']);
for(const c of checks)assert.equal(c.exitCode,['full-source','budget'].includes(c.check)?1:0);
const budgetFailures=(await readFile(`${prefix}budget-${date}.log`,'utf8')).split(/\r?\n/).filter(s=>s.startsWith('- ')&&s.includes('exceeds its budget'));
assert.deepEqual(budgetFailures,parent.publicRuntime.budgetFailures);

// Prove that the diagnostic used archived source from the stated commit.
const baselineTree=execFileSync('git',['ls-tree','-r','--full-tree',baselineCommit,'src'],{encoding:'utf8'}).trim().split(/\r?\n/);
for(const line of baselineTree){const match=/^\d+ blob ([a-f0-9]+)\t(.+)$/.exec(line);assert(match);const bytes=await readFile(`artifacts/yjs-namespace-baseline-${date}/${match[2]}`);assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),match[1],match[2]);}
const compiled=new Set(),runtime=`${prefix}build-${date}`;
for(const name of await readdir(runtime))if(name.endsWith('.map')){const path=runtime+'/'+name,map=await read(path);for(let i=0;i<map.sources.length;i++){const source=resolve(dirname(path),map.sources[i]),local=relative('.',source).replaceAll('\\','/');if(!local.startsWith('src/')&&!local.startsWith('examples/backends/'))continue;assert.equal(map.sourcesContent[i],await readFile(source,'utf8'),`stale compiled source ${local}`);compiled.add(local)}}
for(const path of ['src/yjs/index.ts','src/yjs/retained-adapter.ts','src/yjs/legacy-checkpoint.ts','src/yjs/legacy-migration.ts','src/yjs/cross-format-handoff.ts','src/yjs/document-room.ts','examples/backends/retained-sqlite.ts'])assert(compiled.has(path),path);
for(const entry of ['engine','legacy-adapter','retained-adapter','checkpoint','legacy-checkpoint','room-store','coordinator','document-room','sqlite','handoff','legacy-migration'])for(const extension of ['js','cjs'])assert((await stat(`${runtime}/${entry}.${extension}`)).size>0);

const baseline=await read(artifact('public-before'));assert.equal(baseline.length,173);
const currentPaths=(await readdir('dist')).filter(name=>/\.(js|cjs|css)$/.test(name)).map(name=>'dist/'+name).concat('dist/angular/index.js').sort();
assert.deepEqual(currentPaths,baseline.map(row=>row.path).sort());const publicFiles=await Promise.all(currentPaths.map(file));
const oldPublic=new Map(baseline.map(row=>[row.path,row]));for(const row of publicFiles){assert.equal(row.sha256,oldPublic.get(row.path).sha256,row.path);assert.equal(row.bytes,oldPublic.get(row.path).bytes,row.path)}
const unchanged=['src/yjs/index.ts','src/yjs/retained-adapter.ts','src/core/editor.ts','src/extensions/collaboration-core.ts','tests/yjs-document-range.test.ts','package.json','api-surface.json','scripts/check-build-budgets.mjs'];
for(const path of unchanged){const old=execFileSync('git',['show',`${baselineCommit}:${path}`],{stdio:['ignore','pipe','pipe']});assert.equal(createHash('sha256').update(old).digest('hex'),await hash(path),path)}
const nodes=await Promise.all(['es','cjs'].map(mode=>read(artifact(`process-${mode}`))));
for(const node of nodes){assert.equal(node.passed,9);assert.equal(node.cases.length,9);assert.equal(node.dom,false);assert.equal(node.workers,5);assert.deepEqual(node.protocols,['legacy','retained','legacy']);assert.deepEqual(node.namespaces,['Research / α 😀','mapped-paper','Research / α 😀'])}

const browser=await read(artifact('browser'));assert.equal(browser.stats.expected,12);for(const key of ['unexpected','flaky','skipped'])assert.equal(browser.stats[key],0);assert.equal(browser.config.workers,1);
const journeys=[];function visit(suites){for(const suite of suites){visit(suite.suites??[]);for(const spec of suite.specs??[])for(const test of spec.tests??[])journeys.push({name:spec.title,...test})}}visit(browser.suites);assert.equal(journeys.length,12);
assert.deepEqual([...new Set(journeys.map(j=>j.projectName))].sort(),['chromium','firefox','webkit']);
const recordings=[],reports=[],layouts=[],text=n=>(n.text??'')+(n.content??[]).map(text).join('');
for(const journey of journeys){assert.equal(journey.status,'expected');assert.equal(journey.results.length,1);assert.equal(journey.results[0].status,'passed');assert.deepEqual(journey.results[0].errors,[]);
 const attachments=journey.results[0].attachments,body=name=>JSON.parse(Buffer.from(attachments.find(a=>a.name===name).body,'base64').toString('utf8')),modules=body('runtime-modules');
 assert(!modules.some(path=>path.startsWith('/src/')));for(const entry of ['engine','legacy-adapter','retained-adapter','legacy-checkpoint'])assert(modules.includes(`/${runtime}/${entry}.js`),entry);
 const result=body('cross-format-result'),mapping=journey.name.startsWith('maps'),lost=journey.name.startsWith('recovers'),retained=mapping||lost;
 assert.equal(result.protocol,retained?'retained':'legacy');assert.equal(result.activeProtocol,result.protocol);assert.equal(result.phase,'active');assert.equal(result.namespace,retained?(mapping?'review-copy':'mapped-paper'):'Research / α 😀');assert.equal(result.activeNamespace,result.namespace);assert.equal(result.archiveNamespace,retained?'Research / α 😀':'mapped-paper');assert.equal(result.archiveProtocol,retained?'legacy':'retained');assert.deepEqual(result.active,result.server);
 if(mapping){assert(text(result.active).includes('MAPPED edit'));assert(!text(result.archive).includes('MAPPED edit'))}
 if(lost){assert.deepEqual(result.lastReplay,{replayed:true,current:true});assert(text(result.archive).includes('PENDING after lost ack'));assert(text(result.active).includes('AFTER retry'));const raw=body('retired-raw-batch');assert.equal(raw.revision,1);assert.match(raw.sha256,/^[a-f0-9]{64}$/);assert(raw.bytes>0)}
 if(journey.name.startsWith('migrates')){assert.deepEqual(result.lastReplay,{replayed:true,current:false});assert(text(result.active).includes('OLD pending'));assert(text(result.active).includes('UNSAVED after rollback'));assert(text(result.archive).includes('NEW accepted'))}
 if(journey.name.startsWith('restores')){assert(!text(result.active).includes('OLD branch'));assert(text(result.offline).includes('OLD branch'));assert(text(result.archive).includes('NEW branch'))}
 const layout=body('layout-samples');assert(layout.frames>0);assert.equal(layout.minViewport,1440);assert(layout.minPane>=200);assert(layout.maxOverflow<=2);assert.deepEqual(layout.invalid,[]);
 const video=await file(attachments.find(a=>a.name==='video').path),trace=await file(attachments.find(a=>a.name==='trace').path);assert(video.bytes>0&&trace.bytes>0);recordings.push({project:journey.projectName,name:journey.name,...video,trace});reports.push({project:journey.projectName,name:journey.name,result});layouts.push({project:journey.projectName,name:journey.name,...layout});
}
const folder=`${prefix}visual-${date}`,visual=await Promise.all((await readdir(folder)).filter(name=>/\.(png|webm)$/.test(name)).sort().map(name=>file(folder+'/'+name)));
assert.equal(visual.filter(f=>f.path.endsWith('.webm')).length,12);assert.equal(visual.filter(f=>f.path.endsWith('.png')).length,36);assert(visual.every(f=>f.bytes>0));
const sources=['src/yjs/legacy-checkpoint.ts','src/yjs/legacy-migration.ts','src/yjs/cross-format-handoff.ts','tests/yjs-namespace-migration.test.ts','tests/manual/yjs-namespace-real.spec.ts','artifacts/prepare-yjs-namespace-20261107.mjs','artifacts/build-yjs-namespace-20261107.mjs','artifacts/yjs-namespace-server-20261107.mjs','artifacts/yjs-namespace-fixture-20261107.html','artifacts/yjs-namespace-browser-20261107.config.ts','artifacts/yjs-namespace-baseline-20261107.config.ts','artifacts/yjs-namespace-process-20261107.mjs','artifacts/curate-yjs-namespace-20261107.mjs','artifacts/run-yjs-namespace-checks-20261107.ps1','artifacts/verify-yjs-namespace-20261107.mjs'];
const documents=['docs/YJS_NAMESPACE_MIGRATION_AUDIT.md','docs/YJS_LEGACY_MIGRATION_AUDIT.md','docs/YJS_CROSS_FORMAT_HANDOFF_AUDIT.md','docs/ROADMAP.md','docs/TIPTAP_PARITY.md','CHANGELOG.md'];
const receipt={date:'2026-11-07',baselineCommit,goalComplete:false,publication:'Local private namespace migration; no publication, default switch or acceptance-limit change.',source:await Promise.all(sources.map(file)),baseline:{sourceFiles:baselineTree.length,provenance:'Every archived source blob matches git ls-tree for the baseline commit'},before:{...await file(artifact('before')),passed:3,failed:25,requiredFailureNames:priorFailures},fullSource:{...await file(artifact('full-source')),total:full.numTotalTests,passed:full.numPassedTests,failed:6,skipped:0,files:discovered.length,requiredFailures:failures},focused:{passed:264,newCases:regressions.map(t=>t.fullName)},checks,logs:await Promise.all(checks.map(c=>file(c.log))),compiled:{entries:11,sourceModules:compiled.size,processChecks:18,nodes},browser:{passed:12,recordings,reports,layouts},visualReview:{method:'Final-state contact sheets for all twelve journeys; six sampled migration/mapping filmstrips and selected complete 1440 x 1400 stage captures. Not full playback or physical-device certification.',artifacts:visual},publicRuntime:{files:173,unchangedFiles:173,esmDeltaBytes:0,cjsDeltaBytes:0,baseline:await file(artifact('public-before')),filesVerified:publicFiles,budgetFailures,unchanged},documents:await Promise.all(documents.map(file)),open:['Six separate default-adapter concurrency failures','Nested fragment handles, provider admission and safe retained adoption','Production storage/history growth, archive retention and compaction','Three raw-size overruns and complete fresh release CI','Overall ProseMirror + Tiptap parity']};
await writeFile(artifact('verification'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({newCases:28,focusedPassed:264,fullPassed:full.numPassedTests,defaultFailures:6,processChecks:18,browserChecks:12,publicFilesUnchanged:173,budgetFailures}));
