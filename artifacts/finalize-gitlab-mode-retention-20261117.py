from pathlib import Path
import json,hashlib,base64,re,subprocess
from collections import Counter
base=Path('artifacts/gitlab-mode-retention-20261117');pairbase=Path('artifacts/gitlab-compatibility/membership-removal-20261117')
sha=lambda data:hashlib.sha256(data).hexdigest()
read=lambda path:json.loads(Path(path).read_text(encoding='utf-8'))
def write(path,value):Path(path).write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8',newline='\n')
comparison=read(pairbase/'comparison-mode-retention/report.json')
assert comparison['summary']=={'parity':52,'improvement':12,'regression':0,'shared-limitation':0,'incomplete':0,'total':64}
assert comparison['environment']['matched'] and comparison['comparisonComplete'] and comparison['regressionGate']['passed'] and comparison['featureAcceptance']['passed']
for item in comparison['inputs'].values():assert sha(Path(item['path']).read_bytes())==item['sha256']
for name,expected in comparison['comparatorHashes'].items():assert sha(Path(name).read_bytes())==expected
actors=[]
for side in ['original','fountain']:
 run=read(pairbase/(side+'-5')/'report.json');assert run['collectionComplete'] and not run['errors']
 assert sha(Path(run['fixturePath']).read_bytes())==run['fixtureHash']
 for name,expected in run['harnessHashes'].items():assert sha(Path(name).read_bytes())==expected,name
 for item in run['observations']:
  assert item['status']=='observed' and item['actor']['isAdmin'] is False and item['actor']['id']!=item['setup']['authorId']
  assert item['cleanupMembership']['accessLevel']==10 and not item['actorErrors']
  assert item['removedRESTWriteStatus'] in [403,404] and not item['accessAfterRemoval']['itemPresent']
  assert all(receipt['loadingCount']==0 for receipt in item['sourceInspections'])
  assert item['recording']['authenticationExcluded']
  if side=='fountain':
   assert item['deniedInspection']['richVisible'] and item['deniedInspection']['errorCode'] is None
   assert all(item[key] for key in ['deniedSaveReported','draftRetainedAfterDenial','draftRecoveredAfterReload','finalReopenExact'])
   assert item['pendingSource']==item['retainedSource']==item['recoveredSource']==item['finalReopenedSource']
   if item['input']['pendingMode']=='empty':assert item['pendingSource']=='' and item['finalEmptyStored']
 actors.append([item['actor'] for item in run['observations']])
