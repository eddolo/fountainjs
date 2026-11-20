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
result.comparatorHashes={};for(const path of ['scripts/compare-gitlab-compatibility.mjs','integrations/gitlab/testing/compatibility.mjs','integrations/gitlab/testing/batch-review.mjs','integrations/gitlab/testing/build-identity.mjs','integrations/gitlab/testing/save-gesture.mjs'])result.comparatorHashes[path]=createHash('sha256').update(await readFile(resolve(root,path))).digest('hex');
await mkdir(dirname(out),{recursive:true});await mkdir(out);
const rollback=reports[0].rollback??(reports[0].rollbackRequested?{passed:false,records:[]}:undefined);

const browserDescription=report=>report.browser?.engine
  ? report.browser.engine+' '+report.browser.version+' ('+report.browser.platform+')'
  : report.browser?.version??'unverified';
const table=['# Matched GitLab editor comparison','','**Original** — '+describeBuild(reports[0]),'','**Replacement** — '+describeBuild(reports[1]),'','Browser on stock / replacement: '+reports.map(browserDescription).join(' / '),'',`Environment matched: ${result.environment.matched}. Comparison complete: ${result.comparisonComplete}.`,
`Regression gate: ${result.regressionGate.passed?'passed':'failed/incomplete'}. Absolute feature acceptance: ${result.featureAcceptance.passed?'passed':'not achieved'}.`,'',
...reports.flatMap(report => {
  if (!report.errors?.length) return [];
  const path = relative(out, paths[report.side]).replaceAll('\\','/');
  return [report.side + ' recorded ' + report.errors.length + ' browser error(s). See the errors in its [run report](' + path + ').',''];
}),
...(reports[0].suite === 'review-history' ? ['Collection attempts for this run: stock ' + reports[0].attempt + ', replacement ' + reports[1].attempt + '.', ''] : []),
...(reports[0].suggestionHistoryRollback?.passed ? ['The restored packaged GitLab services reopened ' + reports[0].suggestionHistoryRollback.records.length + ' notes from the repaired deployment. Their saved suggestion identities, Applied flags, eligibility, file bytes and branch heads matched.', ''] : []),
...(reports.some(report => report.deployment?.suggestionHistory) ? ['GitLab server profile on stock and replacement: ' + reports.map(report =>
  report.deployment?.suggestionHistory ? 'suggestion-history repair `' + report.deployment.suggestionHistory.patchSHA256 + '`' : 'packaged services').join(' / ') + '. The raw reports identify each loaded Ruby service.', ''] : []),
...(rollback?[result.frontendRollback.passed?'Stock GitLab reopened candidate-authored issues '+result.frontendRollback.issueIds.map(id=>'#'+id).join(', ')+', saved edits after rollback and retained their discussion comments.':'Frontend rollback acceptance remains open. See the stock input report for the immediate rich-text Save and Markdown Save outcomes.','']:[]),
'| Case | Invariant | Classification |','| --- | --- | --- |',...result.rows.map(row=>`| ${row.case} | ${row.label} | ${row.classification??row.status} |`),'',
'Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.',''];
if (reports[0].suite === 'board-issues' && reports[0].fixture.cases.some(entry => entry.measureLayout) && result.environment.matched) {
  table.push('## Issue drawer layout', '', 'Distances are CSS pixels. Save position is measured from the top of the drawer. At narrow width the author scrolls Save into view.', '',
    '| Editor | Viewport width | Drawer width | Editing area height | Save position | Save visible |',
    '| --- | ---: | ---: | ---: | ---: | --- |');
  for (const report of reports) {
    const layout = report.observations.find(item => item.input.measureLayout)?.layout;
    for (const size of ['desktop', 'narrow']) {
      const row = layout?.[size];
      if (row) table.push('| ' + [report.side, row.viewportWidth, row.drawerWidth, row.editorHeight, row.saveTop, row.saveVisible ? 'Yes' : 'No'].join(' | ') + ' |');
    }
  }
  table.push('');
}
if (reports[0].fixture.workflow === 'batch-review' && result.environment.matched) {
  table.push('## Batch submissions', '', '| Editor | Workflow | HTTP | Branch before batch | Branch after batch | Single recovery commit |',
    '| --- | --- | ---: | --- | --- | --- |');
  for (const report of reports) for (const item of report.observations) {
    const batch = item.batch;
    const sha = value => /^[a-f0-9]{40}$/u.test(value ?? '') ? '`' + value.slice(0,12) + '`' : 'Unverified';
    const http = batch?.liveUpdate?.requests?.length === 0 ? 'No apply request' : batch?.response?.status ?? 'Unverified';
    table.push('| ' + [report.side, item.id, http,
      sha(batch?.competingCommit?.id ?? item.setup?.seedCommit), sha(batch?.reloaded?.head),
      item.input.recoverUnchanged ? sha(batch?.recovery?.reloaded?.head) : 'Outside this case'].join(' | ') + ' |');
  }
  table.push('');
}
if (reports[0].suite==='reviewer-handoff' && result.environment.matched) {
  table.push('## Queued reviewer handoff','','| Editor | Open confirmation after role change | Enabled Apply or Add after reload | Apply request before restoration | Status after explicit confirmation |',
    '| --- | --- | --- | --- | --- |');
  for (const report of reports) {
    const batch=report.observations[0]?.batch, roles=batch?.roles;
    if (!roles?.open || !roles.fresh || !roles.requestsBeforeConfirmation) continue;
    const fresh=roles.fresh;
    const enabled=fresh.canApplyBatch || fresh.confirmEnabled || fresh.notes.some(note=>note.canApply || note.canAdd);
    table.push('| '+[report.side,(roles.open.confirmEnabled?'Enabled':'Unavailable')+' at '+roles.sampleMs+' ms',
      enabled?'Yes':'No',roles.requestsBeforeConfirmation.length,batch.response?.status ?? 'Unverified'].join(' | ')+' |');
  }
  table.push('', 'The same local reviewer held Developer, then Reporter, then Developer access. The open-tab observation is a timed sample. The fresh Reporter controls were scored on a newly loaded merge request.','');
}
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
if (reports[0].suite === 'concurrent-issues') {
  table.push('## Overlapping issue saves', '', '| Editor | Responses (Developer / author) | Overlap | Persisted draft | Other draft visible | Conflict warning |', '| --- | --- | ---: | --- | --- | --- |');
  for (const report of reports) {
    const item = report.observations?.find(o=>o.input?.kind==='simultaneous-issue');
    const scored = result.rows.find(row=>row.case===item?.id && row.invariant==='oneAcknowledged');
    if (!result.environment.matched || !scored?.classification) continue;
    const calls = item.submissions;
    const overlap = Math.min(...calls.map(c=>c.end))-Math.max(...calls.map(c=>c.start));
    const saved = calls.findIndex(c=>c.description===item.persisted);
    const other = saved===-1?undefined:item.decisions[1-saved];
    table.push('| '+report.side+' | '+calls.map(c=>c.status).join(' / ')+' | '+overlap.toFixed(1)+' ms | '+
      (['Developer','Issue author'][saved]??'Neither')+' | '+(other?.draftVisible?'Yes':'No')+' | '+
      (other?.warnings.some(w=>/conflict|someone edited the description/i.test(w))?'Yes':'No')+' |');
  }
  table.push('', 'The request intervals come from the two browser network responses. A single overlap measures this interleaving only.', '');
}
if (reports[0].suite === 'concurrent-reviews') {
  table.push('## Two confirmations on the same suggestion','');
  if (result.environment.matched && reports[0].deployment?.puma) {
    const {minThreads,maxThreads,workers} = reports[0].deployment.puma;
    table.push('Generated Puma configuration on both deployments: '+workers+' cluster workers, '+minThreads+' to '+maxThreads+' request threads.','');
  }
  table.push('| Editor | Reviewer | Apply response | Visible feedback |',
    '| --- | --- | --- | --- |');
  for (const report of reports) {
    for (const item of report.observations ?? []) {
      if (!result.environment.matched || result.rows.find(row=>row.case===item.id && row.invariant==='singleSuccess')?.[report.side]===undefined) {
        table.push('| '+report.side+' | Unverified | — | — |');
        continue;
      }
      for (const s of item.submissions) {
        const name=item.reviewers.find(r=>r.id===s.actor).username;
        const feedback=[s.badge?'Applied':'',s.alert].filter(Boolean).join(' / ').replaceAll('|','\\|').replace(/\s+/gu,' ');
        table.push('| '+report.side+' | '+name+' | HTTP '+s.status+' | '+feedback+' |');
      }
    }
  }
  table.push('','The browser request intervals must overlap. The saved branch, complete file and suggestion are checked independently after submission and reload.','');
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
if (reports.some(report => report.restartRequested)) {
  table.push('## GitLab service restart', '', '| Editor | Container | Started before (UTC) | Started after (UTC) | Issues read after restart |',
    '| --- | --- | --- | --- | --- |');
  for (const report of reports) {
    const restart = report.restart;
    const issues = restart?.records?.map(record => '#' + record.iid).join(', ');
    table.push('| ' + report.side + ' | ' + (restart?.containerId?.slice(0, 12) || 'Unverified') + ' | ' +
      (restart?.before || 'Unverified') + ' | ' + (restart?.after || 'Unverified') + ' | ' + (issues || 'Unverified') + ' |');
  }
  table.push('', 'The restart checks compare each saved description and formatted comment in the API and a fresh browser session. The input reports contain the volume records and the browser build identity after restart.', '');
}
if (rollback?.records?.length) {
  table.push('## Saved issues after frontend rollback', '');
  if (rollback.formatVersion === 2) {
    table.push('Immediate Markdown Save as the first edit after rollback: ' +
      (result.frontendRollback.firstMarkdownSavePassed ? 'passed on all paired issues.' : 'not verified on every paired issue.'), '');
  }
  table.push('| Authored in | Issue | First Markdown Save (key to click) | Rich-text key to click | Immediate rich-text Save | Reviewed Markdown Save and retained comment |',
    '| --- | --- | --- | ---: | --- | --- |');
  for (const record of rollback.records) {
    const timing = record.gesture?.clickAt - record.gesture?.keyAt;
    const quick = record.baselineFailure ? 'Pre-existing content mismatch; record left untouched' : record.quickSaveMeasured !== true ? 'Timing unverified' : record.quickSavePassed === undefined ? 'Unverified' : record.quickSavePassed ? 'Passed' : 'Lost edit';
    const firstTime = record.firstMarkdownGesture?.clickAt - record.firstMarkdownGesture?.keyAt;
    const first = Number.isFinite(firstTime) ? (record.firstMarkdownPassed ? 'Passed' : 'Failed') + ' (' + firstTime.toFixed(1) + ' ms)' : 'Unmeasured';
    const reviewed = record.reviewedSaveAfterReload !== undefined && Array.isArray(record.notes) ? 'Passed' : 'Unverified';
    table.push('| ' + (record.writer ?? 'Unverified') + ' | #' + record.iid + ' | ' + first + ' | ' + (Number.isFinite(timing) ? timing.toFixed(1)+' ms' : 'Unmeasured') + ' | ' + quick + ' | ' + reviewed + ' |');
  }
  table.push('');
}
if (reports[0].suite === 'wiki-rename' && result.environment.matched) {
  table.push('## History at the new page path', '', '| Project setting | Editor | History after move | Original revision selectable | History after restore |', '| --- | --- | --- | --- | --- |');
  for (const report of reports) {
    for (const item of report.observations) {
      const versions = rows => rows?.map(row => row.version + ' (`' + row.sha.slice(0, 12) + '`)').join(', ');
      table.push('| ' + [item.input.followRenames ? 'Follow renames' : 'GitLab default', report.side,
        versions(item.renamedHistory) ?? 'Unverified', item.selectedV1 === true ? 'Yes' : item.selectedV1 === false ? 'No' : 'Unverified',
        versions(item.after) ?? 'Restore unavailable from history'].join(' | ') + ' |');
    }
  }
  table.push('');
}
if (reports[0].suite === 'wiki-restore-conflict' && result.environment.matched) {
  const controller = reports[0].deployment?.wikiRestore;
  if (controller) table.push('Both deployments used wiki controller patch `' + controller.patchSHA256 + '`.', '');
  table.push('## Wiki restore history', '', '| Editor | Revision | Git commit | Commit message |', '| --- | --- | --- | --- |');
  for (const report of reports) {
    for (const item of report.observations) {
      for (const row of item.after ?? []) {
        table.push('| ' + [report.side, row.version, '`' + row.sha + '`', row.message.replaceAll('|', '\\|')].join(' | ') + ' |');
      }
    }
  }
  table.push('');
}
if (['wiki-history','wiki-titles'].includes(reports[0].suite) && result.environment.matched) {
  if (reports[0].deployment?.wikiRestore) {
    table.push('Both deployments used the same wiki controller patch `' + reports[0].deployment.wikiRestore.patchSHA256 +
      '`. The stock frontend submits the content field. The repaired frontend also submits the selected Git revision.', '');
  }
  table.push('## Stored wiki revisions', '', '| Case | Editor | Revision | Git commit | Matches expected source |',
    '| --- | --- | --- | --- | --- |');
  for (const report of reports) {
    for (const item of report.observations) {
      for (const [version, invariant] of [['v2','editedSource'], ['v3','restoredSource']]) {
        const sha = item.after?.find(entry => entry.version === version)?.sha;
        const check = result.rows.find(row => row.case === item.id && row.invariant === invariant);
        const actual = check?.[report.side];
        const outcome = typeof actual === 'string' ? (actual === check.expected ? 'Exact' : 'Different') : 'Unverified';
        table.push('| ' + [item.id, report.side, version, sha ? '`' + sha + '`' : 'Unverified', outcome].join(' | ') + ' |');
      }
    }
  }
  table.push('');
  function lineEndings(source) {
    if (typeof source !== 'string') return 'Unrecorded';
    const breaks = source.match(/\r\n|\r|\n/g) ?? [];
    const names = { '\r\n': 'CRLF', '\r': 'CR', '\n': 'LF' };
    const kinds = [...new Set(breaks.map(value => names[value]))];
    const terminal = source.match(/(\r\n|\r|\n)$/)?.[0];
    return (kinds.join(' + ') || 'No breaks') + ' (' + (terminal ? 'final ' + names[terminal] : 'no final newline') + ')';
  }
  table.push('## Wiki Markdown line endings', '', '| Case | Editor | Action | Form before encoding | Submitted request | Stored revision |',
    '| --- | --- | --- | --- | --- | --- |');
  for (const report of reports) {
    for (const item of report.observations) {
      for (const action of ['edit', 'restore']) {
        const field = item.submissions?.fields.findLast(entry => entry.form === action)?.values.at(-1);
        const posted = item.submissions?.requests.find(entry => entry.stage === action)?.values.at(-1);
        const stored = action === 'edit' ? item.editedSource : item.restoredSource;
        table.push('| ' + [item.id, report.side, action, ...[field, posted, stored].map(lineEndings)].join(' | ') + ' |');
      }
    }
  }
  table.push('');
}
await writeFile(resolve(out,'report.json'),JSON.stringify(result,null,2)+'\n');
await writeFile(resolve(out,'report.md'),table.join('\n'));
console.log(JSON.stringify({output:out,environmentMatched:result.environment.matched,summary:result.summary,comparisonComplete:result.comparisonComplete,regressionGate:result.regressionGate,featureAcceptance:result.featureAcceptance}));
if(!result.regressionGate.passed||result.frontendRollback?.passed===false)process.exitCode=1;
