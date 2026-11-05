from pathlib import Path
from hashlib import sha256
import json, statistics, subprocess, tarfile, gzip

base = '70be656dceb6aa24b0d1939213ffc71b85a8f0db'
def read(path): return json.loads(Path(path).read_text(encoding='utf-8-sig'))
def sha(data): return sha256(data).hexdigest()
checks = read('artifacts/server-html-final-checks-20261105.json')
assert len(checks) == 10 and {v['name']:v['exitCode'] for v in checks if v['exitCode']} == {'size': 1}
assert '3919 passed (3919)' in Path('artifacts/server-html-final-unit-20261105.log').read_text()
gate = read('artifacts/server-html-empty-rules-gate-20261105.json')
assert gate['failures'] == []
assert Path('scripts/check-performance-budgets.mjs').read_bytes() == subprocess.check_output(['git','show',base+':scripts/check-performance-budgets.mjs'])
assert Path('scripts/check-build-budgets.mjs').read_bytes() == subprocess.check_output(['git','show',base+':scripts/check-build-budgets.mjs'])
assert Path('api-surface.json').read_bytes() == subprocess.check_output(['git','show',base+':api-surface.json'])
assert '6 passed' in Path('artifacts/server-html-final-browser-20261105.log').read_text()
probe = json.loads(Path('artifacts/server-html-packed-node-20261105.log').read_text().strip())
assert probe['actualTarball'] and probe['fullModelIssueAndTokenComparisons'] == 64
archive = Path('artifacts/server-html-tarball-20261105/fountainjs-editor-0.4.0-beta.2.tgz')
count = 0
with tarfile.open(archive,'r:gz') as package:
    for member in package:
        if member.isfile() and member.name.startswith('package/dist/'):
            assert package.extractfile(member).read() == Path(member.name.removeprefix('package/')).read_bytes(), member.name
            count += 1
assert count == 865
old = read('artifacts/code-label-loaded-size-20261104.json')['entries']
new = read('artifacts/server-html-loaded-size-20261105.json')['entries']
deltas = {}
for item in new:
    if item['entry'] not in ['.','./core','./react','./docx','./html/server']: continue
    previous = next(row for row in old if row['entry'] == item['entry'])
    deltas[item['entry']] = {k:item[k]-previous[k] for k in ['closureRawBytes','closureGzipBytes','closureBrotliBytes']}
paired = []
for row in read('artifacts/server-html-empty-rules-paired-20261105.json')['results']:
    assert row['completeModelAndIssuesEqual']
    paired.append({'size':row['size'], 'medianWallMs': {name:statistics.median(v['wallMs'] for v in row['samples'] if v['name']==name) for name in ['parent','candidate']}})
profiles = []
for version in ['before','after']:
    path = Path(f'artifacts/server-html-cpu-{version}-20261105/server.cpuprofile.gz')
    raw = gzip.decompress(path.read_bytes())
    assert sha(raw) == sha(path.with_suffix('').read_bytes())
    profiles.append({'version':version,'path':path.as_posix(),'rawSha256':sha(raw),'hotspots':f'artifacts/server-html-cpu-{version}-20261105/hotspots.json'})
sources = []
for path in sorted(Path('artifacts/server-html-conversion-browser-20261105').rglob('*')):
    if path.is_file() and path.suffix in ['.md','.json']:
        sources.append({'path':path.as_posix(),'sha256':sha(path.read_bytes()),'bytes':path.stat().st_size})
report = {'baseCommit':base,'releaseCertified':False,'apiChanged':False,'acceptanceLimitsChanged':False,
  'implementation':'Two live empty-rule guards only; no rule-result/schema/tree cache, wrapper cache rejected.',
  'unit':{'passed':3919,'files':268}, 'checks':checks,'declarations':419,'headlessModules':122,
  'package':{'sha256':sha(archive.read_bytes()),'distFilesMatch':count,'probe':probe},
  'pairedComparison':paired,'performanceGate':{'path':'artifacts/server-html-empty-rules-gate-20261105.json','failures':gate['failures'],'scope':'One unchanged current-code gate pass. Prior timing failures are retained; their entire variability is not explained or certified resolved.'},
  'profiles':profiles,'rejectedExperiment':{'patch':'artifacts/server-html-rejected-wrapper-cache-20261105.patch','comparison':'artifacts/server-html-wrappers-paired-20261105.json','reason':'No reliable paired latency benefit; not included in runtime code.'},
  'sizeDeltaBytes':deltas,
  'visualReview':{'journeys':6,'engines':['chromium','firefox','webkit'],'formats':['html','markdown'],'captureContactSheetsInspected':6,'capturesInSheets':18,'sampledRecordings':6,'framesPerRecording':6,'scope':'Bounded per-file policy/import/edit/round-trip workflows. Samples include the initial browser test fixture; not every video frame or general original-file fidelity.'},
  'retainedSources':sources,
  'open':['Broader timing variability and full fresh CI','Aggregate ESM/CJS budgets','Structural range/terminal-image selection','Earlier intermittent download timeout','Mobile suggestion-menu reliability','Remaining standards/import/export and production parity']}
Path('artifacts/server-html-verification-20261105.json').write_bytes(json.dumps(report,indent=2).encode()+b'\n')
Path('artifacts/server-html-source-paths-20261105.txt').write_bytes(('\n'.join(row['path'] for row in sources)+'\n').encode())
print(json.dumps({'unit':report['unit'],'archiveDistFilesMatch':count,'packageCases':64,'sources':len(sources),'sizeDeltaBytes':deltas}))
