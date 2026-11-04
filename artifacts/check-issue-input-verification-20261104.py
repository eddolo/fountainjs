from pathlib import Path
import gzip
import hashlib
import json
import re
import subprocess
import tarfile
import zipfile

base = Path('artifacts')
parent = '46c420ddf069655d11fbd2db6caa00539516fc18'
digest = lambda value: hashlib.sha256(value).hexdigest()
read_json = lambda path: json.loads(Path(path).read_text(encoding='utf-8-sig'))
checks = read_json(base / 'issue-input-final-check-results-20261104.json')
assert {row['name']: row['exitCode'] for row in checks} == {
    'unit': 0, 'types': 0, 'api': 0, 'headless': 0, 'conformance': 0, 'package': 0,
    'worker': 0, 'size': 1, 'loaded-size': 0, 'latency': 1, 'direction-retention': 0, 'mapping-retention': 0,
}
unit = (base / 'issue-input-final-unit-20261104.log').read_text(encoding='utf-8-sig')
assert re.search(r'Tests\s+3898 passed', unit) and re.search(r'Test Files\s+266 passed', unit)
for name in ['scripts/check-build-budgets.mjs', 'scripts/check-performance-budgets.mjs', 'scripts/check-shared-direction-retention.mjs', 'scripts/check-position-mapping-retention.mjs']:
    assert Path(name).read_bytes().replace(b'\r\n', b'\n') == subprocess.check_output(['git', 'show', f'{parent}:{name}']).replace(b'\r\n', b'\n')
failure = read_json(base / 'issue-input-final-latency-20261104.json')
recheck = read_json(base / 'issue-input-latency-recheck-20261104.json')
assert len(failure['failures']) == 1 and '100-block server HTML p95' in failure['failures'][0]
assert recheck['failures'] == [] and failure['limits'] == recheck['limits']
size_failures = re.findall(r'^- (.+ exceeds its budget by .+)$', (base / 'issue-input-final-size-20261104.log').read_text(encoding='utf-8-sig'), re.MULTILINE)
assert len(size_failures) == 2 and all('all ESM' in row or 'all CommonJS' in row for row in size_failures)
matrix = base / 'issue-input-final-regression-browser-20261104'
assert read_json(matrix / '.last-run.json')['status'] == 'passed'
assert '12 passed' in (base / 'issue-input-final-regression-browser-20261104.log').read_text(encoding='utf-8-sig')
assert '3 passed' in (base / 'issue-input-focus-repeat-browser-20261104.log').read_text(encoding='utf-8-sig')
production = base / 'issue-input-production-browser-20261104'
assert read_json(production / '.last-run.json')['status'] == 'passed'
assert '1 passed' in (base / 'issue-input-production-browser-20261104.log').read_text(encoding='utf-8-sig')

files = []
for root in [matrix, production]:
    for path in sorted(root.rglob('*.md')):
        value = path.read_bytes()
        stored = path
        if len(value) > 100_000:
            stored = path.with_suffix('.md.gz')
            stored.write_bytes(gzip.compress(value, mtime=0))
            assert gzip.decompress(stored.read_bytes()) == value
        files.append({'path': path.as_posix(), 'storedPath': stored.as_posix(), 'kind': 'input' if path.name == 'original.md' else 'download', 'bytes': len(value), 'sha256': digest(value), 'storedSHA256': digest(stored.read_bytes())})
