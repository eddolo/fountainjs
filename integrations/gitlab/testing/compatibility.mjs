import { matchesSaveGesture } from './save-gesture.mjs';
import { batchReviewChecks } from './batch-review.mjs';
import { buildIdentityError } from './build-identity.mjs';

/** Pure interpretation of collected observations; never runs editor actions. */
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const equal=(left,right)=>canonical(left)===canonical(right);
export function classifyInvariant(expected,original,fountain){
  if(original===undefined||fountain===undefined)return null;
  const a=equal(original,expected),b=equal(fountain,expected);
  if(a&&b)return 'parity';
  if(!a&&b)return 'improvement';
  if(a&&!b)return 'regression';
  return equal(original,fountain)?'shared-limitation':null;
}
// For fixtures with exactly two nonempty paragraphs, one LF or a blank-line
// separator expresses that boundary. Preserve all other characters and reject
// missing boundaries, extra empty paragraphs, CR and invisible alterations.
export const conversionDescription=value=>typeof value==='string'?value.replace(/^\n+|\n+$/gu,''):undefined;
export const clipboardParagraphs=value=>typeof value==='string'?value.split(/\n{1,2}/u):undefined;
export function suggestionBlock(markdown){
  if(typeof markdown!=='string')return undefined;
  if(markdown==='')return {source:'',params:null,emptyDocument:true};
  const lines=markdown.split('\n'),starts=[];
  for(let index=0;index<lines.length;index++){
    const match=lines[index].match(/^(`{3,}|~{3,})suggestion(?::([+-]\d+[+-]\d+))?$/u);
    if(match)starts.push({index,fence:match[1],params:match[2]??''});
  }
  if(starts.length!==1)return undefined;
  const {index,fence,params}=starts[0];
  for(let end=index+1;end<lines.length;end++){
    const match=lines[end].match(/^(`+|~+)[ \t]*$/u);
    if(match&&match[1][0]===fence[0]&&match[1].length>=fence.length){
      const body=lines.slice(index+1,end);return {source:body.length?body.join('\n')+'\n':'',params};
    }
  }
  return undefined;
}
const decoded=file=>typeof file?.content==='string'?Buffer.from(file.content,'base64').toString('utf8'):undefined;
function verifiedEditor(report,item){
  if(!item?.editorProof)return false;
  return report.side==='original'?item.editorProof.native===false&&/\bProseMirror\b/u.test(item.editorProof.className):item.editorProof.native===true&&/\bfountain-editor\b/u.test(item.editorProof.className);
}
function observedValues(report,item,input,fixture,expectedAppliedFile){
  if(!verifiedEditor(report,item))return {};
  const raw=item.prefillDOM;
  // Native source owns one final line terminator; remove exactly that terminator,
  // never trim whitespace or remove invisible/private-use characters.
  const prefill=typeof raw==='string'&&report.side==='fountain'&&raw.endsWith('\n')?raw.slice(0,-1):raw;
  const first=suggestionBlock(item.sourceAtFirstVisible),settled=suggestionBlock(item.sourceModeBeforeEdit),saved=suggestionBlock(item.saved?.body);
  const result={prefill,firstSource:first?.source,settledSource:settled?.source,range:settled?.params};
  if(input.scope==='handoff')return result;
  if(input.scope==='review'){
    const review=item.review;
    result.reviewInitial=review?.initial;result.reviewBeforeRange=review?.beforeRange;result.reviewAfterRange=review?.afterRange;
    result.reviewUndo=review?.afterUndo;result.reviewRedo=review?.afterRedo;
    const draft=suggestionBlock(review?.sourceBeforeSave),edited=suggestionBlock(review?.saved?.body),reopened=suggestionBlock(item.reopenedSource);
    result.reviewDraftSource=draft?.source;result.reviewDraftRange=draft?.params;
    result.reviewSavedBody=review?.saved?.body;result.reviewReopenedSource=reopened?.source;result.reviewReopenedRange=reopened?.params;
    if(item.appliedNote?.suggestions?.length===1)result.appliedFlagAtCommit=item.appliedNote.suggestions[0].applied;
  }
  if(input.scope==='deletion'){
    result.richReplacement=item.deletion?.richSource;
    result.deletionExplanation=item.deletion?.explicitDeletionExplanation;
    if(item.deletion)result.consent=input.replacement.length>0
      ?{present:item.deletion.confirmationPresent,blocked:item.deletion.blockedBeforeConsent,confirmed:item.deletion.confirmed??false}
      :{present:item.deletion.confirmationPresent,blocked:item.deletion.blockedBeforeConsent};
    result.reopenedSource=suggestionBlock(item.reopenedSource)?.source;
    if(item.appliedNote?.suggestions?.length===1)result.appliedFlagAtCommit=item.appliedNote.suggestions[0].applied;
  }
  result.savedSource=saved?.source;result.savedRange=saved?.params;
  result.beforeApplySource=decoded(item.beforeApplyFile);
  if(item.beforeApplyHead!==undefined&&item.setup?.seedCommit!==undefined)result.noEarlyCommit=item.beforeApplyHead===item.setup.seedCommit;
  result.appliedSource=decoded(item.appliedFile);
  if(Array.isArray(item.appliedCommit?.parent_ids)&&item.setup?.seedCommit)result.singleApplyCommit=equal(item.appliedCommit.parent_ids,[item.setup.seedCommit]);
  if(typeof item.saved?.body==='string'&&typeof item.afterProseNote?.body==='string')result.proseOnlyBody=item.afterProseNote.body===item.saved.body+fixture.proseSuffix;
  if(item.appliedFile&&item.afterProseFile&&item.appliedCommit?.id&&item.afterProseHead)result.noProseFileChange=decoded(item.appliedFile)===decoded(item.afterProseFile)&&item.appliedFile.last_commit_id===item.afterProseFile.last_commit_id&&item.afterProseHead===item.appliedCommit.id;
  const before=item.appliedNote?.suggestions;
  // Stock GitLab can expose the new body before it has recreated the suggestion
  // rows. The history workflow reads them again after the reader reloads.
  const after=input.historyControls ? item.history?.initial?.suggestions : item.afterProseNote?.suggestions;
  if(before?.length===1&&after?.length===1&&before[0].applied===true&&before[0].to_content===after[0].to_content){
    result.appliedFlag=after[0].applied;result.stableSuggestionId=before[0].id===after[0].id;
  }
  if (input.historyControls && item.history) {
    const { initial, phases, finalBadges } = item.history;
    const applied = item.appliedNote?.suggestions?.[0];
    const next = fixture.comparisonProposal + '\n', changed = fixture.changedProposal + '\n';
    const records = phase => phases[phase]?.saved?.suggestions;
    const valid = list => Array.isArray(list) && list.every(record => Number.isSafeInteger(record.id) && record.id > 0)
      && new Set(list.map(record => record.id)).size === list.length;
    const stored = list => list.map(({ id, applied, from_content, to_content }) => ({ id, applied, from_content, to_content }));
    const added = records('add'), reordered = records('reorder'), updated = records('change'), ranged = records('range');
    if (applied?.applied && valid(added)) result.historyAdd = added.length === 2 && added[0].id !== applied.id && !added[0].applied
      && added[0].to_content === next && added[1].id === applied.id && added[1].applied && added[1].to_content === applied.to_content;
    if (valid(added) && valid(reordered)) result.historyReorder = equal(stored(reordered), stored([...added].reverse())) && reordered[0]?.id === applied?.id;
    if (phases.duplicate?.saved && phases.reorder?.saved) {
      result.historyRefusal = phases.duplicate.status === 422 && phases.duplicate.serverMessage === true
        && phases.duplicate.saved.body === phases.reorder.saved.body && valid(records('duplicate')) && valid(reordered)
        && equal(stored(records('duplicate')), stored(reordered));
      result.historyDraft = typeof phases.duplicate.draft === 'string' && phases.duplicate.draft === phases.duplicate.submitted;
      result.historyExplanation = phases.duplicate.visibleError === true;
      result.historyExplanationOnscreen = phases.duplicate.errorInitiallyOnscreen === true;
    }
    if (valid(added) && valid(updated)) result.historyChange = updated.length === 2 && updated[0].to_content === changed
      && updated[1].id === added[0]?.id && updated[1].to_content === next && updated.every(record => record.applied === false)
      && !added.some(record => record.id === updated[0].id);
    if (valid(updated) && valid(ranged)) result.historyRange = ranged.length === 2 && equal(stored(ranged.slice(0, 1)), stored(updated.slice(0, 1)))
      && ranged[1].to_content === next && ranged[1].from_content === expectedAppliedFile.split('\n').slice(input.range.end - 1, input.range.end + 1).join('\n')+'\n'
      && !updated.some(record => record.id === ranged[1].id) && ranged[1].applied === false;
    if (['add','reorder','duplicate','change','range'].every(phase => phases[phase]?.saved)) {
      result.historyFile = initial?.head === item.appliedCommit?.id && initial?.file === item.appliedFile?.content
        && Object.values(phases).every(phase => phase.saved.head === initial.head && phase.saved.file === initial.file);
    }
    if (input.outdatedHistory && item.history.outdatedBefore && phases.outdated?.saved) {
      const prior = item.history.outdatedBefore, after = phases.outdated.saved, commit = item.history.competingCommit;
      if (valid(prior.suggestions) && valid(after.suggestions) && valid(added)) {
        result.outdatedIdentity = prior.suggestions.length === 2 && equal(stored(prior.suggestions), stored(added))
          && equal(stored(after.suggestions), stored(prior.suggestions)) && after.suggestions[1]?.applied === true
          && after.suggestions[1].id === applied?.id && after.suggestions[0]?.applied === false;
        result.outdatedEligibility = prior.suggestions[0]?.appliable === false && after.suggestions[0]?.appliable === false;
      }
      result.outdatedProse = after.body === prior.body + fixture.outdatedSuffix;
      result.outdatedFile = commit?.id === prior.head && equal(commit.parents,[item.appliedCommit.id])
        && after.head === prior.head && after.file === prior.file && Buffer.from(prior.file,'base64').toString('utf8') === input.remoteSource;
    }
    result.historyInitialBadge = item.afterProseAppliedBadge;
    result.historyFinalBadges = finalBadges;
  }
  return result;
}
const suggestionServices = {
  'app/services/notes/update_service.rb': '8387e916fc949a06bcd02b2b021a627d3711dfc0bab5ebf80269502ed098a5f2',
  'app/services/suggestions/create_service.rb': '62f36b02054509242ffd628ce2f8e0b2205a0faf5a9144ffd30f9fbc5cf38e4a',
};
function suggestionServicesMatch(report) {
  const receipt = report.deployment?.suggestionHistory;
  if (!receipt && report.suite !== 'review-history') return true;
  if (receipt && (receipt.revision !== report.buildIdentity?.expected?.gitlabCommit ||
      !/^[a-f0-9]{64}$/u.test(receipt.patchSHA256) ||
      !equal(Object.keys(receipt.files ?? {}).sort(), Object.keys(suggestionServices).sort()))) return false;
  return Object.entries(suggestionServices).every(([file, original]) => {
    const entry = receipt?.files[file];
    if (receipt && (entry?.original !== original || entry.patched === original || !/^[a-f0-9]{64}$/u.test(entry.patched))) return false;
    const suffix = '  /opt/gitlab/embedded/service/gitlab-rails/' + file;
    const observed = report.backend?.serverSources?.filter(line => typeof line === 'string' && line.endsWith(suffix));
    return equal(observed, [(entry?.patched ?? original) + suffix]);
  });
}
export function compareGitLabCompatibility(original,fountain){
  const mismatches=[];
  for (const report of [original, fountain]) {
    if (!suggestionServicesMatch(report)) mismatches.push(report.side + ' suggestion service sources');
    const error = buildIdentityError(report);
    if (error) mismatches.push(report?.side + ' build identity: ' + error);
  }
  const check=(name,a,b)=>{if(a===undefined||b===undefined||!equal(a,b))mismatches.push(name);};
  if(original?.side!=='original'||fountain?.side!=='fountain')mismatches.push('editor-side');
  if (original.restartRequested || fountain.restartRequested) {
    check('restart requested', original.restartRequested, fountain.restartRequested);
    for (const report of [original, fountain]) {
      const evidence = report.restart;
      if (!evidence || !/^[a-f0-9]{64}$/u.test(evidence.containerId)
        || !(Date.parse(evidence.after) > Date.parse(evidence.before))
        || !Array.isArray(evidence.mounts) || !Array.isArray(report.deployment?.backendMounts) || !report.deployment.backendMounts.every(volume =>
          evidence.mounts.some(mount => mount.Type === 'volume' && mount.Name === volume.name && mount.Destination === volume.destination))
        || !evidence.buildIdentity || buildIdentityError({ ...report, buildIdentity: evidence.buildIdentity })
        || !equal(evidence.buildIdentity.expected, report.buildIdentity?.expected)
        || evidence.buildIdentity.observed.manifestSHA256 !== report.buildIdentity?.observed?.manifestSHA256)
        mismatches.push(report.side + ' restart or post-restart build identity');
    }
  }
  if(original?.buildProbeIssue || fountain?.buildProbeIssue)check('build control issue',original?.buildProbeIssue,fountain?.buildProbeIssue);
  check('expected GitLab source revision', original?.buildIdentity?.expected?.gitlabCommit, fountain?.buildIdentity?.expected?.gitlabCommit);
  for(const key of ['runId','fixtureHash','fixture','harnessHashes','browser'])check(key,original?.[key],fountain?.[key]);
  for(const key of ['image','imageId','backendMounts','backendEnvironmentHash','cpus','memory'])check('deployment.'+key,original?.deployment?.[key],fountain?.deployment?.[key]);
  if (original?.deployment?.suggestionHistory || fountain?.deployment?.suggestionHistory)
    check('deployment.suggestionHistory', original?.deployment?.suggestionHistory, fountain?.deployment?.suggestionHistory);
  if (original?.deployment?.footnoteFilter || fountain?.deployment?.footnoteFilter) check('deployment.footnoteFilter',original?.deployment?.footnoteFilter,fountain?.deployment?.footnoteFilter);
  if (original?.deployment?.puma || fountain?.deployment?.puma) check('deployment.puma',original?.deployment?.puma,fountain?.deployment?.puma);
  for(const key of ['version','project','actor','serverSources'])check('backend.'+key,original?.backend?.[key],fountain?.backend?.[key]);
  const fixture=original?.fixture,rows=[];
  if(!Array.isArray(fixture?.cases)||fixture.cases.length===0||fixture.cases.length>100)throw new Error('Invalid comparison fixture');
  for(const input of fixture.cases){
    const a=original.observations?.find(item=>item.id===input.id),b=fountain.observations?.find(item=>item.id===input.id);
    if(a&&!equal(a.input,input))mismatches.push(input.id+':original-input');
    if(b&&!equal(b.input,input))mismatches.push(input.id+':fountain-input');
    if (input.scope === 'batch-review') {
      const left = batchReviewChecks(input, fixture, verifiedEditor(original,a) ? a : undefined);
      const right = batchReviewChecks(input, fixture, verifiedEditor(fountain,b) ? b : undefined);
      for (const [key,label] of Object.entries(left.labels))
        rows.push({case:input.id,invariant:key,label,expected:true,original:left.values[key],fountain:right.values[key],classification:null});
      continue;
    }
    if (input.scope === 'concurrent-review') {
      const body = '```suggestion:-0+0\n'+input.source.split('\n')[input.range.start-1]+'\n'+fixture.appendLine+'```\n\n'+fixture.marker;
      const assess = (report,item) => {
        if (!verifiedEditor(report,item) || item.status!=='observed') return {};
        const {reviewers,submissions,saved,setup,membership,cleanupMembership} = item;
        if (reviewers?.length!==2 || submissions?.length!==2 || saved?.suggestions?.length!==1) return {};
        const suggestion = saved.suggestions[0];
        if (!Number.isSafeInteger(suggestion.id) || suggestion.id<=0 || suggestion.appliable!==true || suggestion.applied!==false ||
            !Number.isSafeInteger(saved.id) || saved.body!==body ||
            !/^[a-f0-9]{40}$/u.test(setup?.seedCommit) || item.beforeApplyHead!==setup.seedCommit ||
            decoded(item.beforeApplyFile)!==input.source || reviewers[0].username!=='root' ||
            reviewers[1].username!==fixture.username || reviewers[0].id===reviewers[1].id ||
            membership?.id!==reviewers[1].id || membership.accessLevel!==30 ||
            cleanupMembership?.id!==membership.id || cleanupMembership.accessLevel!==10 ||
            !submissions.every((s,i)=>Number.isSafeInteger(reviewers[i].id) && s.actor===reviewers[i].id &&
              s.path==='/api/v4/suggestions/'+suggestion.id+'/apply' && Number.isInteger(s.status) &&
              Number.isFinite(s.start) && Number.isFinite(s.end) && Number.isFinite(s.requestStart) && s.requestStart>=0 &&
              Number.isFinite(s.responseEnd) &&
              s.responseEnd>s.requestStart && s.end>s.start)) return {};
        if (Math.min(...submissions.map(s=>s.end)) <= Math.max(...submissions.map(s=>s.start))) return {};
        const winners = submissions.filter(s=>s.status>=200 && s.status<300);
        const winner = reviewers.find(r=>r.id===winners[0]?.actor);
        const loser = submissions.find(s=>[400,409,422].includes(s.status));
        const outcome = {
          singleSuccess:winners.length===1 && !!loser,
          reviewerFeedback:winners.length===1 && winners[0].badge===true && !!loser &&
            (loser.badge===true || /(?:already|previously|successfully) applied|applied by another/i.test(loser.alert??'')),
        };
        if (submissions.every(s=>typeof s.applyVisible==='boolean' && typeof s.badge==='boolean' && typeof s.alert==='string')) {
          outcome.liveControls=submissions.every(s=>s.badge && s.alert==='' && !s.applyVisible);
        }
        for (const phase of ['afterDecision','afterReload']) {
          const state=item[phase];
          if (!state) continue;
          outcome[phase+'.source']=state.source;
          outcome[phase+'.commit']=Array.isArray(state.parents) && equal(state.parents,[setup.seedCommit]) &&
            /^[a-f0-9]{40}$/u.test(state.head) && state.head!==setup.seedCommit && state.fileCommit===state.head;
          outcome[phase+'.credit']=winners.length===1 && state.message===winner.message;
          outcome[phase+'.review']=state.noteId===saved.id && state.body===saved.body &&
            equal(state.suggestions,[{id:suggestion.id,applied:true}]);
        }
        if (item.afterDecision?.head && item.afterReload?.head) outcome.stableHead=item.afterDecision.head===item.afterReload.head;
        if (item.reloadedReviewers?.length===2) outcome.bothReaders=item.reloadedReviewers.every((r,i)=>
          r.actor===reviewers[i].id && r.badge===true && r.canApply===false);
        return outcome;
      };
      const left=assess(original,a),right=assess(fountain,b);
      if (left.singleSuccess!==undefined && right.singleSuccess!==undefined) check(input.id+'.reviewers',a.reviewers,b.reviewers);
      const expectations=[
        ['singleSuccess','One confirmation succeeds and the competing request is refused',true],
        ['reviewerFeedback','Both reviewers see that the suggestion was applied',true],
        ['liveControls','Both live notes show Applied with no error or stale Apply control',true],
        ['stableHead','Branch head survives both reviewers reloading',true],
        ['bothReaders','Both reviewers reopen the Applied note without another Apply action',true],
      ];
      for (const [phase,when] of [['afterDecision','after both confirmations'],['afterReload','after both reloads']]) {
        expectations.push([phase+'.source','Complete file contains the change exactly once ('+when+')',input.expectedSource],
          [phase+'.commit','One direct commit on the seed branch ('+when+')',true],
          [phase+'.credit','Commit carries the successful reviewer’s message ('+when+')',true],
          [phase+'.review','Same note and suggestion retain Applied status ('+when+')',true]);
      }
      for (const [invariant,label,expected] of expectations) rows.push({case:input.id,invariant,label,expected,
        original:left[invariant],fountain:right[invariant],classification:null});
      continue;
    }
    if(input.scope==='stale-review' || input.scope==='relocated-review') {
      const originalBody = '```suggestion:-0+0\n' + input.source.split('\n')[input.range.start-1] + '\n' + fixture.appendLine + '```\n\n'+fixture.marker;
      const disabled = item => item.confirmationOffered===false && !item.applyResponse &&
        item.blockedAtControl?.buttonDisabled===true && item.blockedAtControl.confirmationHidden===true &&
        item.blockedAtControl.appliable===false && item.blockedAtControl.id===item.saved.suggestions[0].id;
      const valid = (report,item) => verifiedEditor(report,item) && item.status==='observed' &&
        item.readyToApply===true && item.saved?.suggestions?.length===1 && item.saved.suggestions[0].appliable===true &&
        Number.isSafeInteger(item.saved.suggestions[0].id) && item.saved.suggestions[0].id>0 &&
        (disabled(item) || (item.confirmationOffered===true && Number.isInteger(item.applyResponse?.status) &&
          item.applyResponse.path==='/api/v4/suggestions/'+item.saved.suggestions[0].id+'/apply')) &&
        /^[a-f0-9]{40}$/u.test(item.beforeApplyHead) && item.beforeApplyHead===item.setup?.seedCommit &&
        decoded(item.beforeApplyFile)===input.source && item.saved?.body===originalBody &&
        item.competingCommit!==item.beforeApplyHead && /^[a-f0-9]{40}$/u.test(item.competingCommit) &&
        item.verifiedCompetingSource===input.remoteSource;
      const paired = valid(original,a) && valid(fountain,b);
      const refused = item => disabled(item) || [400,409,422].includes(item.applyResponse.status);
      if (input.scope === 'relocated-review') {
        const accepted = item => item.applyResponse?.status >= 200 && item.applyResponse.status < 300;
        const rowsFor = item => {
          const applied = accepted(item);
          const rows = {};
          for (const phase of ['afterDecision','afterReload']) {
            const state = item[phase];
            if (!state || typeof state.source !== 'string' || !/^[a-f0-9]{40}$/u.test(state.head) ||
                !/^[a-f0-9]{40}$/u.test(state.fileCommit) || (applied && !Array.isArray(state.parents)) ||
                [state.sameNote,state.sameSuggestion,state.applied].some(value => typeof value !== 'boolean')) continue;
            rows[phase+'.source'] = state.source === (applied ? input.expectedAppliedSource : input.remoteSource);
            rows[phase+'.head'] = applied
              ? /^[a-f0-9]{40}$/u.test(state.head) && state.head !== item.competingCommit &&
                equal(state.parents,[item.competingCommit]) && state.fileCommit === state.head
              : refused(item) && state.head === item.competingCommit && state.fileCommit === state.head;
            rows[phase+'.review'] = state.sameNote === true && state.sameSuggestion === true && state.applied === applied;
          }
          if (item.afterDecision?.head && item.afterReload?.head) rows.stableCommit = item.afterDecision.head === item.afterReload.head;
          if (rows.stableCommit !== undefined && rows['afterDecision.source'] !== undefined && rows['afterReload.source'] !== undefined) {
            rows.appliedAtNewLocation = applied && rows.stableCommit &&
              ['afterDecision','afterReload'].every(phase => rows[phase+'.source'] && rows[phase+'.head'] && rows[phase+'.review']);
          }
          return rows;
        };
        const left = paired ? rowsFor(a) : {}, right = paired ? rowsFor(b) : {};
        const labels = {appliedAtNewLocation:'Apply succeeds on the relocated target',stableCommit:'Branch commit survives reload'};
        for (const [phase,when] of [['afterDecision','after Apply'],['afterReload','after reload']]) {
          labels[phase+'.source'] = 'Exact whole file, including the relocated line ('+when+')';
          labels[phase+'.head'] = 'Branch and file commit match the observed decision ('+when+')';
          labels[phase+'.review'] = 'Original note and suggestion identity retain the correct Applied state ('+when+')';
        }
        for (const [invariant,label] of Object.entries(labels)) rows.push({case:input.id,invariant,label,expected:true,
          original:left[invariant],fountain:right[invariant],classification:null});
        continue;
      }
      rows.push({case:input.id,invariant:'applyRefused',label:'GitLab prevents applying the stale suggestion',expected:true,
        original:paired?refused(a):undefined,fountain:paired?refused(b):undefined,classification:null});
      const visibleRefusal = item => {
        if (typeof item.appliedBadgeVisible!=='boolean' || !Array.isArray(item.alertText)) return undefined;
        const message = disabled(item) ? item.tooltip : item.alertText.join(' ');
        return refused(item) && !item.appliedBadgeVisible && typeof message==='string' && message.trim().length>0;
      };
      rows.push({case:input.id,invariant:'visibleRefusal',label:'Reviewer sees a refusal with no Applied badge',expected:true,
        original:paired?visibleRefusal(a):undefined,fountain:paired?visibleRefusal(b):undefined,classification:null});
      const explained = item => [...(item.alertText??[]),item.tooltip??''].some(text=>/line was changed in a more recent version/i.test(text));
      rows.push({case:input.id,invariant:'staleReason',label:'Feedback identifies the reviewed line as having changed',expected:true,
        original:paired?explained(a):undefined,fountain:paired?explained(b):undefined,classification:null});
      for (const phase of ['afterDecision','afterReload']) {
        for(const [key,expected] of Object.entries({source:input.remoteSource,sameHead:true,sameNote:true,applied:false,sameSuggestion:true})) {
          const labels = {source:'Newer source remains exact',sameHead:'No extra source commit',sameNote:'Posted review remains exact',applied:'Outdated review stays unapplied',sameSuggestion:'Suggestion identity survives'};
          rows.push({case:input.id,invariant:phase+'.'+key,label:labels[key]+' ('+(phase==='afterReload'?'after reload':'after review')+')',expected,
            original:paired?a[phase]?.[key]:undefined,fountain:paired?b[phase]?.[key]:undefined,classification:null});
        }
      }
      continue;
    }
    if (input.scope === 'simultaneous-issue') {
      const expectedSources = [input.localSuffix,input.remoteSuffix].map(s=>input.markdown.replace('Shared record.','Shared record.'+s));
      const outcome = (report,item) => {
        const calls = item?.submissions;
        if (!verifiedEditor(report,item) || !verifiedEditor(report,{editorProof:item.remoteEditorProof}) ||
          item.status!=='observed' || item.actor?.username!==fixture.username || item.actor.isAdmin!==false ||
          item.actor.id===item.onlineAuthorId || item.onlineAuthorId!==item.setup?.authorId || !item.permissionBefore ||
          item.membership?.accessLevel!==30 || item.membership.id!==item.actor.id || item.cleanupMembership?.accessLevel!==10 ||
          item.cleanupMembership.id!==item.actor.id || item.baselineBeforeSaves!==input.markdown ||
          !Array.isArray(calls) || calls.length!==2 || item.decisions?.length!==2 ||
          !calls.every((c,i)=>c.actor===[item.actor.id,item.onlineAuthorId][i] && c.description===expectedSources[i] &&
            Number.isInteger(c.status) && c.status>=200 && c.status<=599 && Array.isArray(c.errors) && (c.mutationReturned || c.errors.length>0) &&
            c.requestStart>=0 && c.responseEnd>=c.requestStart && Number.isFinite(c.start) && c.end>c.start &&
            item.decisions[i].actor===c.actor && Array.isArray(item.decisions[i].warnings)) ||
          Math.max(...calls.map(c=>c.start))>=Math.min(...calls.map(c=>c.end))) return {};
        const winners = calls.filter(c=>c.updateId===item.issueGid && c.errors.length===0);
        const saved = calls.findIndex(c=>c.description===item.persisted);
        const other = saved===-1 ? null : item.decisions[1-saved];
        const expectedReader = ['Shared record.'+[input.localSuffix,input.remoteSuffix][saved],'End marker.'];
        return {cleanResponse:calls.every(c=>c.status<500), oneAcknowledged:winners.length===1, savedAcknowledged:winners.some(c=>c.description===item.persisted),
          retained:other?.draftVisible===true, explained:other?.warnings.some(w=>/conflict|someone edited the description/i.test(w))===true,
          reloaded:item.afterReload===item.persisted && saved!==-1, reader:saved!==-1 && equal(item.reader,expectedReader)};
      };
      const stock=outcome(original,a), native=outcome(fountain,b);
      if(Object.keys(stock).length && Object.keys(native).length) check(input.id+'.actor',a.actor,b.actor);
      for (const [key,label] of [
        ['cleanResponse','Both ordinary Save requests finish without a server error'],
        ['oneAcknowledged','Only one competing replacement is acknowledged as saved'],
        ['savedAcknowledged','GitLab persists the exact draft of an acknowledged author'],
        ['retained','The other author can still see their unsaved draft'],
        ['explained','The other author sees a warning about the competing update'],
        ['reloaded','The stored issue remains exact after an independent reload'],
        ['reader','An independent reader sees the same saved description'],
      ]) rows.push({case:input.id,invariant:key,label,expected:true,original:stock[key],fountain:native[key],classification:null});
      continue;
    }
    if (input.scope === 'offline-conflict') {
      const local = input.markdown.replace('Shared record.','Shared record.' + input.localSuffix);
      const remote = input.markdown.replace('Shared record.','Shared record.' + input.remoteSuffix);
      const latest = input.lateSuffix ? remote.replace('Shared record.'+input.remoteSuffix,'Shared record.'+input.remoteSuffix+input.lateSuffix) : remote;
      const finalSuffix = input.resolution === 'overwrite' ? input.localSuffix : input.remoteSuffix + (input.lateSuffix ?? '');
      const valid = (report,item) => verifiedEditor(report,item) && verifiedEditor(report,{editorProof:item.remoteEditorProof}) &&
        item.status === 'observed' && item.permissionBefore === true && item.membership?.accessLevel === 30 &&
        item.cleanupMembership?.accessLevel === 10 && item.cleanupMembership.id === item.actor?.id && item.membership.id === item.actor?.id &&
        item.actor.username === fixture.username && item.actor.isAdmin === false && Number.isInteger(item.onlineAuthorId) &&
        item.onlineAuthorId === item.setup?.authorId && item.onlineAuthorId !== item.actor.id && item.wasOffline === true &&
        item.stillOffline === true && item.whileDisconnected === remote &&
        (!input.lateSuffix || (item.currentVersion === remote && item.lateServerVersion === latest)) && item.failedWrites?.some(f=>f.description===local && f.error==='net::ERR_INTERNET_DISCONNECTED');
      const paired = valid(original,a) && valid(fountain,b);
      if(paired)check(input.id+'.actor',a.actor,b.actor);
      if (input.lateSuffix) {
        for (const [key,label,expected] of [
          ['lateDisclosure','Open disclosure shows the newer saved version before resolution',latest],
          ['draftAfterLateSave','Author retains their own draft through the later write',true],
          ['serverBeforeLateDecision','Newest server edit survives until the author chooses',latest],
        ]) rows.push({case:input.id,invariant:key,label,expected,original:paired?a[key]:undefined,fountain:paired?b[key]:undefined,classification:null});
      }
      for(const [key,label,expected] of [
        ['afterFailedSave','Offline Save leaves the server baseline intact',input.markdown],
        ['beforeDecision','Second author’s saved version survives until explicit resolution',remote],
        ['conflictShown','Returning author sees a conflict',true],
        ['draftShown','Returning author can still see their own draft',true],
        ['currentVersion','Conflict disclosure contains the other author’s exact Markdown',remote],
        ['explicitDecision','Author explicitly resolves the conflict',true],
        ['afterDecision','Resolution persists the chosen Markdown',input.resolution==='overwrite'?local:latest],
        ['reader','Reload shows the chosen version',['Shared record.'+finalSuffix,'End marker.']],
        ['actorErrors','Browser exceptions',[]],
      ]) rows.push({case:input.id,invariant:key,label,expected,original:paired?a[key]:undefined,fountain:paired?b[key]:undefined,classification:null});
      continue;
    }
    if (input.scope === 'reconnect') {
      const edited = input.description + input.suffix;
      const valid = (report,item) => verifiedEditor(report,item) && item.status === 'observed' && item.offline === true &&
        item.failures?.some(failure => failure.description === edited && failure.error === 'net::ERR_INTERNET_DISCONNECTED');
      const paired = valid(original,a) && valid(fountain,b);
      for (const [key,label,expected] of [
        ['serverWhileOffline','Failed Save leaves the persisted description intact',input.description],
        ['saveWarning','Editor explains the failed Save',true],
        ['draftAfterFailure','Editor keeps the drafted paragraph after failure',[edited]],
        ['serverBeforeRetry','Reconnection leaves the saved description unchanged before retry',input.description],
        ['recoveredDraft','Retry uses the original draft without retyping',[edited]],
        ['afterRetry','GitLab stores the retried edit',edited],
        ['afterReload','Reload retains the edit on the server',edited],
        ['reader','Reopened issue shows the recovered text',edited],
        ['pageErrors','Browser exceptions',[]],
      ]) rows.push({case:input.id,invariant:key,label,expected,original:paired?a[key]:undefined,fountain:paired?b[key]:undefined,classification:null});
      continue;
    }
    if (input.scope === 'wiki-history') {
      const editedText = input.paragraph + input.addition;
      const editedSource = input.source.replace(input.paragraph,editedText);
      const evidence = (report,item) => {
        if (!verifiedEditor(report,item) || item.status !== 'observed') return {};
        const before = item.before ?? [], after = item.after ?? [], revisions = item.revisions ?? [];
        return {
          ...item,
          historyBefore: before.map(row => row.version),
          historyAfter: after.map(row => row.version),
          retainedHistory: after.length === 3 && before.length === 2 &&
            after.every(row => /^[a-f0-9]{40}$/.test(row.sha)) && new Set(after.map(row => row.sha)).size === 3 &&
            equal(after.slice(1),before),
          restoreMessage: after[0]?.message,
          cancelPreserved: typeof item.editedSource === 'string' && item.afterCancelSource === item.editedSource,
          revisionSources: revisions.length === 3 && equal(after.map(row => row.sha),revisions.map(rev => rev.sha)) &&
            equal(revisions.map(rev => rev.source),[item.restoredSource,item.editedSource,input.source]),
        };
      };
      const left = evidence(original,a), right = evidence(fountain,b);
      for (const [key,label,expected] of [
        ['initialSource','The seed wiki source matches the fixture byte for byte',input.source],
        ['typed','The author sees the edited paragraph before Save',editedText],
        ['editedReader','The reader shows the edit after reload',editedText],
        ['reopened','The rich editor reopens with the saved paragraph',editedText],
        ['editedSource','Persisted Markdown preserves the exact edit and untouched source',editedSource],
        ['historyBefore','History shows the edit and the seed as two revisions',['v2','v1']],
        ['oldReader','Viewing v1 shows the original paragraph',input.paragraph],
        ['cancelPreserved','Dismissing Restore keeps the edited source byte for byte',true],
        ['restoredSource','Restoring v1 recovers the original source byte for byte',input.source],
        ['restoredReader','The restored reader shows the original paragraph',input.paragraph],
        ['restoredOwner','The restored owner name retains its formatting',['Release team']],
        ['historyAfter','Restore adds a third revision',['v3','v2','v1']],
        ['retainedHistory','Restore keeps the two prior revision IDs and messages intact',true],
        ['restoreMessage','The newest revision records the supplied restore message',input.restoreMessage],
        ['revisionSources','Each of the three version IDs returns the exact bytes saved at that revision',true],
        ['pageErrors','No wiki browser exceptions',[]],
      ]) rows.push({case:input.id,invariant:key,label,expected,original:left[key],fountain:right[key],classification:null});
      continue;
    }
    if (input.scope === 'quick-save') {
      function controlled(report, item) {
        if (!verifiedEditor(report,item) || item.status !== 'observed' ||
            !matchesSaveGesture(item.gesture,input.key,input.expected,input.pace)) return {};
        return item;
      }
      const left = controlled(original,a), right = controlled(fountain,b);
      const paired = left.status === 'observed' && right.status === 'observed';
      for (const [key,label,expected] of [
        ['afterSubmit','Saved Markdown immediately after submit',input.expected],
        ['afterReload','Saved Markdown after reload',input.expected],
        ['reader','Text shown in the reloaded issue',input.expected],
        ['reopened','Paragraphs in the reopened editor',[input.expected]],
        ['pageErrors','Browser exceptions',[]],
      ]) rows.push({case:input.id,invariant:key,label,expected,original:paired ? left[key] : undefined,fountain:paired ? right[key] : undefined,classification:null});
      continue;
    }
    if(input.scope==='composers'){
      function facts(report, item) {
        if (!verifiedEditor(report, item) || !verifiedEditor(report, { editorProof: item?.commentEditorProof })) return {};
        return { ...item.facts, pageErrors: item.status === 'observed' ? item.pageErrors ?? [] : undefined };
      }
      const left = facts(original, a), right = facts(fountain, b);
      const edited=input.description+input.suffix, notes=['**'+input.comment+'**'];
      if (original.restartRequested || fountain.restartRequested) {
        const recovered = (report, observation) => {
          const record = report.restart?.records?.find(entry => entry.id === input.id && entry.iid === observation?.iid);
          if (record) return { description: record.description, notes: record.notes, readerDescription: record.readerDescription, readerBold: record.readerBold };
        };
        rows.push({ case: input.id, invariant: 'afterRestart', label: 'Same saved description and bold comment in the API and a fresh browser after GitLab restarts',
          expected: { description: edited, notes, readerDescription: edited, readerBold: [input.comment] },
          original: recovered(original, a), fountain: recovered(fountain, b), classification: null });
      }
      const commentFirst=input.firstSave==='comment';
      const expected={boldComment:[input.comment],plainDescription:[],commentUndo:[''],descriptionAfterCommentUndo:[edited],
        commentRedo:[input.comment],descriptionUndo:[input.description],commentAfterDescriptionUndo:[input.comment],descriptionRedo:[edited],
        italicDescription:[edited],commentAfterDescriptionFormat:{bold:[input.comment],italic:[]},
        descriptionAfterFormatUndo:{paragraphs:[edited],italic:[]},descriptionSource:edited,otherRichStillOpen:true,commentAfterModeSwitch:[input.comment],
        initialServer:{description:input.description,notes:[]},
        afterFirstSave:commentFirst?{description:input.description,notes}:{description:edited,notes:[]},
        pendingDraft:[commentFirst?edited:input.comment],commentCleared:[''],afterSave:{description:edited,notes},
        reopenedDescription:edited,reopenedComment:[input.comment],pageErrors:[]};
      const labels = {
        boldComment: 'Bold applies to the comment', plainDescription: 'Description stays plain',
        commentUndo: 'Undo clears the comment text', descriptionAfterCommentUndo: 'Comment undo preserves the description draft',
        descriptionUndo: 'Undo in the description restores its original paragraph', commentAfterDescriptionUndo: 'The formatted comment survives description undo',
        descriptionRedo: 'Redo restores the description edit', italicDescription: 'The description toolbar italicizes its selection',
        commentAfterDescriptionFormat: 'The description toolbar leaves the comment bold and upright',
        descriptionAfterFormatUndo: 'Undo removes just the description formatting',
        commentRedo: 'Redo restores the comment text', descriptionSource: 'Source mode shows the edited description',
        otherRichStillOpen: 'The comment editor stays open in rich mode', commentAfterModeSwitch: 'Switching description modes preserves the comment draft',
        initialServer: 'Both drafts stay local before saving', afterFirstSave: 'Only the submitted record reaches GitLab',
        pendingDraft: 'The other editor retains its draft', commentCleared: 'Posting clears the comment composer',
        afterSave: 'GitLab stores both records independently', reopenedDescription: 'Reload shows the saved description',
        reopenedComment: 'Reload shows the bold comment', pageErrors: 'The completed workflow raises no browser exceptions',
      };
      for (const [key, value] of Object.entries(expected)) {
        rows.push({ case: input.id, invariant: key, label: labels[key], expected: value,
          original: left[key], fountain: right[key], classification: null });
      }
      continue;
    }
    if(input.scope==='access'){
      const valid=item=>item?.actor?.username===fixture.username&&item.actor.isAdmin===false&&Number.isInteger(item.actor.id)&&Number.isInteger(item.setup?.authorId)&&item.actor.id!==item.setup.authorId&&item.membership?.id===item.actor.id;
      const left=valid(a)?a:undefined,right=valid(b)?b:undefined;
      if(left&&right)check(input.id+'.actor',left.actor,right.actor);
      const add=(key,label,expected,x,y)=>rows.push({case:input.id,invariant:key,label,expected,original:x,fountain:y,classification:null});
      add('member.role','Initial project membership is the declared role',input.initialAccessLevel,left?.membership?.accessLevel,right?.membership?.accessLevel);
      add('reader.initial','Non-author member can read intact content',input.expectedGraph,left?.graphs?.initial,right?.graphs?.initial);
      add('cleanup.role','Task-owned account ends with Guest access',10,left?.cleanupMembership?.accessLevel,right?.cleanupMembership?.accessLevel);
      if(input.kind==='guest'){
        add('permission.update','Guest has no update permission on this root-authored record',false,left?.permissionBefore,right?.permissionBefore);
        for(const key of ['editControlAbsent','editableRootsAbsent','writeDenied','serverUnchanged','anonymousContentAbsent','anonymousEditAbsent','anonymousAPIDenied'])add(key,key,true,left?.[key],right?.[key]);
        add('reader.reloaded','Denied update leaves the reloaded document intact',input.expectedGraph,left?.graphs?.reloaded,right?.graphs?.reloaded);
      }else{
        const nativeLeft=verifiedEditor(original,left)?left:undefined,nativeRight=verifiedEditor(fountain,right)?right:undefined;
        add('permission.initial','Developer starts with update authority',true,left?.permissionBefore,right?.permissionBefore);
        if(input.revocationMode==='remove-membership'){
          const fact=(item,key)=>{
            if(!item)return undefined;
            const before=item.accessBeforeRemoval,after=item.accessAfterRemoval;
            if(key==='membership')return Array.isArray(item.membersAfterRemoval)?!item.membersAfterRemoval.some(member=>member.id===item.actor.id):undefined;
            if(key==='positive')return before?before.restJSON===true&&before.graphqlEnvelope===true&&before.restStatus===200&&before.graphqlStatus===200&&before.graphqlErrors?.length===0&&before.restDescription===item.confirmedSource&&before.graphqlDescription===item.confirmedSource&&typeof item.confirmedSource==='string':undefined;
            if(key==='rest')return after?after.restJSON===true&&[403,404].includes(after.restStatus)&&after.restDescription===null:undefined;
            if(key==='graphql')return after?after.graphqlEnvelope===true&&after.graphqlStatus===200&&after.itemPresent===false&&after.graphqlDescription===null:undefined;
            if(key==='session')return item.sessionAfterRemoval?item.sessionAfterRemoval.id===item.actor.id&&item.sessionAfterRemoval.username===item.actor.username:undefined;
            if(key==='write')return item.removedRESTWriteStatus===undefined?undefined:[403,404].includes(item.removedRESTWriteStatus);
            if(key==='unchanged')return item.afterRESTProbe&&typeof item.confirmedSaved?.description==='string'?item.afterRESTProbe.description===item.confirmedSaved.description:undefined;
            if(key==='render')return item.deniedInspection&&Number.isInteger(item.deniedInspection.loadingCount)&&Array.isArray(item.errorAlertsAfterInspection)?item.deniedInspection.loadingCount===0&&item.deniedInspection.richVisible===true&&item.deniedInspection.errorCode===null&&!item.errorAlertsAfterInspection.some(text=>/render.*(?:rich text|Markdown)/i.test(text)):undefined;
            return Array.isArray(item.errorAlerts)?!item.errorAlerts.some(text=>text.includes('Someone edited the description at the same time you did.')):undefined;
          };
          for(const [key,label]of [['membership','Task membership is fully removed'],['positive','REST and GraphQL description reads work before removal'],['rest','Removed actor cannot read private source through REST'],['graphql','Removed actor cannot read private work item through GraphQL'],['session','Denial preserves the same authenticated actor'],['write','Removed actor cannot write through REST'],['unchanged','Denied REST probe leaves persisted source unchanged'],['feedback','Denied Save does not report a false edit conflict'],['render','Returning from source inspection does not leave a render error']])add('removal.'+key,label,true,fact(nativeLeft,key),fact(nativeRight,key));
        }else add('permission.revoked','Downgrade revokes update authority',false,left?.permissionRevoked,right?.permissionRevoked);
        if(input.revocationMode==='remove-membership'){
          for(const key of ['retainedSource','recoveredSource','finalReopenedSource']){const retained=item=>item&&typeof item.pendingSource==='string'&&Object.hasOwn(item,key)?item[key]===item.pendingSource:undefined;add('removal.source.'+key,'Exact pending source at '+key,true,retained(nativeLeft),retained(nativeRight));}
          for(const key of ['deniedBeforeInspection','deniedAfterInspection']){const graph=item=>{const value=item?.graphs?.[key];return input.pendingMode==='empty'&&Array.isArray(value?.prose)?{...value,prose:value.prose.filter(text=>text!=='')}:value;};add('removal.graph.'+key,'Pending rich document remains visible at '+key,input.expectedPending,graph(nativeLeft),graph(nativeRight));}
          if(input.pendingMode==='empty'){
            add('removal.empty.intent','The author actually clears the draft','',nativeLeft?.pendingSource,nativeRight?.pendingSource);
            const stored=item=>item?.finalSaved&&Object.hasOwn(item.finalSaved,'description')?input.allowedEmptyStoredValues.includes(item.finalSaved.description):undefined;
            add('removal.empty.stored','Empty intent survives host null/empty persistence',true,stored(nativeLeft),stored(nativeRight));
          }
        }
        add('permission.restored','Restoring Developer grants update authority again',true,left?.permissionRestored,right?.permissionRestored);
        for(const key of ['initialWriteSucceeded','draftStayedLocal','revokedWriteBlocked','deniedSaveReported','draftRetainedAfterDenial','draftRecoveredAfterReload',input.pendingMode==='empty'?'finalEmptyStored':'finalSourceExact','finalReopenExact'])add(key,key,true,nativeLeft?.[key],nativeRight?.[key]);
        for(const [key,expected]of [['confirmed',input.expectedConfirmed],['recovered',input.expectedPending],['final',input.expectedPending]]){const graph=item=>{const value=item?.graphs?.[key];return input.pendingMode==='empty'&&key!=='confirmed'&&Array.isArray(value?.prose)?{...value,prose:value.prose.filter(text=>text!=='')}:value;};add('graph.'+key,key+': content, marks, link and code are intact',expected,graph(nativeLeft),graph(nativeRight));}
      }
      add('actor.errors','Authenticated task member has no browser errors',[],left?.actorErrors,right?.actorErrors);
      continue;
    }
    if(input.scope==='conflict'){
      const valid=(report,item)=>verifiedEditor(report,item)&&verifiedEditor(report,{editorProof:item?.remoteEditorProof});
      const left=valid(original,a)?a:undefined,right=valid(fountain,b)?b:undefined;
      const add=(key,label,expected,x,y)=>rows.push({case:input.id,invariant:key,label,expected,original:x,fountain:y,classification:null});
      for(const [key,expected]of [['initial',input.expectedInitial],['remoteInitial',input.expectedInitial],['local',input.expectedLocal],['remoteSaved',input.expectedRemote],['resolved',input.expectedResolved],['final',input.expectedFinal]])
        add('graph.'+key,key+': content, marks, links and code stay intact',expected,left?.graphs?.[key],right?.graphs?.[key]);
      for(const key of ['independentContexts','noAutomaticOverwrite','localDraftRetained','conflictObserved','conflictSourceExact','conflictSourceReadonly','resolutionSourceExact','freshWarningAbsent','freshSourceMatchesServer','normalSaveReachable','finalSourceMatchesServer'])
        add(key,key,true,left?.[key],right?.[key]);
      if(input.resolution==='overwrite')add('explicitOverwrite','Overwriting requires the named overwrite action',true,left?.explicitOverwrite,right?.explicitOverwrite);
      add('remoteErrors','Second session has no browser errors',[],left?.remoteErrors??(left?[]:undefined),right?.remoteErrors??(right?[]:undefined));
      continue;
    }
    if(input.scope==='task-conversion'){
      const left=verifiedEditor(original,a)?a:undefined,right=verifiedEditor(fountain,b)?b:undefined;
      const add=(key,label,expected,x,y)=>rows.push({case:input.id,invariant:key,label,expected,original:x,fountain:y,classification:null});
      for(const phase of ['before','readerBefore'])add(phase+'.code',phase+': code indentation is intact before conversion',[input.expectedCode],left?.graphs?.[phase]?.codes,right?.graphs?.[phase]?.codes);
      add('modal.title','Real creation dialog has the intended title',input.childTitle,left?.modalTitle,right?.modalTitle);
      add('modal.code','Untouched creation prefill preserves code indentation',[input.expectedCode],left?.graphs?.prefill?.codes,right?.graphs?.prefill?.codes);
      add('modal.editor','Creation dialog uses the verified editor',true,left?.modalEditorProof?verifiedEditor(original,{editorProof:left.modalEditorProof}):undefined,right?.modalEditorProof?verifiedEditor(fountain,{editorProof:right.modalEditorProof}):undefined);
      for(const [key,expected]of [['title',input.childTitle],['type','Task']])add('child.'+key,'Created child '+key,expected,left?.child?.[key],right?.child?.[key]);
      add('child.description','Saved child preserves exact description source',input.expectedDescription,conversionDescription(left?.child?.description),conversionDescription(right?.child?.description));
      add('child.parent','Created child is actually linked to the original parent',true,left?.child?.parentIid!==undefined?String(left.child.parentIid)===String(left.setup?.iid):undefined,right?.child?.parentIid!==undefined?String(right.child.parentIid)===String(right.setup?.iid):undefined);
      add('parent.graph','Reloaded parent retains nested checklist, siblings and prose',input.expectedParent,left?.graphs?.parentReopened,right?.graphs?.parentReopened);
      add('parent.counts','Backend parent retains the intended remaining task counts',{count:input.expectedParent.tasks.length,completed_count:input.expectedParent.tasks.filter(task=>task.state==='completed').length},left?.parentAfter?.task_completion_status,right?.parentAfter?.task_completion_status);
      add('parent.state','Conversion leaves parent Open','opened',left?.parentAfter?.state,right?.parentAfter?.state);
      add('child.editor','Child reopens in the verified editor',true,left?.childEditorProof?verifiedEditor(original,{editorProof:left.childEditorProof}):undefined,right?.childEditorProof?verifiedEditor(fountain,{editorProof:right.childEditorProof}):undefined);
      add('child.code','Reopened child preserves executable code indentation',[input.expectedCode],left?.graphs?.childReopened?.codes,right?.graphs?.childReopened?.codes);
      add('child.bold','Reopened child retains bold detail',['bold'],left?.graphs?.childReopened?.bold,right?.graphs?.childReopened?.bold);
      add('child.link','Reopened child retains its link',[{text:'link',href:'https://example.com/reference'}],left?.graphs?.childReopened?.links,right?.graphs?.childReopened?.links);
      if(input.trackQuotes){
        const ownership=graph=>graph&&Number.isInteger(graph.quoteBlockCount)&&Array.isArray(graph.taskQuoteDepths)?{quoteBlockCount:graph.quoteBlockCount,taskQuoteDepths:graph.taskQuoteDepths}:undefined;
        for(const phase of ['before','readerBefore'])add(phase+'.quotes',phase+': real outer quote ownership',input.expectedInitialQuotes,ownership(left?.graphs?.[phase]),ownership(right?.graphs?.[phase]));
        const nested=input.expectedParent.tasks.map(task=>task.depth);const target=input.targetOrdinal??1;const depth=nested[target];nested[target]=depth+1;nested.splice(target,0,depth);
        for(const phase of ['before','readerBefore'])add(phase+'.nesting',phase+': original list nesting survives import and Save',nested,left?.graphs?.[phase]?.tasks?.map(task=>task.depth),right?.graphs?.[phase]?.tasks?.map(task=>task.depth));
        for(const phase of ['prefill','childReopened'])add(phase+'.quotes',phase+': child source excludes parent-only quote wrappers',0,left?.graphs?.[phase]?.quoteBlockCount,right?.graphs?.[phase]?.quoteBlockCount);
      }
      if(input.verifyParentResave){
        add('parent.resaved','Typing, Save and reload retain the parent structure',input.expectedParentResaved,left?.graphs?.parentResaved,right?.graphs?.parentResaved);
        add('parent.resaveReachable','Normal Save remains reachable after parent reopen',true,left?.parentResaveReachable,right?.parentResaveReachable);
        add('parent.resaveState','Resaved parent remains Open','opened',left?.parentResaved?.state,right?.parentResaved?.state);
        add('parent.resaveCounts','Resaved backend checklist counts remain correct',{count:input.expectedParent.tasks.length,completed_count:input.expectedParent.tasks.filter(task=>task.state==='completed').length},left?.parentResaved?.task_completion_status,right?.parentResaved?.task_completion_status);
      }

      continue;
    }
    if(input.scope==='task-menu'){
      const left=verifiedEditor(original,a)?a:undefined,right=verifiedEditor(fountain,b)?b:undefined;
      const add=(key,label,expected,x,y)=>rows.push({case:input.id,invariant:key,label,expected,original:x,fountain:y,classification:null});
      for(const [phase,expected]of Object.entries(input.expectedGraphs))add(phase+'.graph',phase+': task state/nesting, prose and authored formatting',expected,left?.graphs?.[phase],right?.graphs?.[phase]);
      for(const phase of ['disabled','restored','deleted']){
        add(phase+'.target','Reader menu acts on the nested duplicate: '+phase,{text:input.target.text,depth:input.target.depth},left?.[phase]?.target?{text:left[phase].target.text,depth:left[phase].target.depth}:undefined,right?.[phase]?.target?{text:right[phase].target.text,depth:right[phase].target.depth}:undefined);
        add(phase+'.source','Only the intended source marker/line changes: '+phase,true,left?.[phase]?.sourceDeltaExact,right?.[phase]?.sourceDeltaExact);
        add(phase+'.state','Issue remains open after '+phase,'opened',left?.[phase]?.after?.state,right?.[phase]?.after?.state);
      }
      for(const phase of ['saved','retained']){add(phase+'.reachable','Normal Save remains reachable: '+phase,true,left?.[phase+'Reachable'],right?.[phase+'Reachable']);add(phase+'.state','Issue remains open after '+phase,'opened',left?.[phase]?.state,right?.[phase]?.state);}
      add('third-state.source','Unrelated rich editing preserves the not-applicable source marker',true,left?.thirdStateSourceRetained,right?.thirdStateSourceRetained);
      for(const [phase,count]of [['disabled',3],['restored',4],['deleted',3]])add(phase+'.counts','Persisted task counts after '+phase,{count,completed_count:1},left?.[phase]?.after?.task_completion_status,right?.[phase]?.after?.task_completion_status);
      continue;
    }
    if(input.scope==='task-recovery'){
      const left=verifiedEditor(original,a)?a:undefined,right=verifiedEditor(fountain,b)?b:undefined;
      const add=(key,label,expected,x,y)=>rows.push({case:input.id,invariant:key,label,expected,original:x,fountain:y,classification:null});
      for(const [phase,expected]of Object.entries(input.expectedGraphs))add(phase+'.graph',phase+': exact task text/state/nesting, marks and prose',expected,left?.graphs?.[phase],right?.graphs?.[phase]);
      add('delete.selection','Actual populated-task text selected before deletion','Remove this task',left?.selectedTaskText,right?.selectedTaskText);
      add('paragraph.selection','Actual intended command paragraph selected','Write literal here.',left?.selectedParagraph,right?.selectedParagraph);
      for(const phase of ['saved','toggledSaved','readerAfter'])add(phase+'.state','Host issue state after '+phase,input.expectedState,left?.[phase]?.state,right?.[phase]?.state);
      for(const [phase,graph]of [['saved','reopened'],['toggledSaved','toggleRedo'],['readerAfter','readerReopened']]){const tasks=input.expectedGraphs[graph].tasks;add(phase+'.tasks','Backend task counts after '+phase,{count:tasks.length,completed_count:tasks.filter(task=>task.checked).length},left?.[phase]?.task_completion_status,right?.[phase]?.task_completion_status);}
      for(const phase of ['saved','toggledSaved'])add(phase+'.reachable','Normal Save is reachable: '+phase,true,left?.[phase+'Reachable'],right?.[phase+'Reachable']);
      for(const key of ['visible','enabled'])add('reopenedCheckbox.'+key,'Reopened editor checkbox is '+key,true,left?.reopenedCheckbox?.[key],right?.reopenedCheckbox?.[key]);
      for(const key of ['visible','enabled'])add('readerCheckbox.'+key,'Reader checkbox is '+key,true,left?.readerCheckbox?.[key],right?.readerCheckbox?.[key]);
      add('reader.persisted','Real reader checkbox updates the persisted task counts',true,left?.readerPersisted,right?.readerPersisted);
      continue;
    }
    if(input.scope==='tasks'){
      const left=verifiedEditor(original,a)?a:undefined,right=verifiedEditor(fountain,b)?b:undefined;
      const add=(key,label,expected,x,y)=>rows.push({case:input.id,invariant:key,label,expected,original:x,fountain:y,classification:null});
      for(const [phase,expected]of Object.entries(input.expectedGraphs))add(phase+'.graph',phase+': task text, completion, nesting, prose and marks',expected,left?.graphs?.[phase],right?.graphs?.[phase]);
      for(const phase of ['initial','reopened'])add('documentReady.'+phase,phase+': document heading loaded before task outcome inspection',true,left?.documentReady?.[phase],right?.documentReady?.[phase]);
      if(input.requireCaretReady)add('beforeEnter.caret','Settled caret before Enter is at the last task end',true,left?.beforeEnter?equal(left.beforeEnter,{inside:true,activeInside:true,collapsed:true,text:'Share draft',offset:11}):undefined,right?.beforeEnter?equal(right.beforeEnter,{inside:true,activeInside:true,collapsed:true,text:'Share draft',offset:11}):undefined);
      add('newEmpty.visible','Enter creates a physically visible separate empty task row',true,left?.emptyTaskLayout?.visible,right?.emptyTaskLayout?.visible);
      for(const [key,expected]of [['inside',true],['activeInside',true],['collapsed',true],['text',''],['offset',0]])add('newEmpty.caret.'+key,'New empty task caret: '+key,expected,left?.emptyCaret?.[key],right?.emptyCaret?.[key]);
      add('exit.caret','Explicit empty-task Enter exits to a focused plain paragraph',{inside:true,activeInside:true,collapsed:true,text:'',offset:0,inTask:false},left?.exitCaret,right?.exitCaret);
      add('remove.selection','Actual selected task text before deletion','Follow up',left?.selectedForRemoval,right?.selectedForRemoval);
      add('saveButtonReachable','Save remains directly reachable after task editing',true,left?.saveButtonReachable,right?.saveButtonReachable);
      continue;
    }
    if(input.scope==='grid'){
      const left=verifiedEditor(original,a)?a:undefined,right=verifiedEditor(fountain,b)?b:undefined;
      const add=(key,label,expected,x,y)=>rows.push({case:input.id,invariant:key,label,expected,original:x,fountain:y,classification:null});
      for(const [phase,expected]of [['initial',input.initialGraph],['cut',input.cutGraph],['cutUndo',input.initialGraph],['pasted',input.pastedGraph],['pasteUndo',input.initialGraph],['pasteRedo',input.pastedGraph],['reopened',input.pastedGraph]])add(phase+'.graph',phase+': exact table geometry, cell roles, paragraphs, marks, links and surrounding prose',expected,left?.[phase],right?.[phase]);
      for(const phase of ['copySelection','cutSelection'])add(phase+'.cells','Actual '+phase+' covers exactly the requested rectangle',input.selectedCells,left?.[phase]?.cells,right?.[phase]?.cells);
      if(input.paintControl)for(const phase of ['copySelection','cutSelection'])add(phase+'.outsidePaint','Unselected control cell keeps identical pixels during '+phase,true,left?.[phase]?.outsidePaintUnchanged,right?.[phase]?.outsidePaintUnchanged);
      for(const phase of ['initial','reopened'])add('documentReady.'+phase,phase+': document and both tables are loaded',true,left?.documentReady?.[phase],right?.documentReady?.[phase]);
      add('clipboard.text','Cell copy supplies exact TSV boundaries',input.plain,left?.clipboard?.text,right?.clipboard?.text);
      add('clipboard.html','Cell copy supplies actual rich HTML',true,left?.clipboard?typeof left.clipboard.html==='string'&&left.clipboard.html.length>0:undefined,right?.clipboard?typeof right.clipboard.html==='string'&&right.clipboard.html.length>0:undefined);
      add('cutClipboardText','Cell cut supplies exact TSV boundaries',input.plain,left?.cutClipboardText,right?.cutClipboardText);
      add('beforePasteClipboardText','Cell paste retains the copied payload',input.plain,left?.beforePasteClipboardText,right?.beforePasteClipboardText);
      add('externalRich','Actual external rich paste preserves body-cell roles and semantics',input.externalGraph,left?.externalRich,right?.externalRich);
      add('externalPlain','Actual external plain paste preserves TSV',input.plain,left?.externalPlain,right?.externalPlain);
      add('destinationReady','Paste begins with a verified caret in the target cell',true,left?.destinationReady,right?.destinationReady);
      add('saveButtonReachable','Save remains directly reachable after table paste',true,left?.saveButtonReachable,right?.saveButtonReachable);
      continue;
    }
    if(input.scope==='partial'){
      const add=(key,label,expected,left,right)=>rows.push({case:input.id,invariant:key,label,expected,original:left,fountain:right,classification:null});
      const left=verifiedEditor(original,a)?a:undefined,right=verifiedEditor(fountain,b)?b:undefined;
      for(const [phase,expected]of [['initial',input.initialGraph],['cut',input.cutGraph],['cutUndo',input.initialGraph],['pasted',input.pastedGraph],['pasteUndo',input.initialGraph],['pasteRedo',input.pastedGraph],['reopened',input.pastedGraph]]){
        const primary=['headings','prose','bold','links'];
        // A zero-character emphasis wrapper represents no marked content.
        // Keep all nonempty strings, including invisible Unicode characters.
        const content=(item,key)=>{const value=item?.[phase]?.[key];return key==='bold'&&Array.isArray(value)?value.filter(text=>text!==''):value;};
        for(const key of primary)if(Object.hasOwn(expected,key))add(phase+'.'+key,phase+': '+key,expected[key],content(left,key),content(right,key));
        const others=Object.keys(expected).filter(key=>!primary.includes(key));
        if(others.length){
          const extra=item=>item?.[phase]?Object.fromEntries(others.map(key=>[key,item[phase][key]])):undefined;
          add(phase+'.otherStructure',phase+': no unintended other structure',Object.fromEntries(others.map(key=>[key,expected[key]])),extra(left),extra(right));
        }
      }
      const selected=item=>item?{text:item.text,direction:item.direction,inside:item.inside,activeInside:item.activeInside,collapsed:item.collapsed}:undefined;
      for(const phase of ['copySelection','cutSelection'])add(phase,'Actual '+phase+' retains intended text and direction',{text:input.selectedText,direction:input.direction,inside:true,activeInside:true,collapsed:false},selected(left?.[phase]),selected(right?.[phase]));
      if(input.requireWrappedSelection){
        const wrapped=state=>state?.wrap ? state.wrap.lineHeight>0 && state.wrap.endY-state.wrap.startY>=state.wrap.lineHeight*0.9 : undefined;
        for(const phase of ['copySelection','cutSelection'])add(phase+'.wrapped','Selection spans separate visual lines of one paragraph',true,wrapped(left?.[phase]),wrapped(right?.[phase]));
      }
      if(input.requireCaretReady)for(const phase of ['copySelection','cutSelection'])add(phase+'.caretReady','Keyboard '+phase+' begins at a verified focused paragraph boundary',true,left?.[phase]?.caretReady,right?.[phase]?.caretReady);
      for(const [key,value]of Object.entries(input.fragment))add('externalFragment.'+key,'External selected fragment: '+key,value,left?.externalFragment?.[key],right?.externalFragment?.[key]);
      const plain=value=>input.clipboardParagraphs?clipboardParagraphs(value):value,expectedPlain=input.clipboardParagraphs??input.selectedText;
      add('clipboard.text','Copied plain text retains the selected content and paragraph boundaries',expectedPlain,plain(left?.clipboard?.text),plain(right?.clipboard?.text));
      if(input.clipboardParagraphs)add('externalPlain.paragraphs','Actual external plain paste retains both nonempty paragraphs',expectedPlain,plain(left?.externalPlain),plain(right?.externalPlain));
      if(input.verifySaveAccess)add('saveButtonReachable','Save button remains directly reachable after pasted-link history',true,left?.saveButtonReachable,right?.saveButtonReachable);
      const html=item=>item?.clipboard?typeof item.clipboard.html==='string'&&item.clipboard.html.length>0:undefined;
      add('clipboard.html','Selected fragment supplies actual HTML payload',true,html(left),html(right));
      add('cutClipboardText','Cut clipboard retains exactly the selected fragment',expectedPlain,plain(left?.cutClipboardText),plain(right?.cutClipboardText));
      add('beforePasteClipboardText','Paste clipboard retains exactly the selected fragment',expectedPlain,plain(left?.beforePasteClipboardText),plain(right?.beforePasteClipboardText));
      const ready=item=>{const state=item?.pasteSelection;return state===undefined?undefined:state.collapsed===true&&state.inside===true&&state.activeInside===true&&state.anchorText===''&&state.anchorOffset===0;};
      add('pasteCaretReady','Paste begins at verified focused empty paragraph',true,ready(left),ready(right));
      for(const phase of ['initial','reopened'])add('documentReady.'+phase,phase+': document loaded before snapshot',true,left?.documentReady?.[phase],right?.documentReady?.[phase]);
      continue;
    }
    if(input.scope==='clipboard'){
      const add=(key,label,expected,left,right)=>rows.push({case:input.id,invariant:key,label,expected,original:left,fountain:right,classification:null});
      const provenLeft=verifiedEditor(original,a)?a:undefined,provenRight=verifiedEditor(fountain,b)?b:undefined;
      const doubled=Object.fromEntries(Object.entries(input.expectedGraph).map(([key,value])=>[key,[...value,...value]]));
      const empty=Object.fromEntries(Object.keys(input.expectedGraph).map(key=>[key,[]]));
      for(const [phase,expected]of [['initial',input.expectedGraph],['externalRich',input.expectedGraph],['pasted',doubled],['undo',input.expectedGraph],['redo',doubled],['cut',empty],['afterCutPaste',doubled],['reopened',doubled]]){
        for(const [key,value]of Object.entries(expected)){
          // Generic contenteditable is not a task-widget implementation. Its
          // ordinary rich semantics are checked; task state is checked internally.
          if(phase==='externalRich'&&key==='tasks')continue;
          add(phase+'.'+key,phase+': '+key,value,provenLeft?.[phase]?.[key],provenRight?.[phase]?.[key]);
        }
      }
      const tokens=item=>typeof item?.clipboard?.text==='string'?input.plainTokens.map(token=>item.clipboard.text.includes(token)):undefined;
      const html=item=>item?.clipboard?typeof item.clipboard.html==='string'&&item.clipboard.html.length>0:undefined;
      const externalPlain=item=>typeof item?.externalPlain==='string'&&typeof item?.clipboard?.text==='string'?item.externalPlain===item.clipboard.text:undefined;
      add('clipboard.plainTokens','Copied plain text retains every declared token',input.plainTokens.map(()=>true),tokens(provenLeft),tokens(provenRight));
      add('clipboard.html','Copy supplies an actual rich HTML clipboard payload',true,html(provenLeft),html(provenRight));
      add('externalPlain','External text paste equals the actual copied plain payload',true,externalPlain(provenLeft),externalPlain(provenRight));
      const ready=item=>{const state=item?.appendSelection?.readyForPaste;return state===undefined?undefined:state.collapsed===true&&state.inside===true&&state.activeInside===true&&state.anchorText===''&&state.anchorOffset===0;};
      const unchanged=item=>typeof item?.appendClipboardText==='string'&&typeof item?.clipboard?.text==='string'?item.appendClipboardText===item.clipboard.text:undefined;
      add('appendCaretReady','Append begins with a verified caret in the intended empty paragraph',true,ready(provenLeft),ready(provenRight));
      add('appendClipboardUnchanged','Append clipboard still contains the original copied payload',true,unchanged(provenLeft),unchanged(provenRight));
      continue;
    }
    const lines=input.source.split('\n'),selected=lines.slice(input.range.start-1,input.range.end).join('\n'),source=selected+'\n',replacement=source+fixture.appendLine;
    const prefix=lines.slice(0,input.range.start-1),expectedFile=(prefix.length?prefix.join('\n')+'\n':'')+replacement+lines.slice(input.range.end).join('\n');
    const left=observedValues(original,a,input,fixture,expectedFile),right=observedValues(fountain,b,input,fixture,expectedFile);
    const deletion=input.scope==='deletion';
    // A nonempty fenced line must end before the closing fence. The rich input
    // still has its own exact character check below, independent of Markdown.
    const editedSource=deletion && input.replacement && !input.replacement.endsWith('\n')
      ? input.replacement+'\n' : deletion ? input.replacement : source;
    const specs=[['prefill','Selected source characters',selected],['firstSource','Source at first visible Markdown field',editedSource],
      ['settledSource','Source after declared observation window',editedSource],['range','Selected target offsets',`-${input.range.end-input.range.start}+0`]];
    const review=input.scope==='review';
    if(review){
      const range=input.editedRange,params=`-${input.range.end-range.start}+${range.end-input.range.end}`;
      const before={source:input.replacement,range:input.range},after={source:input.replacement,range};
      const remaining=lines.slice(0,range.start-1).join('\n');
      const applied=(remaining?remaining+'\n':'')+input.replacement+lines.slice(range.end).join('\n');
      specs.push(['savedSource','Initial posted proposal retains original source',source],['savedRange','Initial posted proposal retains target offsets',`-${input.range.end-input.range.start}+0`],
        ['reviewInitial','Posted proposal reopens with exact source and range',{source,range:input.range}],
        ['reviewBeforeRange','Editing source retains the original target range',before],['reviewAfterRange','Changing the range retains edited source',after],
        ['reviewUndo','Undoing range adjustment restores prior range and preserves edited source',before],['reviewRedo','Redoing range adjustment restores the selected range and edited source',after],
        ['reviewDraftSource','Source-mode handoff retains reviewed source',input.replacement],['reviewDraftRange','Source-mode handoff retains reviewed offsets',params],
        ['reviewSavedBody','Saving review changes only the intended source and range','```suggestion:'+params+'\n'+input.replacement+'```\n\n'+fixture.marker],
        ['reviewReopenedSource','Reloading reviewed rich proposal retains source',input.replacement],['reviewReopenedRange','Reloading reviewed rich proposal retains offsets',params],
        ['beforeApplySource','Posted review does not write repository contents',input.source],['noEarlyCommit','Posted review does not create a source commit',true],
        ['appliedSource','Applying reviewed proposal changes exactly the reviewed target',applied],['singleApplyCommit','Application creates one child of the seed commit',true],
        ['appliedFlagAtCommit','Reviewed application has Applied metadata immediately after commit',true]);
    }
    if(deletion){
      const remaining=[...lines.slice(0,input.range.start-1),...lines.slice(input.range.end)].join('\n');
      specs.push(['richReplacement','Rich editing preserves exact empty or whitespace replacement',input.replacement],
        ['deletionExplanation','Rich editing explicitly explains the deletion effect in words',true],
        ['consent',input.replacement.length?'Nonempty whitespace deletion requires affirmative intent before acceptance':'Empty deletion needs no extra whitespace consent',input.replacement.length?{present:true,blocked:true,confirmed:true}:{present:false,blocked:false}],
        ['savedSource','Saved deletion source',editedSource],['savedRange','Saved target offsets',`-${input.range.end-input.range.start}+0`],
        ['reopenedSource','Reloaded rich proposal retains exact deletion source',editedSource],
        ['beforeApplySource','Draft does not write repository contents',input.source],['noEarlyCommit','Draft does not create a source commit',true],
        ['appliedSource','Deletion removes only the intended file lines',remaining],['singleApplyCommit','Application creates one child of the seed commit',true],
        ['appliedFlagAtCommit','Successful deletion has Applied metadata immediately after commit',true]);
    }
    if(input.scope!=='handoff'&&!deletion&&!review)specs.push(['savedSource','Saved replacement source',replacement],['savedRange','Saved target offsets',`-${input.range.end-input.range.start}+0`],
      ['beforeApplySource','Draft does not write repository contents',input.source],['noEarlyCommit','Draft does not create a source commit',true],
      ['appliedSource','Applied repository file contents',expectedFile],['singleApplyCommit','Application creates one child of the seed commit',true],
      ['proseOnlyBody','Prose editing changes only the intended comment suffix',true],['noProseFileChange','Prose editing retains repository content and head',true],
      ['appliedFlag','Prose editing retains Applied flag',true],['stableSuggestionId','Prose editing retains unchanged suggestion identity',true]);
    if (input.historyControls) specs.push(
      ['historyInitialBadge','Reloaded prose edit displays the original Applied badge',true],
      ['historyAdd','Adding a neighbor retains the applied record and gives the new proposal a fresh ID',true]);
    if (input.historyControls && !input.outdatedHistory) specs.push(
      ['historyReorder','Swapping distinct proposals preserves both IDs, contents and Applied flags',true],
      ['historyRefusal','Ambiguous duplication is explained by the server and preserves the prior saved note',true],
      ['historyDraft','Refused duplication leaves the submitted draft in the source field',true],
      ['historyExplanation','GitLab renders the reason for refusing the ambiguous duplicate',true],
      ['historyExplanationOnscreen','The refusal reason is on screen without scrolling after Save',true],
      ['historyChange','Changed source gets a fresh unapplied ID while its neighbor keeps its identity',true],
      ['historyRange','Changed target range gets its own fresh identity and the correct two source lines',true],
      ['historyFile','No review-note edit changes the applied file or its commit',true],
      ['historyFinalBadges','Reload after replacing the applied proposal has no Applied badges',0]);
    if (input.outdatedHistory) specs.push(
      ['outdatedIdentity','Prose editing retains the original IDs and stored contents of both the applied and outdated proposals',true],
      ['outdatedEligibility','The outdated pending proposal remains ineligible after the prose edit',true],
      ['outdatedProse','The saved note changes only by the intended prose suffix',true],
      ['outdatedFile','The competing commit and file remain exact after the subsequent note edit',true],
      ['historyFinalBadges','The applied proposal still has its badge after the stale review reloads',1]);
    for(const [key,label,expected] of specs)rows.push({case:input.id,invariant:key,label,expected,original:left[key],fountain:right[key],classification:null});
  }
  const matched=mismatches.length===0;
  for(const row of rows){
    if(matched)row.classification=classifyInvariant(row.expected,row.original,row.fountain);
    row.status=row.classification?'paired':row.original===undefined||row.fountain===undefined?'missing-evidence':matched?'inconclusive-different-failures':'unmatched-environment';
  }
  const counts=Object.fromEntries(['parity','improvement','regression','shared-limitation'].map(key=>[key,rows.filter(row=>row.classification===key).length]));
  const incomplete=rows.filter(row=>row.classification===null).length;
  const rollback = original.rollback;
  const requiresRollback = Boolean(original.rollbackRequested || rollback);
  const firstEditsVerified = rollback?.formatVersion === 2 && matched &&
    equal(rollback.candidateBuild, fountain.buildIdentity?.expected) &&
    Array.isArray(rollback.records) && rollback.records.length === fixture.cases.length * 2 &&
    new Set(rollback.records.map(record => record.iid)).size === rollback.records.length &&
    fixture.cases.every(input => [original,fountain].every(writer => {
      const record = rollback.records.find(entry => entry.case === input.id && entry.writer === writer.side);
      const issue = writer.observations.find(entry => entry.id === input.id);
      const before = input.description + input.suffix;
      const expected = before + ' First Markdown save.';
      const expectedNotes = ['**' + input.comment + '**'];
      return Number.isSafeInteger(record?.iid) && record.iid > 0 && record.iid === issue?.iid &&
        record.before === before && equal(record.beforeNotes,expectedNotes) && !record.baselineFailure &&
        matchesSaveGesture(record.firstMarkdownGesture,'.',expected,'immediate','markdown') &&
        record.firstMarkdownAfterReload === expected && equal(record.firstMarkdownNotes,expectedNotes);
    }));
  const rollbackVerified = (rollback?.formatVersion !== 2 || firstEditsVerified) && rollback?.passed === true && Array.isArray(rollback.records) &&
    rollback.records.length === fixture.cases.length * 2 && fixture.cases.every(input =>
      ['original','fountain'].every(writer => {
        const record = rollback.records.find(entry => entry.case === input.id && entry.writer === writer);
        const initial = input.description + input.suffix;
        const firstMarkdown = initial + ' First Markdown save.';
        const checksFirstEdit = rollback.formatVersion === 2;
        const expected = (checksFirstEdit ? firstMarkdown : initial) + ' Checked after rollback.';
        return record?.quickSaveMeasured === true && record.quickSavePassed === true && !record.baselineFailure &&
          record.before === input.description + input.suffix &&
          (record.beforeNotes === undefined || equal(record.beforeNotes,['**' + input.comment + '**'])) &&
          matchesSaveGesture(record.gesture,'.',expected,'immediate') && record.quickSaveAfterReload === expected &&
          record.reviewedSaveAfterReload === input.description + input.suffix + ' Verified in Markdown.' &&
          equal(record.notes,['**' + input.comment + '**']);
      }));
  const comparisonComplete = matched&&incomplete===0&&original.collectionComplete===true&&fountain.collectionComplete===true&&original.errors?.length===0&&fountain.errors?.length===0;
  return {formatVersion:2,...(requiresRollback ? {frontendRollback:{passed:rollbackVerified,...(rollback?.formatVersion === 2 ? {firstMarkdownSavePassed:firstEditsVerified} : {}),issueIds:(rollback?.records??[]).filter(record=>record.writer==='fountain').map(record=>record.iid)}} : {}),scope:'Per-invariant original GitLab 19.5.3 editor versus this Fountain integration candidate; not a general Tiptap benchmark.',
    buildIdentities:{original:original.buildIdentity??null,fountain:fountain.buildIdentity??null},
    environment:{matched,mismatches},runs:{original:{runId:original.runId,attempt:original.attempt},fountain:{runId:fountain.runId,attempt:fountain.attempt}},
    rows,summary:{...counts,incomplete,total:rows.length},
    comparisonComplete,
    regressionGate:{passed:comparisonComplete&&counts.regression===0},
    featureAcceptance:{passed:comparisonComplete&&(!requiresRollback||rollbackVerified)&&rows.every(row=>row.fountain!==undefined&&equal(row.fountain,row.expected)),reason:'Shared limitations remain unmet feature requirements; comparison classifications never turn them into passes.'}};
}
