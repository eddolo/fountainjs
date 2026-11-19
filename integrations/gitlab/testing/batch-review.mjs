const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const commit = value => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
const positive = value => Number.isSafeInteger(value) && value > 0;

export function batchReviewChecks(input, fixture, item) {
  const stale = typeof input.competingSource === 'string';
  const labels = {
    authored:'Both posted review notes contain the exact intended replacements at their distinct source lines',
    firstOnly:'Queueing the first suggestion selects only its own review',
    both:'Both eligible suggestions can be queued together',
    removed:'Removing the first suggestion keeps the second in the batch',
    requeued:'Re-adding the first suggestion restores the two-item batch',
    untouched:'Queue operations preserve both saved suggestions, the file and the seed commit',
    submitted:'The confirmation submits exactly the two queued suggestion IDs and the chosen message',
    decision:stale?'GitLab refuses the stale batch with a client-visible response':'GitLab accepts the batch request',
    feedback:stale?'The reviewer sees a reason why the queued batch cannot apply':'The reviewer sees both Applied badges before reload',
    reader:'Both reloaded badges match the persisted application state',
    stable:'The branch head and file contents remain stable after reload',
  };
  for (const phase of ['after','reloaded']) {
    const when = phase === 'after' ? 'after confirmation' : 'after reload';
    labels[phase+'Source'] = 'The entire file matches the expected contents '+when;
    labels[phase+'Commit'] = (stale?'Only the competing commit exists ':'One batch commit directly follows the seed with the chosen message ')+when;
    labels[phase+'Notes'] = 'Both original note and suggestion IDs retain their source and correct Applied flags '+when;
  }
  if (input.recoverUnchanged) Object.assign(labels, {
    recoveryQueue: 'The refused batch stays intact until the reviewer removes the changed target',
    recoveryBefore: 'Removing the outdated proposal leaves the saved branch, both notes and their eligibility unchanged',
    recoveryRequest: 'The new confirmation applies only the surviving ID with the reviewer’s new commit message',
    recoveryFile: 'The final file includes the surviving suggestion and the competing edit',
    recoveryCommit: 'Exactly one new commit directly follows the competing commit',
    recoveryNotes: 'Only the surviving suggestion receives Applied and both original suggestion IDs survive reload',
    recoveryBadges: 'The freshly loaded readers show Applied only on the surviving review',
  });
  const b = item?.batch, values = {};
  if (!b?.before || !commit(item.setup?.seedCommit)) return {labels, values};
  const lines = input.source.split('\n');
  const offsets = [input.range.start, input.secondLine];
  const originals = offsets.map(line => lines[line-1]+'\n');
  const edits = [originals[0]+fixture.appendLine, fixture.secondReplacement+'\n'];
  const bodies = edits.map((text,i)=> '```suggestion:-0+0\n'+text+'```\n\n'+[fixture.marker,fixture.secondMarker][i]);
  const notes = b.before.notes;
  const ids = notes?.map(n=>n.suggestions?.[0]?.id);
  values.authored = notes?.length === 2 && ids.every(positive) && new Set(ids).size === 2 &&
    notes.every((n,i)=>positive(n.id) && n.id !== notes[1-i].id && n.body===bodies[i] && n.suggestions?.length===1 &&
      n.suggestions[0].from_line===offsets[i] && n.suggestions[0].to_line===offsets[i] &&
      n.suggestions[0].from_content===originals[i] && n.suggestions[0].to_content===edits[i] &&
      n.suggestions[0].appliable===true && n.suggestions[0].applied===false);
  for (const [key, phase, expected] of [['firstOnly','firstOnly',[true,false]],['both','both',[true,true]],
    ['removed','secondOnly',[false,true]],['requeued','requeued',[true,true]]])
    if (b[phase]) values[key] = same(b[phase],expected);
  if (b.beforeSubmit) values.untouched = b.before.head===item.setup.seedCommit && b.before.fileCommit===item.setup.seedCommit &&
    b.before.source===input.source && same(b.beforeSubmit,b.before);
  const request = b.response?.request;
  if (b.response || b.confirmUnavailable) {
    values.submitted = values.authored && request?.commit_message===fixture.commitMessage && Array.isArray(request.ids) &&
      same([...request.ids].sort((a,b)=>a-b),[...ids].sort((a,b)=>a-b));
    values.decision = stale ? b.response?.status >= 400 && b.response?.status < 500 : b.response?.status >= 200 && b.response?.status < 300;
  }
  if (Array.isArray(b.visibleBadges)) values.feedback = stale ? same(b.visibleBadges,[false,false]) &&
    b.alerts.some(text=>/outdated|changed|cannot be applied|can.t be applied|failed to apply|conflict/i.test(text)) : same(b.visibleBadges,[true,true]);
  if (b.reloadedBadges) values.reader = same(b.reloadedBadges,[!stale,!stale]);
  if (b.reloaded && b.after) values.stable = b.after.head===b.reloaded.head && b.after.source===b.reloaded.source;
  for (const phase of ['after','reloaded']) {
    const state=b[phase];
    if (!state) continue;
    values[phase+'Source'] = state.source === (stale ? input.competingSource : input.expectedSource);
    values[phase+'Commit'] = commit(state.head) && state.fileCommit===state.head && same(state.parents,[item.setup.seedCommit]) &&
      (stale ? state.head===b.competingCommit?.id && same(b.competingCommit.parents,[item.setup.seedCommit]) :
       state.head!==item.setup.seedCommit && state.message===fixture.commitMessage);
    values[phase+'Notes'] = values.authored && state.notes?.length===2 && state.notes.every((n,i)=>{
      const s = n.suggestions?.[0];
      return n.id===notes[i].id && n.body===bodies[i] && n.suggestions.length===1 && s?.id===ids[i] && s.from_content===originals[i] &&
        s.to_content===edits[i] && s.from_line===offsets[i] && s.to_line===offsets[i] && s.applied===!stale;
    });
  }
  if (b.recovery) {
    const r = b.recovery;
    values.recoveryQueue = same(r.queuedAfterRefusal,[true,true]) && same(r.remaining,[true,false]);
    values.recoveryBefore = same(r.before,b.reloaded) && r.before?.notes?.[0]?.suggestions?.[0]?.appliable === true &&
      r.before.notes[1]?.suggestions?.[0]?.appliable === false;
    values.recoveryRequest = values.authored && r.response?.status >= 200 && r.response.status < 300 &&
      r.response.path === '/api/v4/suggestions/'+ids[0]+'/apply' && r.response.request?.commit_message === fixture.recoveryMessage;
    if (r.after && r.reloaded) {
      const phases = [r.after,r.reloaded];
      values.recoveryFile = phases.every(state => state.source === input.recoveredSource);
      values.recoveryCommit = r.after.head === r.reloaded.head && phases.every(state => commit(state.head) &&
        state.fileCommit === state.head && state.message === fixture.recoveryMessage && same(state.parents,[b.competingCommit?.id]));
      values.recoveryNotes = values.authored && phases.every(state=>state.notes?.length===2 && state.notes.every((n,i)=>{
        const s=n.suggestions?.[0];
        return n.id===notes[i].id && n.body===bodies[i] && n.suggestions?.length===1 && s?.id===ids[i] &&
          s.from_content===originals[i] && s.to_content===edits[i] && s.applied===(i===0) && (i===0 || s.appliable===false);
      }));
      values.recoveryBadges = same(r.badges,[true,false]);
    }
  }
  return {labels, values};
}