assert len(files) == 34 and sum(row['kind'] == 'input' for row in files) == 6
large = []
for folder in sorted(matrix.glob('*/issue-input-journey')):
    measurement = read_json(folder / 'input-measurement.json')
    observed = read_json(folder / 'observations.json')
    assert measurement['exports'] == [] and measurement['importExports'] == 0 and measurement['mountedParagraphs'] == 37
    assert observed['errors'] == [] and observed['observedRequestedExports'] == 8
    assert all(value is True for key, value in observed.items() if isinstance(value, bool))
    assert len(observed['htmlWarnings']) == 1 and len(observed['pipeWarnings']) > 1
    original, edited = (folder / 'original.md').read_bytes(), (folder / 'edited.md').read_bytes()
    raw, reader = (folder / 'raw-buffer.md').read_bytes(), (folder / 'reader.md').read_bytes()
    assert b'\r\n' in original and b'\r\n' in edited and b'\r' not in raw and raw == reader
    assert b'Edit this paragraph.XYZQ' in edited and b'Paragraph 4999 with **source** [link](/target "Original"). tail.' in edited
    assert raw.endswith(b'\n\nRaw addition.')
    large.append({'measurement': measurement, 'observations': observed})
assert len(large) == 3

visuals = []
for directory in [base / 'issue-input-visual-review-20261104', base / 'issue-input-production-visual-review-20261104']:
    for row in read_json(directory / 'capture-index.json'):
        visuals.append({**row, 'contactSHA256': digest(Path(row['contact']).read_bytes()), 'recordingContactSHA256': digest(Path(row['recordingContact']).read_bytes()), 'videoSHA256': digest(Path(row['video']).read_bytes()), 'captureSHA256': {path: digest(Path(path).read_bytes()) for path in row['sourceImages']}})
assert len(visuals) == 13 and sum(len(row['sourceImages']) for row in visuals) == 49

startup = []
with zipfile.ZipFile(next(production.rglob('trace.zip'))) as trace:
    for name in trace.namelist():
        if name.endswith('.trace'):
            rows = [json.loads(line) for line in trace.read(name).splitlines()]
            before = next((row for row in rows if row.get('type') == 'before' and row.get('params', {}).get('url') == '/issue-editor.html'), None)
            if before:
                after = next(row for row in rows if row.get('type') == 'after' and row.get('callId') == before['callId'])
                startup.append(after['endTime'] - before['startTime'])

runtime = ['src/view/view.ts', 'src/view/selection-handler.ts']
maps = [read_json(path) for path in Path('dist').glob('*.js.map')]
for name in runtime:
    values = [content for source_map in maps for source, content in zip(source_map['sources'], source_map['sourcesContent']) if source.replace('\\', '/').endswith(name)]
    assert values and all(content.replace('\r\n', '\n').encode() == Path(name).read_bytes().replace(b'\r\n', b'\n') for content in values)
archive = base / 'issue-input-tarball-20261104/fountainjs-editor-0.4.0-beta.2.tgz'
packed_files = 0
with tarfile.open(archive, 'r:gz') as package:
    for member in package:
        if member.isfile():
            path = Path(member.name.removeprefix('package/'))
            if path.as_posix() == 'package.json':
                manifest = json.loads(path.read_bytes())
                manifest.pop('packageManager')
                manifest['scripts'].pop('prepublishOnly')
                assert json.loads(package.extractfile(member).read()) == manifest
            elif path.is_file():
                assert package.extractfile(member).read() == path.read_bytes(), member.name
            if member.name.startswith('package/dist/'):
                packed_files += 1
assert packed_files == 865
packed = read_json(base / 'issue-input-packed-consumer-20261104.log')
assert packed == {'actualTarball': True, 'entries': 4, 'checks': 244, 'noFakeDOM': True, 'proofResults': [25] * 4, 'containerResults': [36] * 4}
api = read_json(base / 'issue-input-api-review-20261104.json')
assert api['publicSignaturesChanged'] is False and api['newPrivateFieldOnly'] is True
assert all(row['equalAfterRemovingOnlyNewPrivateField'] for row in api['files'])
before = read_json(base / 'boundary-repair-loaded-build-size-review-20261104.json')
after = read_json(base / 'issue-input-final-loaded-build-size-review-20261104.json')
delta = {}
for name in ['.', './core', './react', './docx']:
    a = next(row for row in before['entries'] if row['entry'] == name)
    b = next(row for row in after['entries'] if row['entry'] == name)
    delta[name] = {key: b[key] - a[key] for key in ['closureRawBytes', 'closureGzipBytes', 'closureBrotliBytes']}
