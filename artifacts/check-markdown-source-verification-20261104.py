from pathlib import Path
import hashlib, json, re, subprocess
base=Path('artifacts')
read=lambda name:(base/name).read_text(encoding='utf-8-sig')
assert re.search(r'Tests\s+3656 passed',read('markdown-source-boundaries-full-unit-20261104.log'))
assert re.search(r'Test Files\s+259 passed',read('markdown-source-boundaries-full-unit-20261104.log'))
assert '3 passed' in read('markdown-source-boundaries-final-browser-20261104.log')
assert '419 declaration files' in read('markdown-source-boundaries-verified-api-20261104.log')
assert '121 modules' in read('markdown-source-boundaries-headless-20261104.log')
assert 'No problems found' in read('markdown-source-boundaries-attw-20261104.log')
assert '635/652' in read('markdown-source-boundaries-verified-conformance-20261104.log')
assert '563/652' in read('markdown-source-boundaries-verified-conformance-20261104.log')
packed=json.loads(read('markdown-source-boundaries-packed-consumer-20261104.log'))
assert packed=={'actualTarball':True,'entries':4,'checks':48,'noFakeDOM':True,'results':[12]*4}
assert '12 parser-owned Markdown source-boundary contracts passed' in read('markdown-source-boundaries-worker-20261104.log')
latency=json.loads(read('markdown-source-boundaries-final-performance-20261104.json'))
control=json.loads(read('markdown-source-boundaries-baseline-performance-20261104.json'))
assert latency['limits']==control['limits']
assert latency['failures'] and control['failures']
unchanged=subprocess.check_output(['git','diff','f8bff23','--name-only','--','scripts/check-build-budgets.mjs','scripts/check-performance-budgets.mjs','scripts/check-shared-direction-retention.mjs','scripts/check-position-mapping-retention.mjs'],text=True)
assert not unchanged.strip(),unchanged
ci=json.loads(read('layout-approved-cloud-ci-20261104.json'))
native=json.loads(read('layout-approved-cloud-native-20261104.json'))
assert ci['headSha']==native['headSha']=='f8bff232d034d3e39a43cec991fa132c088ef9bd'
assert ci['conclusion']==native['conclusion']=='success'
assert all(job['conclusion']=='success' for job in ci['jobs'])
assert '850 passed' in read('layout-approved-cloud-browser-20261104.log')
files=['src/core/importers/markdown-importer.ts','src/core/exporters/markdown-exporter.ts','src/core/markdown-source-boundary.ts']
report={
 'branch':'feat/markdown-source-boundaries-20261104',
 'runtimeSourceSHA256':{name:hashlib.sha256(Path(name).read_bytes()).hexdigest() for name in files},
 'unitTests':3656,'unitFiles':259,'newBoundaryCases':28,'permutationChecks':90,
 'recordedDesktopJourneys':3,'downloadedMarkdownFiles':18,
 'visualReview':{'screenshots':'edited/type-changed states in all three engines','recordings':'six sampled frames per engine; complete files retained','notFullFrameByFramePlayback':True},
 'packedConsumer':packed,
 'tarballSHA256':hashlib.sha256((base/'markdown-source-boundaries-tarball-20261104/fountainjs-editor-0.4.0-beta.2.tgz').read_bytes()).hexdigest(),
 'realWorkerdContracts':12,'publicDeclarationFiles':419,'headlessSourceModules':121,
 'conformance':{'default':563,'explicitCompleteBody':635,'denominator':652,'scoresChanged':False},
 'latencyAcceptance':'pending: original and paired current/control failures retained',
 'currentLatencyFailures':latency['failures'],'previousPackedControlFailures':control['failures'],
 'retentionChecks':{'sharedDirection':'passed','positionMapping':'passed'},
 'sizeAcceptance':'two aggregate ceilings fail; no additional limit changes',
 'parentLayoutCI':{'commit':ci['headSha'],'ciRun':ci['databaseId'],'nativeRun':native['databaseId'],'allJobs':'success','remainingMatrixPassed':850,'skipped':16},
 'nestedSourceOwnershipComplete':False,'fullParityOrPublicationCertified':False,
}
(base/'markdown-source-boundaries-verification-20261104.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'units':report['unitTests'],'browserJourneys':3,'packedContracts':48,'latencyAcceptance':report['latencyAcceptance'],'parentLayoutCI':'success'}))
