import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describeBuild} from '../integrations/gitlab/testing/build-identity.mjs';
import {compareGitLabCompatibility} from '../integrations/gitlab/testing/compatibility.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),arg=flag=>process.argv[process.argv.indexOf(flag)+1];
if(!['--original','--fountain','--output'].every(flag=>process.argv.includes(flag)))throw new Error('Pass explicit --original report.json --fountain report.json --output directory');
const paths={original:resolve(root,arg('--original')),fountain:resolve(root,arg('--fountain'))},out=resolve(root,arg('--output'));
const allowed=resolve(root,'artifacts/gitlab-compatibility');
for(const path of [...Object.values(paths),out]){const rel=relative(allowed,path);if(!rel||isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep))throw new Error('Use explicit task compatibility artifact paths.');}
const bytes=await Promise.all(Object.values(paths).map(path=>readFile(path)));
const reports=bytes.map(value=>JSON.parse(value));const result=compareGitLabCompatibility(...reports);
result.inputs=Object.fromEntries(Object.keys(paths).map((side,index)=>[side,{path:relative(root,paths[side]).replaceAll('\\','/'),sha256:createHash('sha256').update(bytes[index]).digest('hex')}]));
result.comparatorHashes={};for(const path of ['scripts/compare-gitlab-compatibility.mjs','integrations/gitlab/testing/compatibility.mjs','integrations/gitlab/testing/build-identity.mjs','integrations/gitlab/testing/save-gesture.mjs'])result.comparatorHashes[path]=createHash('sha256').update(await readFile(resolve(root,path))).digest('hex');
await mkdir(dirname(out),{recursive:true});await mkdir(out);
const rollback=reports[0].rollback??(reports[0].rollbackRequested?{passed:false,records:[]}:undefined);

const browserDescription=report=>report.browser?.engine
  ? report.browser.engine+' '+report.browser.version+' ('+report.browser.platform+')'
  : report.browser?.version??'unverified';
const table=['# Matched GitLab editor comparison','','**Original** — '+describeBuild(reports[0]),'','**Replacement** — '+describeBuild(reports[1]),'','Browser on stock / replacement: '+reports.map(browserDescription).join(' / '),'',`Environment matched: ${result.environment.matched}. Comparison complete: ${result.comparisonComplete}.`,
`Regression gate: ${result.regressionGate.passed?'passed':'failed/incomplete'}. Absolute feature acceptance: ${result.featureAcceptance.passed?'passed':'not achieved'}.`,'',
...(rollback?[result.frontendRollback.passed?'Stock GitLab reopened candidate-authored issues '+result.frontendRollback.issueIds.map(id=>'#'+id).join(', ')+', saved edits after rollback and retained their discussion comments.':'Frontend rollback acceptance remains open. See the stock input report for the immediate rich-text Save and Markdown Save outcomes.','']:[]),
'| Case | Invariant | Classification |','| --- | --- | --- |',...result.rows.map(row=>`| ${row.case} | ${row.label} | ${row.classification??row.status} |`),'',
'Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.',''];
if (['stale-reviews','relocated-reviews'].includes(reports[0].suite)) {
  table.push('## Apply after the source commit', '', '| Workflow | Stock GitLab | Fountain |', '| --- | --- | --- |');
  for (const input of reports[0].fixture.cases) {
    const row = result.rows.find(entry => entry.case === input.id && ['applyRefused','appliedAtNewLocation'].includes(entry.invariant));
    const decisions = reports.map((report,index) => {
      const item = report.observations?.find(entry => entry.id === input.id);
      if (!result.environment.matched || row?.[index === 0 ? 'original' : 'fountain'] === undefined) return 'Unverified';
      if (item.blockedAtControl?.buttonDisabled) return 'Apply disabled; GitLab marked the same suggestion inapplicable';
      return 'Apply submitted (HTTP ' + item.applyResponse.status + ')';
    });
    table.push('| ' + input.id + ' | ' + decisions.join(' | ') + ' |');
  }
  table.push('');
}
if (reports[0].suite === 'quick-save') {
  table.push('## Final key to Save click', '',
    '| Workflow | Stock GitLab | Fountain | Persisted Markdown after reload |',
    '| --- | ---: | ---: | --- |');
  for (const input of reports[0].fixture.cases) {
    const timings = reports.map(report => {
      const gesture = report.observations.find(item => item.id === input.id)?.gesture;
      return Number.isFinite(gesture?.clickAt) && Number.isFinite(gesture?.keyAt)
        ? (gesture.clickAt - gesture.keyAt).toFixed(1) + ' ms' : 'Unverified';
    });
    const saved = result.rows.find(row => row.case === input.id && row.invariant === 'afterReload');
    table.push('| ' + input.id + ' | ' + timings.join(' | ') + ' | ' + (saved.classification ?? saved.status) + ' |');
  }
  table.push('', 'Immediate clicks must arrive within 100 ms of the final keydown. The review controls wait at least 500 ms. Both sides must show the intended paragraph at click time.', '');
}
if (rollback?.records?.length) {
  table.push('## Saved issues after frontend rollback', '',
    '| Authored in | Issue | Final key to click | Immediate rich-text Save | Reviewed Markdown Save and retained comment |',
    '| --- | --- | ---: | --- | --- |');
  for (const record of rollback.records) {
    const timing = record.gesture?.clickAt - record.gesture?.keyAt;
    const quick = record.quickSaveMeasured !== true ? 'Timing unverified' : record.quickSavePassed === undefined ? 'Unverified' : record.quickSavePassed ? 'Passed' : 'Lost edit';
    const reviewed = record.reviewedSaveAfterReload !== undefined && Array.isArray(record.notes) ? 'Passed' : 'Unverified';
    table.push('| ' + (record.writer ?? 'Unverified') + ' | #' + record.iid + ' | ' + (Number.isFinite(timing) ? timing.toFixed(1)+' ms' : 'Unmeasured') + ' | ' + quick + ' | ' + reviewed + ' |');
  }
  table.push('');
}
await writeFile(resolve(out,'report.json'),JSON.stringify(result,null,2)+'\n');
await writeFile(resolve(out,'report.md'),table.join('\n'));
console.log(JSON.stringify({output:out,environmentMatched:result.environment.matched,summary:result.summary,comparisonComplete:result.comparisonComplete,regressionGate:result.regressionGate,featureAcceptance:result.featureAcceptance}));
if(!result.regressionGate.passed||result.frontendRollback?.passed===false)process.exitCode=1;
