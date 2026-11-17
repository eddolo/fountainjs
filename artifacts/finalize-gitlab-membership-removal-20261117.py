from pathlib import Path
import base64,hashlib,json,re,subprocess
root=Path.cwd();base=Path('artifacts/gitlab-compatibility/membership-removal-20261117')
sha=lambda data:hashlib.sha256(data).hexdigest()
read=lambda path:json.loads(Path(path).read_text(encoding='utf-8'))
def write(path,value):Path(path).write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8',newline='\n')
comparison=read(base/'comparison-final/report.json')
assert comparison['summary']=={'parity':52,'improvement':10,'regression':0,'shared-limitation':2,'incomplete':0,'total':64}
assert comparison['environment']['matched'] and comparison['comparisonComplete'] and comparison['regressionGate']['passed']
assert not comparison['featureAcceptance']['passed']
shared=[(row['case'],row['invariant']) for row in comparison['rows'] if row['classification']=='shared-limitation']
assert shared==[('developer-removed-text','removal.render'),('developer-removed-text','removal.graph.deniedAfterInspection')]
for item in comparison['inputs'].values():assert sha(Path(item['path']).read_bytes())==item['sha256']
for path,expected in comparison['comparatorHashes'].items():assert sha(Path(path).read_bytes())==expected
runs=[]
for name in ['original-4','fountain-4']:
 run=read(base/name/'report.json');assert run['collectionComplete'] and not run['errors']
 assert sha(Path(run['fixturePath']).read_bytes())==run['fixtureHash']
 for path,expected in run['harnessHashes'].items():assert sha(Path(path).read_bytes())==expected,path
 for item in run['observations']:
  assert item['status']=='observed' and item['actor']['isAdmin'] is False and item['actor']['id']!=item['setup']['authorId']
  assert item['cleanupMembership']['accessLevel']==10 and not item['actorErrors']
  assert not any(member['id']==item['actor']['id'] for member in item['membersAfterRemoval'])
  assert item['accessBeforeRemoval']['restDescription']==item['confirmedSource']
  assert item['accessAfterRemoval']['restStatus'] in [403,404] and not item['accessAfterRemoval']['itemPresent']
  assert item['removedRESTWriteStatus'] in [403,404]
  assert item['afterRESTProbe']['description']==item['confirmedSaved']['description']
  assert all(receipt['loadingCount']==0 for receipt in item['sourceInspections'])
  if name=='fountain-4':
   assert item['deniedSaveReported'] and item['draftRetainedAfterDenial'] and item['draftRecoveredAfterReload'] and item['finalReopenExact']
   assert item['retainedSource']==item['pendingSource']==item['recoveredSource']==item['finalReopenedSource']
   if item['input']['pendingMode']=='empty':assert item['pendingSource']=='' and item['finalEmptyStored'] and item['finalSaved']['description'] in ['',None]
 runs.append(run)
assert [item['actor'] for item in runs[0]['observations']]==[item['actor'] for item in runs[1]['observations']]
archive=read(base/'instrument-before-readiness/manifest.json')
for path,item in archive['files'].items():assert sha(base64.b64decode(item['base64']))==item['sha256']
for name in ['comparison-before-repair','comparison-first-repair']:
 old=read(base/name/'report.json')
 for item in old['inputs'].values():assert sha(Path(item['path']).read_bytes())==item['sha256']
 for path,expected in old['comparatorHashes'].items():assert archive['files'][path]['sha256']==expected