assert actors[0]==actors[1]
before=read(base/'before/manifest.json')
for item in before['files'].values():assert sha(base64.b64decode(item['base64']))==item['sha256']
old_runtime=json.loads(base64.b64decode(before['files']['artifacts/gitlab-native-runtime/build.json']['base64']))
runtime=read('artifacts/gitlab-native-runtime/build.json');assert runtime['sha256']==old_runtime['sha256'] and runtime['bytes']==old_runtime['bytes'] and len(runtime['inputs'])==54
for name,expected in runtime['inputs'].items():assert sha(Path(name).read_bytes())==expected,name
assert sha(Path('artifacts/gitlab-native-runtime/fountain-runtime.mjs').read_bytes())==runtime['sha256']
install=read('artifacts/gitlab-native-browser-install/install.json');assert not install.get('restored') and install['formatVersion']==16 and len(install['files'])==32 and install['nativeRuntime']==runtime
source=Path('//wsl.localhost/Ubuntu/home/eddolo/.cache/fountainjs-gitlab-product/source')
for name,expected in install['files'].items():assert sha((source/name).read_bytes())==expected,name
control=read(base/'mounted-parent-red-final/receipt.json');assert control['candidateRestoredExact'] and control['exitCode']==1
assert control['testSha256']==sha((source/'spec/frontend/vue_shared/components/markdown/fountain_mode_retention_spec.js').read_bytes())
assert re.search(r'Tests:\s+8 failed, 7 passed, 15 total',Path('artifacts/gitlab-mode-retention-parent-red-final-20261117.log').read_text())
assert '429 passed' in Path('artifacts/gitlab-mode-retention-upstream-all-final-20261117.log').read_text()
assert 'Done in' in Path('artifacts/gitlab-mode-retention-upstream-lint-options-20261117.log').read_text()
assert re.search(r'Tests\s+1573 passed',Path('artifacts/gitlab-mode-retention-integration-complete-20261117.log').read_text())
assert not Path('artifacts/gitlab-mode-retention-types-complete-20261117.log').read_text().strip()
assert '9 passed' in Path('artifacts/gitlab-mode-retention-bridge-browser-final-20261117.log').read_text()
rollback=read(base/'rollback/checks.json');assert rollback['passed'] and rollback['allReinstalledFileDigestsExact'] and rollback['hostParentRestoredByteExact'] and rollback['preparedDescriptionRestoredByteExact']
replay=read(base/'prior-corpus-replay.json');assert len(replay['checks'])==18 and replay['comparatorSha256']==sha(Path('integrations/gitlab/testing/compatibility.mjs').read_bytes())
review=read(base/'video-review/manifest.json');assert len(review['recordings'])==4
for item in review['recordings']:
 assert sha(Path(item['path']).read_bytes())==item['sha256'] and item['authenticationExcluded'] and item['rawVideoLocalOnly']
 assert Path(item['contactSheet']).stat().st_size>0
assert not subprocess.check_output(['git','diff','HEAD','--name-only','--','src','package.json','pnpm-lock.yaml','scripts/check-build-budgets.mjs'],text=True).strip()
ledger={}
for line in Path('docs/TIPTAP_PARITY.md').read_text(encoding='utf-8').splitlines():
 cells=[cell.strip() for cell in re.split(r'(?<!\\)\|',line)]
 if len(cells)>4 and re.fullmatch(r'[A-Z]+-\d+',cells[1]):ledger[cells[1]]=cells[3].strip('*')
counts=dict(Counter(ledger.values()));assert counts=={'Delivered':61,'Missing':3,'Partial':8,'Host boundary':2},counts
registry=read(base/'registry.json');assert registry['tags']['latest']=='0.4.0-beta.2' and not registry['candidateExists']
secret=re.compile(r'(?:gh[pousr]_[a-zA-Z0-9]{25,}|glpat-[a-zA-Z0-9_-]{15,})')
logdir=base/'logs';logdir.mkdir(exist_ok=True);logs={}
for path in sorted(Path('artifacts').glob('gitlab-mode-retention-*.log')):
 raw=path.read_bytes();text=raw.decode('utf-8');assert not secret.search(text),path
 text=text.replace('\r\n','\n').replace('\t',r'\t');text=re.sub(r' +$',lambda match:r'\x20'*len(match.group()),text,flags=re.M).rstrip('\n')+'\n'
 target=logdir/(path.stem+'.txt');target.write_text(text,encoding='utf-8',newline='\n')
 logs[path.name]={'rawSha256':sha(raw),'rawBase64':base64.b64encode(raw).decode(),'readablePath':target.as_posix(),'readableSha256':sha(target.read_bytes())}
write(logdir/'manifest.json',{'scope':'Raw log bytes retained in base64; readable copies normalize line endings and escape tabs/trailing spaces.','logs':logs})
primary=[pairbase/'original-5/developer-removed-text-save-denied.png',pairbase/'original-5/developer-removed-empty-reopened.png',pairbase/'fountain-5/developer-removed-text-save-denied.png',pairbase/'fountain-5/developer-removed-text-reopened.png',pairbase/'fountain-5/developer-removed-empty-reopened.png']
bridge=Path('artifacts/gitlab-mode-retention-bridge-browser-final');selected=[]
for engine,leaf in [('chromium','gitlab-handoff-current-source.png'),('firefox','gitlab-handoff-reopened-rich.png'),('webkit','gitlab-handoff-refused-document-retained.png')]:
 matches=[p for p in bridge.rglob(leaf) if engine in p.as_posix()];assert len(matches)==1;selected.extend(matches)
