import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compareGitLabCompatibility} from '../integrations/gitlab/testing/compatibility.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),arg=flag=>process.argv[process.argv.indexOf(flag)+1];
if(!['--original','--fountain','--output'].every(flag=>process.argv.includes(flag)))throw new Error('Pass explicit --original report.json --fountain report.json --output directory');
const paths={original:resolve(root,arg('--original')),fountain:resolve(root,arg('--fountain'))},out=resolve(root,arg('--output'));
const allowed=resolve(root,'artifacts/gitlab-compatibility');
for(const path of [...Object.values(paths),out]){const rel=relative(allowed,path);if(!rel||isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep))throw new Error('Use explicit task compatibility artifact paths.');}
const bytes=await Promise.all(Object.values(paths).map(path=>readFile(path)));
const reports=bytes.map(value=>JSON.parse(value));const result=compareGitLabCompatibility(...reports);
result.inputs=Object.fromEntries(Object.keys(paths).map((side,index)=>[side,{path:relative(root,paths[side]).replaceAll('\\','/'),sha256:createHash('sha256').update(bytes[index]).digest('hex')}]));
result.comparatorHashes={};for(const path of ['scripts/compare-gitlab-compatibility.mjs','integrations/gitlab/testing/compatibility.mjs'])result.comparatorHashes[path]=createHash('sha256').update(await readFile(resolve(root,path))).digest('hex');
await mkdir(dirname(out),{recursive:true});await mkdir(out);
await writeFile(resolve(out,'report.json'),JSON.stringify(result,null,2)+'\n');
const table=['# Matched GitLab editor comparison','',`Environment matched: ${result.environment.matched}. Comparison complete: ${result.comparisonComplete}.`,
`Regression gate: ${result.regressionGate.passed?'passed':'failed/incomplete'}. Absolute feature acceptance: ${result.featureAcceptance.passed?'passed':'not achieved'}.`,'',
'| Case | Invariant | Classification |','| --- | --- | --- |',...result.rows.map(row=>`| ${row.case} | ${row.label} | ${row.classification??row.status} |`),'',
'Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.',''];
await writeFile(resolve(out,'report.md'),table.join('\n'));
console.log(JSON.stringify({output:out,environmentMatched:result.environment.matched,summary:result.summary,comparisonComplete:result.comparisonComplete,regressionGate:result.regressionGate,featureAcceptance:result.featureAcceptance}));
if(!result.regressionGate.passed)process.exitCode=1;