before=read(base/'production-before-repair/manifest.json')
for item in before['files'].values():assert sha(base64.b64decode(item['base64']))==item['sha256']
old_runtime=json.loads(base64.b64decode(before['files']['artifacts/gitlab-native-runtime/build.json']['base64']))
runtime=read('artifacts/gitlab-native-runtime/build.json');assert runtime['bytes']-old_runtime['bytes']==532
bundle=Path('artifacts/gitlab-native-runtime/fountain-runtime.mjs').read_bytes();assert sha(bundle)==runtime['sha256'] and len(bundle)==runtime['bytes']
for path,expected in runtime['inputs'].items():assert sha(Path(path).read_bytes())==expected,path
install=read('artifacts/gitlab-native-browser-install/install.json');assert install['formatVersion']==16 and len(install['files'])==32 and not install.get('restored')
assert install['nativeRuntime']==runtime
upstream=Path('//wsl.localhost/Ubuntu/home/eddolo/.cache/fountainjs-gitlab-product/source')
for path,expected in install['files'].items():assert sha((upstream/path).read_bytes())==expected,path
rollback=read(base/'rollback/checks.json');assert rollback['passed'] and rollback['allReinstalledFileDigestsExact']
assert rollback['hostParentRestoredByteExact'] and rollback['preparedDescriptionRestoredByteExact']
replay=read(base/'prior-corpus-replay-final.json');assert len(replay['checks'])==17
assert replay['comparatorSha256']==sha(Path('integrations/gitlab/testing/compatibility.mjs').read_bytes())
assert not subprocess.check_output(['git','diff','HEAD','--name-only','--','src','package.json','pnpm-lock.yaml','scripts/check-build-budgets.mjs'],text=True).strip()
assert re.search(r'Tests\s+1567 passed',Path('artifacts/gitlab-membership-removal-integration-final-20261117.log').read_text())
assert '194 passed' in Path('artifacts/gitlab-membership-removal-upstream-green-20261117.log').read_text()
assert re.search(r'Tests\s+8 failed',Path('artifacts/gitlab-membership-removal-boundaries-red-run2-20261117.log').read_text())
assert re.search(r'Tests\s+65 passed',Path('artifacts/gitlab-membership-removal-boundaries-green-20261117.log').read_text())
assert re.search(r'Tests:\s+6 failed',Path('artifacts/gitlab-membership-removal-upstream-red-20261117.log').read_text())
assert not Path('artifacts/gitlab-membership-removal-types-final-20261117.log').read_text().strip()
logs={};logdir=base/'logs';logdir.mkdir(exist_ok=True)
secret=re.compile(r'(?:gh[pousr]_[a-zA-Z0-9]{25,}|glpat-[a-zA-Z0-9_-]{15,})')
for path in sorted(Path('artifacts').glob('gitlab-membership-removal-*.log')):
 raw=path.read_bytes();text=raw.decode('utf-8');assert not secret.search(text),path
 readable=text.replace('\r\n','\n').replace('\t',r'\t')
 readable=re.sub(r' +$',lambda match:r'\x20'*len(match.group()),readable,flags=re.M).rstrip('\n')+'\n'
 target=logdir/(path.stem+'.txt');target.write_text(readable,encoding='utf-8',newline='\n')
 logs[path.name]={'rawSha256':sha(raw),'rawBase64':base64.b64encode(raw).decode(),'readablePath':target.as_posix(),'readableSha256':sha(target.read_bytes())}
write(logdir/'manifest.json',{'scope':'Exact raw bytes encoded in base64; readable logs normalize CRLF and escape tabs/trailing spaces.','logs':logs})
reviewed=[base/'original-4/developer-removed-text-save-denied.png',base/'original-4/developer-removed-empty-reopened.png',base/'fountain-2/developer-removed-empty-save-denied.png',base/'fountain-4/developer-removed-text-save-denied-before-source.png',base/'fountain-4/developer-removed-text-save-denied.png',base/'fountain-4/developer-removed-text-reopened.png',base/'fountain-4/developer-removed-empty-save-denied-before-source.png',base/'fountain-4/developer-removed-empty-reopened.png']
changed=subprocess.check_output(['git','diff','HEAD','--name-only'],text=True).splitlines()
changed=[name for name in changed if name not in [(base/'validation.json').as_posix(),(base/'stage-files.json').as_posix()]]
additions=['integrations/gitlab/fixtures/compatibility-access-removal.json','integrations/gitlab/COMPATIBILITY_MEMBERSHIP_REMOVAL_RESULTS.md','artifacts/replay-gitlab-membership-removal-20261117.mjs','artifacts/check-gitlab-membership-removal-rollback-20261117.mjs','artifacts/finalize-gitlab-membership-removal-20261117.py']
evidence=[p.as_posix() for p in base.rglob('*') if p.is_file() and p.suffix in ['.json','.md','.txt'] and p.name not in ['validation.json','stage-files.json']]
files=sorted(set(changed+additions+evidence+[p.as_posix() for p in reviewed]))
for path in files:
 if not path.endswith('.png'):assert not secret.search(Path(path).read_text(encoding='utf-8')),path
validation={'date':'2026-11-17','parentRevision':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'scope':'Two actual non-author full-membership-removal workflows. Correlated requirements, not full GitLab parity.','acceptedPair':['original-4','fountain-4'],'summary':comparison['summary'],'regressionGate':comparison['regressionGate'],'featureAcceptance':comparison['featureAcceptance'],'sharedFailure':shared,'integrationTests':{'passed':1567,'files':60,'workers':2},'upstreamComponentTests':194,'upstreamLint':'passed','strictTypes':'passed','focusedBoundaryRed':8,'focusedBoundaryGreen':65,'upstreamNewRedRegressions':6,'previousCorpusInterpretationReplay':17,'sourceRollbackFiles':32,'runtimeBytesAdded':532,'publicEngineApiDependencyVersionCssOrBudgetsChanged':False,'visuallyReviewedPNGs':[p.as_posix() for p in reviewed],'visualScope':'Selected actual PNGs and exact source receipts. Collapsed retained-source textarea was not observed; null in that optional receipt is not an empty-value claim.','excluded':'Earlier instruments and pre-loading graph captures are diagnostic only. Their reports and available exact instruments remain retained.','publication':'Not pushed or published; GitHub CLI signed out. Hosted CI remains pending.','files':{path:sha(Path(path).read_bytes()) for path in files}}
write(base/'validation.json',validation);write(base/'stage-files.json',files+[(base/'validation.json').as_posix(),(base/'stage-files.json').as_posix()])
print(json.dumps({'verifiedFiles':len(files),'rawLogs':len(logs),'reviewedPNGs':len(reviewed),'summary':comparison['summary'],'fullFeatureAcceptance':False}))