changed=subprocess.check_output(['git','diff','HEAD','--name-only'],text=True).splitlines()
excluded=[(base/'validation.json').as_posix(),(base/'stage-files.json').as_posix()];changed=[name for name in changed if name not in excluded]
additions=['integrations/gitlab/fixtures/markdown-editor-prepared.vue','integrations/gitlab/fixtures/mode-retention-spec.js','integrations/gitlab/services/mode_retention_patch.mjs','scripts/prepare-gitlab-mode-retention-tests.mjs','tests/gitlab-vue2-compiler.test.ts','tools/gitlab-bridge/vite-plugin.d.mts','integrations/gitlab/COMPATIBILITY_MODE_RETENTION_RESULTS.md','artifacts/replay-gitlab-mode-retention-20261117.mjs','artifacts/check-gitlab-mode-retention-parent-red-20261117.mjs','artifacts/check-gitlab-mode-retention-parent-red-final-20261117.mjs','artifacts/check-gitlab-mode-retention-rollback-20261117.mjs','artifacts/finalize-gitlab-mode-retention-20261117.py']
evidence=[p.as_posix() for p in base.rglob('*') if p.is_file() and p.as_posix() not in excluded]
for folder in ['original-5','fountain-5','comparison-mode-retention']:
 evidence.extend(p.as_posix() for p in (pairbase/folder).glob('*') if p.is_file() and p.suffix in ['.json','.md'])
files=sorted(set(changed+additions+evidence+[p.as_posix() for p in primary+selected]))
for name in files:
 if not name.endswith('.png'):assert not secret.search(Path(name).read_text(encoding='utf-8')),name
write(base/'validation.json',{'date':'2026-11-17','parentRevision':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'scope':'Retained native model lifetime; two actual membership-removal workflows plus mounted and bridge controls. Not full product parity.','acceptedPair':['original-5','fountain-5'],'summary':comparison['summary'],'scopedAcceptance':True,'integrationTests':{'passed':1573,'files':61,'workers':2},'upstreamTests':{'passed':429,'suites':9,'mountedModeCases':15},'previousParentRed':{'failed':8,'passed':7,'scope':'Only the byte-exact old parent renderer, with current child components and mocked transport.'},'bridgeJourneys':9,'bridgeScope':'Compiled surface/handoff/synthetic-composition contracts, not full native GitLab across three engines.','strictTypes':'passed','upstreamLint':'passed','replayedCorpora':18,'rollbackSourceFiles':32,'runtimeBundleByteIdentical':True,'runtimeInputs':54,'ledgerCounts':counts,'overallCapabilityStatusChanged':False,'publicEngineApiDependencyVersionCssOrBudgetChanged':False,'visuallyReviewed':{'contacts':[item['contactSheet'] for item in review['recordings']],'primaryPNGs':[p.as_posix() for p in primary],'bridgePNGs':[p.as_posix() for p in selected],'rawVideos':'Four recordings retained locally; exact hashes in video-review/manifest.json. Videos exclude sign-in. Selected frames/sheets reviewed, not all video frames.'},'publication':'Local only; GitHub CLI signed out, hosted CI pending, registry candidate absent.','remaining':['Open modal/media/touch combinations','Large-document retention endurance','Simultaneous active composers','Broader native GitLab browsers/roles/offline/racing cases','Full package and release qualification'],'files':{name:sha(Path(name).read_bytes()) for name in files}})
write(base/'stage-files.json',files+excluded)
print(json.dumps({'verifiedFiles':len(files),'logs':len(logs),'summary':comparison['summary'],'ledgerCounts':counts,'videoFilesCommitted':0}))