assert delta['./core']['closureRawBytes'] == delta['./docx']['closureRawBytes'] == 0
assert 'runIssueInputJourney(page, info)' in Path('tests/browser/editor.spec.ts').read_text()
assert 'test-results/**/issue-input-journey/**' in Path('.github/workflows/ci.yml').read_text()

report = {'branch': 'perf/issue-export-on-demand-20261104', 'parentCommit': parent,
    'unitTests': 3898, 'unitFiles': 266, 'newUnitTests': 10, 'localChecks': checks,
    'runtimeNormalizedLFSHA256': {name: digest(Path(name).read_bytes().replace(b'\r\n', b'\n')) for name in runtime},
    'sourceMapsMatchRuntime': True, 'apiReview': api, 'packedConsumer': packed,
    'tarballSHA256': digest(archive.read_bytes()), 'archiveDistFilesMatchBuild': packed_files,
    'browserMatrix': {'recordedJourneys': 12, 'engines': ['chromium', 'firefox', 'webkit'], 'downloads': 27, 'inputs': 6, 'largeDraftJourneys': large},
    'production': {'chromiumWritingJourney': 'passed', 'downloads': 1, 'largeDocumentLatencyMeasured': False,
        'navigationMilliseconds': startup, 'startupFinding': 'Recording shows a long blank initial navigation before the editor renders. Cause and startup optimization remain open; this journey does not certify startup responsiveness.'},
    'browserFiles': files, 'visualReview': {'captures': 49, 'recordings': 13, 'sampledFramesPerRecording': 6, 'fullFrameByFramePlayback': False,
        'finding': 'Expected edits, links, tables, separate reader and narrow layout visible. Final focus/first/last model assertions pass; no extra content anomaly seen in this scope. Startup delay remains open.',
        'assets': visuals, 'rawVideoTraceAndIndividualPNGs': 'Retained locally; contact sheets and hashes retained in Git. CI collects fresh journey outputs.'},
    'performance': {'firstFinalFailures': failure['failures'], 'isolatedUnchangedRecheckFailures': recheck['failures'], 'limitsChanged': False,
        'measurementScope': 'Three beforeinput-to-two-animation-frame samples in a Vite development host; not INP, paint, or production certification.'},
    'loadedClosureDeltaBytes': delta, 'sizeAcceptance': {'limitsChanged': False, 'failures': size_failures, 'individualAndCSS': 'passed'},
    'conformance': {'default': 563, 'explicitCompleteBody': 635, 'denominator': 652, 'scoresChanged': False},
    'retainedFailures': ['issue-input-before-browser-20261104.log: module discovery assumption', 'issue-input-baseline-browser-20261104.log: eager serialization negative control',
        'issue-input-complete-chromium-20261104.log: actual virtual Ctrl+End gap', 'issue-input-navigation-chromium-20261104.log: first-mounted is not first-model fixture assumption',
        'issue-input-reopen-chromium-20261104.log: legitimate HTML compatibility warning, fixture expectation corrected',
        'issue-input-regression-browser-20261104.log: three legacy automatic-report assumptions and one Firefox far-caret insertion failure',
        'issue-input-final-latency-20261104.log: server-HTML p95 failure retained'],
    'remainingScope': ['fresh full current-head CI', 'aggregate capacity review', 'production startup delay', 'general virtual structural/atomic boundary selection',
        'remaining CommonMark', 'footnote/nested HTML/independent inline source ownership', 'full parity and release validation'],
    'fullParityOrPublicationCertified': False}
(base / 'issue-input-verification-20261104.json').write_bytes(json.dumps(report, indent=2).encode() + b'\n')
print('Verified 3898 tests, 12 desktop journeys + production journey, 28 downloads, 244 packed checks; size and startup remain open.')
