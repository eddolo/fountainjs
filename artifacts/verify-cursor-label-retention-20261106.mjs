import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {dirname,relative,resolve} from 'node:path';
const prefix='artifacts/cursor-label',unitPath=prefix+'-unit-20261106.json',browserPath=prefix+'-final-20261106.json';
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const file=async path=>({path,sha256:await hash(path)});
const unit=await read(unitPath),browser=await read(browserPath),checks=await read(prefix+'-checks-20261106.json');
assert.equal(unit.numTotalTests,4321);assert([6,7].includes(unit.numFailedTests));assert.equal(unit.numPassedTests,4321-unit.numFailedTests);assert.equal(unit.numPendingTests,0);
const failures=unit.testResults.flatMap(s=>s.assertionResults.filter(t=>t.status==='failed').map(t=>({file:relative('.',s.name).replaceAll('\\','/'),name:t.fullName})));
const requiredFailures=failures.filter(test=>test.file!=='tests/ci-browser-evidence.test.ts');
const baseline=await read('artifacts/cursor-overlay-verification-20261106.json');assert.deepEqual(requiredFailures,baseline.unit.requiredFailures);
const ciPath=prefix+'-ci-recheck-20261106.json',ci=await read(ciPath);assert.equal(ci.numTotalTests,2);assert.equal(ci.numPassedTests,2);assert.equal(ci.numFailedTests,0);assert.equal(ci.numPendingTests,0);
const ciAssertions=ci.testResults.flatMap(s=>s.assertionResults);assert(ciAssertions.every(test=>test.status==='passed'));
const repaired=failures.filter(test=>test.file==='tests/ci-browser-evidence.test.ts');assert.equal(repaired.length,unit.numFailedTests-6);assert(repaired.every(test=>ciAssertions.some(current=>current.fullName===test.name)));
const focusNames=['yjs-retained-adapter','yjs-retained-document','yjs-retained-text','yjs-retained-nodes','yjs-retained-mapping','widget-overlays','collaboration'];
const focused=unit.testResults.filter(s=>focusNames.some(n=>s.name.replaceAll('\\','/').endsWith('/'+n+'.test.ts'))).flatMap(s=>s.assertionResults);
assert.equal(focused.length,187);assert(focused.every(t=>t.status==='passed'));
assert.equal(browser.stats.expected,84);for(const key of ['unexpected','flaky','skipped'])assert.equal(browser.stats[key],0);assert.equal(browser.config.workers,1);
const journeys=[];function visit(suites){for(const s of suites){visit(s.suites??[]);for(const spec of s.specs??[])for(const test of spec.tests??[])journeys.push({name:spec.title,...test})}}visit(browser.suites);
assert.equal(journeys.length,84);const perProject={};for(const test of journeys){assert.equal(test.status,'expected');assert.equal(test.results.length,1);perProject[test.projectName]=(perProject[test.projectName]??0)+1;
 const runtime=test.results[0].attachments.find(a=>a.name==='runtime-modules');assert(runtime?.body);const urls=JSON.parse(Buffer.from(runtime.body,'base64').toString('utf8'));assert(urls.includes('/artifacts/cursor-overlay-build-20261106/engine.js'));assert(!urls.some(url=>url.startsWith('/src/')));
}
assert.deepEqual(perProject,{chromium:28,firefox:28,webkit:28});
const expectedChecks=['build','unit','test:api','test:headless','test:package','test:server-runtimes','typecheck','test:budget','test:performance'];
assert.deepEqual(checks.map(c=>c.check),expectedChecks);for(const check of checks)assert.equal(check.exitCode,['unit','test:budget'].includes(check.check)?1:0);
const budget=await readFile(prefix+'-test-budget-20261106.log','utf8');assert(!budget.includes('- dist/styles.css exceeds'));assert.equal((budget.match(/^- .*exceeds its budget/gm)??[]).length,3);
const compiledNode=await Promise.all(['es','cjs'].map(mode=>read(`${prefix}-node-${mode}-20261106.json`)));assert(compiledNode.every(row=>row.passed===16&&row.domRequired===false));
const mapped=new Set(),canary='artifacts/cursor-overlay-build-20261106';for(const name of await readdir(canary))if(name.endsWith('.map')){const path=resolve(canary,name),map=await read(path);for(let i=0;i<map.sources.length;i++){const source=resolve(dirname(path),map.sources[i]);if(source.startsWith(resolve('src')+'/')||source.startsWith(resolve('src')+'\\')){assert.equal(map.sourcesContent[i],await readFile(source,'utf8'));mapped.add(relative('.',source).replaceAll('\\','/'))}}}
for(const path of ['src/view/widget-overlays.ts','src/yjs/retained-document.ts','src/yjs/retained-mapping.ts'])assert(mapped.has(path));
assert.equal(await hash(`${canary}/styles.css`),await hash('src/styles.css'));assert.equal(await hash('dist/styles.css'),await hash('src/styles.css'));
for(const path of ['api-surface.json','scripts/check-build-budgets.mjs','scripts/check-performance-budgets.mjs','tests/yjs-document-range.test.ts','src/yjs/index.ts'])assert.equal((await readFile(path,'utf8')).replaceAll('\r\n','\n'),execFileSync('git',['-c','core.longpaths=true','show',`f2020107:${path}`],{encoding:'utf8',maxBuffer:16*1024*1024}).replaceAll('\r\n','\n'));
const costPath='artifacts/retained-adoption-cost-final-20261106.json',cost=await read(costPath);assert.equal(cost.trials,1);assert.equal(cost.rows.length,4);for(const blocks of [100,500]){const rows=cost.rows.filter(row=>row.blocks===blocks);assert.equal(rows.length,2);assert(rows.every(row=>row.documentMatchesPlain));assert.equal(rows[0].documentSha256,rows[1].documentSha256)}
const beforePath='artifacts/retained-adoption-cost-before-20261106.log',beforeRows=(await readFile(beforePath,'utf8')).split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));assert.equal(beforeRows.length,3);assert(!beforeRows.some(row=>row.blocks===500&&row.retained));
const before=beforeRows.find(row=>row.blocks===100&&row.retained),after=cost.rows.find(row=>row.blocks===100&&row.retained);assert.equal(before.documentSha256,after.documentSha256);assert.equal(before.sharedBytes,after.sharedBytes);assert(after.diagnosticExtraEdit.sizeGetterCalls<before.diagnosticExtraEdit.sizeGetterCalls);
const evidence=[];async function walk(folder){for(const entry of await readdir(folder,{withFileTypes:true})){const path=`${folder}/${entry.name}`;if(entry.isDirectory())await walk(path);else evidence.push(await file(path))}}await walk('artifacts/cursor-label-final-20261106');assert.equal(evidence.filter(f=>f.path.endsWith('.webm')).length,84);
const paths=['src/extensions/collaboration.ts','src/styles.css','src/view/widget-overlays.ts','src/yjs/retained-document.ts','src/yjs/retained-mapping.ts','tests/manual/cursor-native-reference.spec.ts','tests/yjs-retained-adapter.test.ts','tests/yjs-retained-mapping.test.ts','tests/ci-browser-evidence.test.ts','artifacts/cursor-native-reference-20261106.html','artifacts/retained-adapter-node-20261106.mjs','artifacts/cursor-label-final-20261106.config.ts','artifacts/retained-adoption-cost-20261106.mjs'];
const logs=await Promise.all(checks.map(check=>file(`${prefix}-${check.check==='build'?'build':check.check==='unit'?'unit':check.check.replace(':','-')}-20261106.log`)));
const compiledArtifacts=await Promise.all((await readdir(canary)).map(name=>file(`${canary}/${name}`)));
const receipt={date:'2026-11-06',baselineCommit:'f2020107',goalComplete:false,publication:'Local only; no push, npm or website update.',defaultAdapterSwitched:false,
 source:await Promise.all(paths.map(file)),unit:{...await file(unitPath),total:unit.numTotalTests,passed:unit.numPassedTests,failed:unit.numFailedTests,skipped:0,fullRunFailures:failures,remainingRequiredFailures:requiredFailures,focusedPassed:focused.length,
  ciFollowup:{...await file(ciPath),passed:2,failed:0,resolved:repaired,fullSuiteRerun:repaired.length===0,note:repaired.length?'Only the CI bookkeeping test changed after the full run; its two tests were rerun successfully. Application sources remain identical to the recorded canary.':'The full source run also contains the corrected CI bookkeeping tests.'}},
 browser:{...await file(browserPath),passed:84,failed:0,skipped:0,retries:0,workers:1,perProject,compiledRuntimeVerifiedEveryJourney:true,mappedCurrentSourceModules:mapped.size,cssMatchesSourceAndPublicBuild:true,recordings:84,evidence,visualReview:'Narrow Latin/Arabic direction cases, top-edge placement, screenshots across all three engines and sampled recording frames. Not physical-device/IME certification.'},
 compiledNode:{journeys:32,formats:compiledNode},checks,logs,compiledArtifacts,
 cost:{...await file(costPath),before:{...await file(beforePath),complete:false,stoppedDuringRetained500ParagraphCase:true,completedRows:beforeRows},final:cost,adoptionReady:false},
 invariants:{apiSnapshotUnchanged:true,budgetCeilingsUnchanged:true,defaultRequiredTestsUnchanged:true,defaultAdapterUnchanged:true},
 open:['Six default-adapter retention failures','Experimental adapter cost at 500 paragraphs is unacceptable','Incremental projection/indexing, metadata growth, compaction and migration','General non-monotonic public anchor mapping not certified','Core ESM and aggregate ESM/CommonJS size overruns','Full parity goal remains active']};
await writeFile(prefix+'-verification-20261106.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({fullUnitRunPassed:receipt.unit.passed,fullUnitRunFailed:unit.numFailedTests,ciFollowupPassed:2,remainingKnownFailures:6,browserPassed:84,compiledNode:32,mappedSources:mapped.size,recordings:84,adoptionReady:false}));
