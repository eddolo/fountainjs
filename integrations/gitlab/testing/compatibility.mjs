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
function observedValues(report,item,input,fixture){
  if(!item?.editorProof)return {};
  const validEngine=report.side==='original'?item.editorProof.native===false&&/\bProseMirror\b/u.test(item.editorProof.className):item.editorProof.native===true&&/\bfountain-editor\b/u.test(item.editorProof.className);
  if(!validEngine)return {};
  const raw=item.prefillDOM;
  // Native source owns one final line terminator; remove exactly that terminator,
  // never trim whitespace or remove invisible/private-use characters.
  const prefill=typeof raw==='string'&&report.side==='fountain'&&raw.endsWith('\n')?raw.slice(0,-1):raw;
  const first=suggestionBlock(item.sourceAtFirstVisible),settled=suggestionBlock(item.sourceModeBeforeEdit),saved=suggestionBlock(item.saved?.body);
  const result={prefill,firstSource:first?.source,settledSource:settled?.source,range:settled?.params};
  if(input.scope==='handoff')return result;
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
  const before=item.appliedNote?.suggestions,after=item.afterProseNote?.suggestions;
  if(before?.length===1&&after?.length===1&&before[0].applied===true&&before[0].to_content===after[0].to_content){
    result.appliedFlag=after[0].applied;result.stableSuggestionId=before[0].id===after[0].id;
  }
  return result;
}
export function compareGitLabCompatibility(original,fountain){
  const mismatches=[];
  const check=(name,a,b)=>{if(a===undefined||b===undefined||!equal(a,b))mismatches.push(name);};
  if(original?.side!=='original'||fountain?.side!=='fountain')mismatches.push('editor-side');
  for(const key of ['runId','fixtureHash','fixture','harnessHashes','browser'])check(key,original?.[key],fountain?.[key]);
  for(const key of ['image','imageId','backendMounts','backendEnvironmentHash','cpus','memory'])check('deployment.'+key,original?.deployment?.[key],fountain?.deployment?.[key]);
  for(const key of ['version','project','actor','serverSources'])check('backend.'+key,original?.backend?.[key],fountain?.backend?.[key]);
  const fixture=original?.fixture,rows=[];
  if(!Array.isArray(fixture?.cases)||fixture.cases.length===0||fixture.cases.length>100)throw new Error('Invalid comparison fixture');
  for(const input of fixture.cases){
    const a=original.observations?.find(item=>item.id===input.id),b=fountain.observations?.find(item=>item.id===input.id);
    if(a&&!equal(a.input,input))mismatches.push(input.id+':original-input');
    if(b&&!equal(b.input,input))mismatches.push(input.id+':fountain-input');
    const left=observedValues(original,a,input,fixture),right=observedValues(fountain,b,input,fixture);
    const lines=input.source.split('\n'),selected=lines.slice(input.range.start-1,input.range.end).join('\n'),source=selected+'\n',replacement=source+fixture.appendLine;
    const prefix=lines.slice(0,input.range.start-1),expectedFile=(prefix.length?prefix.join('\n')+'\n':'')+replacement+lines.slice(input.range.end).join('\n');
    const deletion=input.scope==='deletion',editedSource=deletion?input.replacement:source;
    const specs=[['prefill','Selected source characters',selected],['firstSource','Source at first visible Markdown field',editedSource],
      ['settledSource','Source after declared observation window',editedSource],['range','Selected target offsets',`-${input.range.end-input.range.start}+0`]];
    if(deletion){
      const remaining=[...lines.slice(0,input.range.start-1),...lines.slice(input.range.end)].join('\n');
      specs.push(['richReplacement','Rich editing preserves exact empty or whitespace replacement',input.replacement],
        ['deletionExplanation','Rich editing explicitly explains the deletion effect in words',true],
        ['consent',input.replacement.length?'Nonempty whitespace deletion requires affirmative intent before acceptance':'Empty deletion needs no extra whitespace consent',input.replacement.length?{present:true,blocked:true,confirmed:true}:{present:false,blocked:false}],
        ['savedSource','Saved deletion source',input.replacement],['savedRange','Saved target offsets',`-${input.range.end-input.range.start}+0`],
        ['reopenedSource','Reloaded rich proposal retains exact deletion source',input.replacement],
        ['beforeApplySource','Draft does not write repository contents',input.source],['noEarlyCommit','Draft does not create a source commit',true],
        ['appliedSource','Deletion removes only the intended file lines',remaining],['singleApplyCommit','Application creates one child of the seed commit',true],
        ['appliedFlagAtCommit','Successful deletion has Applied metadata immediately after commit',true]);
    }
    if(input.scope!=='handoff'&&!deletion)specs.push(['savedSource','Saved replacement source',replacement],['savedRange','Saved target offsets',`-${input.range.end-input.range.start}+0`],
      ['beforeApplySource','Draft does not write repository contents',input.source],['noEarlyCommit','Draft does not create a source commit',true],
      ['appliedSource','Applied repository file contents',expectedFile],['singleApplyCommit','Application creates one child of the seed commit',true],
      ['proseOnlyBody','Prose editing changes only the intended comment suffix',true],['noProseFileChange','Prose editing retains repository content and head',true],
      ['appliedFlag','Prose editing retains Applied flag',true],['stableSuggestionId','Prose editing retains unchanged suggestion identity',true]);
    for(const [key,label,expected] of specs)rows.push({case:input.id,invariant:key,label,expected,original:left[key],fountain:right[key],classification:null});
  }
  const matched=mismatches.length===0;
  for(const row of rows){
    if(matched)row.classification=classifyInvariant(row.expected,row.original,row.fountain);
    row.status=row.classification?'paired':row.original===undefined||row.fountain===undefined?'missing-evidence':matched?'inconclusive-different-failures':'unmatched-environment';
  }
  const counts=Object.fromEntries(['parity','improvement','regression','shared-limitation'].map(key=>[key,rows.filter(row=>row.classification===key).length]));
  const incomplete=rows.filter(row=>row.classification===null).length;
  return {formatVersion:1,scope:'Per-invariant original GitLab 19.5.3 editor versus this Fountain integration candidate; not a general Tiptap benchmark.',
    environment:{matched,mismatches},runs:{original:{runId:original.runId,attempt:original.attempt},fountain:{runId:fountain.runId,attempt:fountain.attempt}},
    rows,summary:{...counts,incomplete,total:rows.length},
    comparisonComplete:matched&&incomplete===0&&original.collectionComplete===true&&fountain.collectionComplete===true&&original.errors?.length===0&&fountain.errors?.length===0,
    regressionGate:{passed:matched&&incomplete===0&&counts.regression===0&&original.collectionComplete===true&&fountain.collectionComplete===true&&original.errors?.length===0&&fountain.errors?.length===0},
    featureAcceptance:{passed:matched&&fountain.collectionComplete===true&&fountain.errors?.length===0&&rows.every(row=>row.fountain!==undefined&&equal(row.fountain,row.expected)),reason:'Shared limitations remain unmet feature requirements; comparison classifications never turn them into passes.'}};
}
