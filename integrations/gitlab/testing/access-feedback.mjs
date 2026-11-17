/** A separate UI gate: data retention alone does not validate conflict feedback. */
export function inspectGitLabAccessFeedback(report) {
 const cases=report?.fixture?.cases?.filter(input=>input.kind==='revocation')??[];
 const valid=report?.side==='fountain'&&report.collectionComplete===true&&report.errors?.length===0&&cases.length>0;
 const checks=cases.map(input=>{
  const item=report.observations?.find(value=>value.id===input.id);
  const alerts=Array.isArray(item?.errorAlerts)?item.errorAlerts:null;
  return {case:input.id,
   nativeEditorObserved:item?.status==='observed'&&item.editorProof?.native===true&&/\bfountain-editor\b/u.test(item.editorProof?.className??'')&&item.actorErrors?.length===0,
   revokedAuthorityReturned:item?.mutations?.some(value=>value.stage==='revoke-edit-access'&&value.canUpdate===false)===true,
   permissionFailureExplained:alerts?.some(value=>value.includes('You no longer have permission to edit this description. Your draft has been kept.'))===true,
   noFalseConflict:alerts!==null&&!alerts.some(value=>value.includes('Someone edited the description at the same time you did.')),
   exactDraftRetained:typeof item?.pendingSource==='string'&&item.retainedSource===item.pendingSource,
  };
 });
 return {scope:'Additional native feedback gate; not a matched parity score or full application certification.',checks,passed:valid&&checks.every(row=>Object.entries(row).every(([key,value])=>key==='case'||value===true))};
}
