const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const commit = value => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
const positive = value => Number.isSafeInteger(value) && value > 0;

export function batchReviewChecks(input, fixture, item) {
  const live = input.waitForLiveUpdate === true;
  const stale = typeof input.competingSource === 'string';
  const end = input.range.end ?? input.range.start;
  const secondStart = input.secondStart ?? input.secondLine;
  const overlap = !input.secondFilePath && input.secondLine >= input.range.start && secondStart <= end && !stale && !live;
  const refused = stale || overlap;
  const keep = input.keepReview ?? 0;
  const selected = [keep===0,keep===1];
  const labels = {
    authored:'Both posted review notes contain the exact intended replacements at their intended file locations',
    firstOnly:'Queueing the first suggestion selects only its own review',
    both:'Both eligible suggestions can be queued together',
    removed:'Removing the first suggestion keeps the second in the batch',
    requeued:'Re-adding the first suggestion restores the two-item batch',
    untouched:'Queue operations preserve both saved suggestions, the file and the seed commit',
    submitted:live?'The live refresh sends no apply request and keeps both proposals queued':'The confirmation submits exactly the two queued suggestion IDs and the chosen message',
    decision:live?'The changed suggestion disables Apply and closes its pending confirmation':stale?'GitLab refuses the stale batch with a client-visible response':'GitLab accepts the batch request',
    feedback:live?'The changed note visibly explains the outdated line and how to continue the review':stale?'The reviewer sees a reason why the queued batch cannot apply':'The reviewer sees both Applied badges before reload',
    reader:'Both reloaded badges match the persisted application state',
    stable:'The branch head and file contents remain stable after reload',
  };
  if (overlap) {
    labels.decision = 'GitLab rejects the batch because the suggested lines overlap';
    labels.feedback = 'The reviewer sees that the two suggestions overlap';
  }
  for (const phase of ['after','reloaded']) {
    const when = phase === 'after' ? 'after confirmation' : 'after reload';
    labels[phase+'Source'] = 'The entire file matches the expected contents '+when;
    labels[phase+'Commit'] = (overlap?'The seed commit and original file commit remain unchanged ':stale?'Only the competing commit exists ':'One batch commit directly follows the seed with the chosen message ')+when;
    labels[phase+'Notes'] = 'Both original note and suggestion IDs retain their source and correct Applied flags '+when;
  }
  if (live) labels.promptScoped = 'The removal instruction stays off the valid note and disappears when the stale suggestion leaves the queue';
  if (input.recoverUnchanged) Object.assign(labels, {
    recoveryQueue: 'The refused batch stays intact until the reviewer removes the changed target',
    recoveryBefore: 'Removing the outdated proposal leaves the saved branch, both notes and their eligibility unchanged',
    recoveryRequest: 'The new confirmation applies only the surviving ID with the reviewer’s new commit message',
    recoveryFile: 'The final file includes the surviving suggestion and the competing edit',
    recoveryCommit: 'Exactly one new commit directly follows the competing commit',
    recoveryNotes: 'Only the surviving suggestion receives Applied and both original suggestion IDs survive reload',
    recoveryBadges: 'The freshly loaded readers show Applied only on the surviving review',
  });
  if (overlap && input.recoverUnchanged) Object.assign(labels,{
    recoveryQueue:'The reviewer chooses which proposal to keep from the original pair',
    recoveryBefore:'Both alternatives remain individually eligible until the reviewer confirms one',
    recoveryFile:'The final file contains only the selected replacement',
    recoveryCommit:'Only the selected proposal creates a direct child of the seed commit',
    recoveryNotes:'Both notes retain their original proposals and only the chosen one is marked Applied',
  });
  if (input.reviewerRoleChange) Object.assign(labels,{
    reviewerIdentity:'The dedicated reviewer moves from Developer to Reporter and back in the same session, then returns to Guest at cleanup',
    reviewerQueued:'The reviewer has both proposals queued and can confirm before the role change',
    reviewerLive:'The open confirmation no longer offers to commit at the three-second role-change observation',
    reviewerNotice:'The affected suggestion explains that source-branch write access is unavailable',
    reviewerDraft:'The original tab retains both queued proposals and the typed commit message after access returns',
    reviewerFresh:'After reload the Reporter can read both suggestions and has no enabled apply or queue controls',
    reviewerNoWrite:'The role transition sends no suggestion write and preserves the seed, file and both original notes',
    reviewerRestored:'After Developer access returns both suggestions can be queued again or are still queued',
  });
  const multi = Boolean(input.secondFilePath);
  const paths = [input.filePath,input.secondFilePath,input.untouchedFilePath];
  if (multi) {
    labels.dismissed = 'Dismissing the confirmation keeps the queue and saved state intact and sends no apply request';
    labels.positions = 'Both saved notes identify the intended full path and line before and after confirmation and reload';
    labels.seedFiles = 'All three matching files share the seed commit and queueing preserves their contents';
    labels.fileWrites = 'File contents, last commits and commit diff paths identify every changed and untouched file';
    if (input.recoverUnchanged) labels.recoveryWrites = 'Recovery changes only the surviving path and preserves the competing file and untouched copy';
  }
  const b = item?.batch, values = {};
  if (!b?.before || !commit(item.setup?.seedCommit)) return {labels, values};
  if (input.reviewerRoleChange && b.roles) {
    const roles = b.roles;
    const actor = roles.actor;
    const memberships = [['initial',30],['lowered',20],['restored',30],['cleanup',10]];
    if (actor && memberships.every(([phase])=>roles[phase]))
      values.reviewerIdentity = positive(actor.id) && actor.username===fixture.username &&
        memberships.every(([phase,level])=>roles[phase].id===actor.id &&
          roles[phase].username===actor.username && roles[phase].accessLevel===level);
    const pair = (state,check) => state?.notes?.length===2 && state.notes.every(note=>note.header===true && check(note));
    if (roles.queued) values.reviewerQueued = roles.queued.confirmEnabled===true && pair(roles.queued,n=>n.queued===true);
    if (roles.open) values.reviewerLive = roles.sampleMs>=3000 && roles.open.confirmEnabled===false && roles.open.canApplyBatch===false;
    if (typeof roles.accessNotice==='boolean') values.reviewerNotice = roles.accessNotice;
    if (roles.returned && typeof roles.draftAfter==='string') values.reviewerDraft =
      typeof fixture.commitMessage==='string' && roles.draftBefore===fixture.commitMessage && roles.draftAfter===roles.draftBefore &&
      roles.returned.confirmEnabled===true && pair(roles.returned,n=>n.queued===true);
    if (roles.fresh) values.reviewerFresh = roles.fresh.confirmEnabled===false && roles.fresh.canApplyBatch===false &&
      pair(roles.fresh,n=>n.canApply===false && n.canAdd===false);
    if (roles.saved && Array.isArray(roles.requestsBeforeConfirmation)) values.reviewerNoWrite = same(roles.requestsBeforeConfirmation,[]) && same(roles.saved,b.before) && b.before.head===item.setup.seedCommit;
    if (roles.returned) values.reviewerRestored = pair(roles.returned,n=>n.canAdd===true || n.queued===true);
  }
  const lines = input.source.split('\n');
  const offsets = [input.range.start, secondStart];
  const ends = [end,input.secondLine];
  const originals = offsets.map((line,i) => lines.slice(line-1,ends[i]).join('\n')+'\n');
  const edits = [originals[0]+fixture.appendLine, fixture.secondReplacement+'\n'];
  const bodies = edits.map((text,i)=> '```suggestion:-'+(ends[i]-offsets[i])+'+0\n'+text+'```\n\n'+[fixture.marker,fixture.secondMarker][i]);
  const notes = b.before.notes;
  const ids = notes?.map(n=>n.suggestions?.[0]?.id);
  values.authored = notes?.length === 2 && ids.every(positive) && new Set(ids).size === 2 &&
    notes.every((n,i)=>positive(n.id) && n.id !== notes[1-i].id && n.body===bodies[i] && n.suggestions?.length===1 &&
      n.suggestions[0].from_line===offsets[i] && n.suggestions[0].to_line===ends[i] &&
      n.suggestions[0].from_content===originals[i] && n.suggestions[0].to_content===edits[i] &&
      n.suggestions[0].appliable===true && n.suggestions[0].applied===false);
  for (const [key, phase, expected] of [['firstOnly','firstOnly',[true,false]],['both','both',[true,true]],
    ['removed','secondOnly',[false,true]],['requeued','requeued',[true,true]]])
    if (b[phase]) values[key] = same(b[phase],expected);
  if (b.beforeSubmit) values.untouched = b.before.head===item.setup.seedCommit && b.before.fileCommit===item.setup.seedCommit &&
    b.before.source===input.source && same(b.beforeSubmit,b.before);
  const request = b.response?.request;
  if (live && b.liveUpdate) {
    const update = b.liveUpdate;
    const nextAction = 'Remove this suggestion from the batch to continue the review.';
    values.submitted = same(update.requests,[]) && same(update.queue,[true,true]) && !b.response;
    values.decision = update.disabled===true && update.confirmVisible===false && b.confirmUnavailable===true;
    values.feedback = update.text.includes("Can't apply as this line was changed in a more recent version.") &&
      update.text.includes(nextAction) && same(b.visibleBadges,[false,false]);
    if (typeof b.recovery?.removedText==='string') values.promptScoped =
      update.text.includes(nextAction) && !update.otherText.includes(nextAction) && !b.recovery.removedText.includes(nextAction);
  } else if (!live && (b.response || b.confirmUnavailable)) {
    values.submitted = values.authored && request?.commit_message===fixture.commitMessage && Array.isArray(request.ids) &&
      same([...request.ids].sort((a,b)=>a-b),[...ids].sort((a,b)=>a-b));
    const status = b.response?.status;
    values.decision = refused ? status >= 400 && status < 500 : status >= 200 && status < 300;
    if (overlap) values.decision = status===400 && /lines cannot overlap/i.test(b.response?.body?.message ?? '');
  }
  if (!live && Array.isArray(b.visibleBadges)) {
    const reason = overlap ? /lines cannot overlap/i : /outdated|changed|cannot be applied|can.t be applied|failed to apply|conflict/i;
    values.feedback = same(b.visibleBadges,[!refused,!refused]) && (!refused || b.alerts.some(text=>reason.test(text)));
  }
  if (b.reloadedBadges) values.reader = same(b.reloadedBadges,[!refused,!refused]);
  if (b.reloaded && b.after) values.stable = b.after.head===b.reloaded.head && b.after.source===b.reloaded.source;
  for (const phase of ['after','reloaded']) {
    const state=b[phase];
    if (!state) continue;
    const seed = item.setup.seedCommit;
    if (overlap) {
      values[phase+'Source'] = state.source===input.source;
      values[phase+'Commit'] = state.head===seed && state.fileCommit===seed && same(state.parents,b.before.parents);
    } else {
      const expectedSource = stale && !multi ? input.competingSource : input.source;
      values[phase+'Source'] = state.source===(stale ? expectedSource : input.expectedSource);
      values[phase+'Commit'] = commit(state.head) && state.fileCommit===(stale && multi ? seed : state.head) &&
        same(state.parents,[seed]) && (stale ? state.head===b.competingCommit?.id && same(b.competingCommit.parents,[seed]) :
        state.head!==seed && state.message===fixture.commitMessage);
    }
    values[phase+'Notes'] = values.authored && state.notes?.length===2 && state.notes.every((n,i)=>{
      const s = n.suggestions?.[0];
      return n.id===notes[i].id && n.body===bodies[i] && n.suggestions.length===1 && s?.id===ids[i] && s.from_content===originals[i] &&
        s.to_content===edits[i] && s.from_line===offsets[i] && s.to_line===ends[i] && s.applied===!refused && (!overlap || s.appliable===true);
    });
  }
  if (multi) {
    if (b.dismissed) values.dismissed = same(b.dismissed.queue,[true,true]) && same(b.dismissed.requests,[]) && same(b.dismissed.state,b.beforeSubmit);
    const seed = item.setup.seedCommit;
    function matches(state, sources, commits, changed) {
      if (!state?.files || Object.keys(state.files).length !== paths.length) return false;
      return paths.every((path,i)=>state.files[path]?.source===sources[i] && state.files[path]?.commit===commits[i]) &&
        Array.isArray(state.changedPaths) && same(state.changedPaths.map(p=>p.to).sort(),[...changed].sort()) &&
        state.changedPaths.every(p=>p.from===p.to);
    }
    const phases = [b.before,b.beforeSubmit,b.after,b.reloaded];
    if (b.recovery) phases.push(b.recovery.before,b.recovery.after,b.recovery.reloaded);
    if (phases.every(Boolean)) values.positions = phases.every(state=>state.notes?.length===2 && state.notes.every((n,i)=>
      n.id===notes[i].id && n.position?.old_path===paths[i] && n.position?.new_path===paths[i] && n.position?.new_line===offsets[i]));
    if (b.beforeSubmit) values.seedFiles = [b.before,b.beforeSubmit].every(state=>matches(state,
      paths.map(()=>input.source),paths.map(()=>seed),paths));
    if (b.after && b.reloaded) values.fileWrites = [b.after,b.reloaded].every(state=>matches(state,
      [stale ? input.source : input.expectedSource,stale ? input.competingSource : input.expectedSecondSource,input.source],
      [stale ? seed : state.head,state.head,seed],stale ? [paths[1]] : paths.slice(0,2)));
    if (b.recovery?.after && b.recovery.reloaded) values.recoveryWrites = [b.recovery.after,b.recovery.reloaded].every(state=>matches(state,
      [input.recoveredSource,input.competingSource,input.source],[state.head,b.competingCommit?.id,seed],[paths[0]]));
  }
  if (b.recovery) {
    const r = b.recovery;
    values.recoveryQueue = same(r.queuedAfterRefusal,[true,true]) && same(r.remaining,selected);
    values.recoveryBefore = same(r.before,b.reloaded) && r.before?.notes?.[0]?.suggestions?.[0]?.appliable === true &&
      r.before.notes[1]?.suggestions?.[0]?.appliable === overlap;
    values.recoveryRequest = values.authored && r.response?.status >= 200 && r.response.status < 300 &&
      r.response.path === '/api/v4/suggestions/'+ids[keep]+'/apply' && r.response.request?.commit_message === fixture.recoveryMessage;
    if (r.after && r.reloaded) {
      const phases = [r.after,r.reloaded];
      values.recoveryFile = phases.every(state => state.source === input.recoveredSource);
      values.recoveryCommit = r.after.head === r.reloaded.head && phases.every(state => commit(state.head) &&
        state.fileCommit === state.head && state.message === fixture.recoveryMessage && same(state.parents,[overlap ? item.setup.seedCommit : b.competingCommit?.id]));
      values.recoveryNotes = values.authored && phases.every(state=>state.notes?.length===2 && state.notes.every((n,i)=>{
        const s=n.suggestions?.[0];
        return n.id===notes[i].id && n.body===bodies[i] && n.suggestions?.length===1 && s?.id===ids[i] &&
          s.from_content===originals[i] && s.to_content===edits[i] && s.applied===selected[i] && (overlap || selected[i] || s.appliable===false);
      }));
      values.recoveryBadges = same(r.badges,selected);
    }
  }
  return {labels, values};
}
