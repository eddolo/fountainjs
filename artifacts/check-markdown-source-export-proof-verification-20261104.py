from pathlib import Path
import gzip
import hashlib
import json
import re
import tarfile

base = Path('artifacts')
read_json = lambda name: json.loads((base / name).read_text(encoding='utf-8-sig'))
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
checks = read_json('markdown-source-export-proof-check-results-20261104.json')
assert {x['name']: x['exitCode'] for x in checks} == {
    'unit': 0, 'types': 0, 'api': 0, 'headless': 0, 'conformance': 0,
    'package': 0, 'worker': 0, 'size': 1, 'loaded-size': 0, 'latency': 0,
    'direction-retention': 0, 'mapping-retention': 0,
}
unit = (base / 'markdown-source-export-proof-unit-20261104.log').read_text(encoding='utf-8-sig')
assert re.search(r'Tests\s+3885 passed', unit) and re.search(r'Test Files\s+266 passed', unit)
assert 'Observer failed' in (base / 'markdown-source-proof-loss-before-20261104.log').read_text(encoding='utf-8-sig')
assert 'Invalid node invariant: doc' in (base / 'markdown-source-proof-focused-20261104.log').read_text(encoding='utf-8-sig')
assert re.search(r'Tests\s+9 passed', (base / 'markdown-source-proof-focused-final-20261104.log').read_text(encoding='utf-8-sig'))
assert '6 passed' in (base / 'markdown-source-export-proof-final-browser-20261104.log').read_text(encoding='utf-8-sig')
assert '1 failed' in (base / 'markdown-source-export-proof-browser-20261104.log').read_text(encoding='utf-8-sig')
assert '5 passed' in (base / 'markdown-source-export-proof-browser-20261104.log').read_text(encoding='utf-8-sig')
assert '1 passed' in (base / 'markdown-source-proof-webkit-repeat-20261104.log').read_text(encoding='utf-8-sig')
assert read_json('markdown-source-export-proof-final-browser-20261104/.last-run.json')['status'] == 'passed'
assert read_json('markdown-source-export-proof-latency-20261104.json')['failures'] == []
assert '419 declaration files' in (base / 'markdown-source-export-proof-api-20261104.log').read_text(encoding='utf-8-sig')
assert '122 modules' in (base / 'markdown-source-export-proof-headless-20261104.log').read_text(encoding='utf-8-sig')
assert '10 complete source proof contracts passed' in (base / 'markdown-source-export-proof-worker-20261104.log').read_text(encoding='utf-8-sig')
packed = read_json('markdown-source-export-proof-packed-consumer-20261104.log')
assert packed == {'actualTarball': True, 'entries': 4, 'checks': 184, 'noFakeDOM': True,
    'proofResults': [10] * 4, 'containerResults': [36] * 4}
size_log = (base / 'markdown-source-export-proof-size-20261104.log').read_text(encoding='utf-8-sig')
size_failures = re.findall(r'^- (.+ exceeds its budget by .+)$', size_log, re.MULTILINE)
assert len(size_failures) == 2 and all('all ESM' in x or 'all CommonJS' in x for x in size_failures)
files = []
journeys = []
for kind, subfolder in [('issue', 'issue-html-source-journey'), ('container', 'container-reference-journey')]:
    folders = sorted((base / 'markdown-source-export-proof-final-browser-20261104').glob('*/' + subfolder))
    assert len(folders) == 3
    for folder in folders:
        observations = json.loads((folder / 'observations.json').read_text())
        assert observations['errors'] == []
        assert all(value is True for key, value in observations.items() if key not in ['engine', 'errors'])
        engine = observations['engine']
        assert len(list(folder.glob('*.md'))) == (5 if kind == 'issue' else 10)
        for path in sorted(folder.glob('*.md')):
            data = path.read_bytes()
            assert b'\r\n' in data and b'\n' not in data.replace(b'\r\n', b'') and b'\r' not in data.replace(b'\r\n', b'')
            files.append({'path': path.as_posix(), 'kind': 'input' if path.name in ['original.md', 'tasks-original.md'] else 'download',
                'bytes': len(data), 'sha256': digest(path)})
        for suffix in ['visual-review', 'recording-review']:
            assert (base / f'markdown-source-proof-{kind}-{engine}-{suffix}-20261104.png').is_file()
        journeys.append({'kind': kind, 'engine': engine, 'observations': observations,
            'videoSHA256': digest(folder.parent / 'video.webm')})
assert len(files) == 45 and sum(x['kind'] == 'download' for x in files) == 36
paths = ['src/core/importers/markdown-importer.ts', 'src/core/markdown-nested-source.ts',
    'src/core/markdown-source-boundary.ts', 'src/core/exporters/markdown-exporter.ts']
maps = [json.loads(path.read_text(encoding='utf-8')) for path in Path('dist').glob('*.js.map')]
for name in paths:
    matches = [content for source_map in maps for source, content in zip(source_map['sources'], source_map['sourcesContent'])
        if source.replace('\\', '/').endswith(name)]
    assert matches and all(content.replace('\r\n', '\n').encode() == Path(name).read_bytes().replace(b'\r\n', b'\n') for content in matches), name
archive = base / 'markdown-source-export-proof-tarball-20261104/fountainjs-editor-0.4.0-beta.2.tgz'
archive_dist_files = 0
with tarfile.open(archive, 'r:gz') as package:
    for member in package:
        if member.isfile() and member.name.startswith('package/dist/'):
            assert package.extractfile(member).read() == Path(member.name.removeprefix('package/')).read_bytes(), member.name
            archive_dist_files += 1
assert archive_dist_files > 419
baseline = base / 'markdown-container-references-tarball-20261104/fountainjs-editor-0.4.0-beta.2.tgz'
assert digest(baseline) == '6e0e2e1e30b0b6141163827a2a426faba6d68b0adb21e9bafb71c742efd2be24'
profiles = {}
for name in ['before', 'after']:
    raw = base / f'source-export-cpu-20261104/{name}.cpuprofile'
    compressed = raw.with_suffix('.cpuprofile.gz')
    assert gzip.decompress(compressed.read_bytes()) == raw.read_bytes()
    profiles[name] = {'rawSHA256': digest(raw), 'gzipSHA256': digest(compressed),
        'summary': read_json(f'source-export-cpu-{name}-summary-20261104.json')}
performance = read_json('markdown-source-export-proof-performance-review-20261104.json')
assert [x['count'] for x in performance['records']] == [100, 1000, 5000]
assert all(x[label]['retainedUnrelatedSource'] for x in performance['records'] for label in ['before', 'after'])
assert performance['rejectedDraftProbe']['count'] == 1000
proof = {
    'branch': 'perf/markdown-source-export-20261104',
    'parentRuntimeCommit': 'a658e3087acca3e8c349cae080f27053e9046303',
    'runtimeSourceSHA256': {name: digest(Path(name)) for name in paths},
    'builtSourceMapMatchesCurrentRuntimeSources': True,
    'unitTests': 3885, 'unitFiles': 266, 'newUnitCases': 9,
    'lossObserverBeforeFix': 'Confirmed throwing observational callback aborted an otherwise proven export.',
    'initialNewFixtureFailure': 'Invalid synthetic page-settings default; replaced with a valid direction default. No validator was weakened.',
    'initialBrowserFailure': 'One WebKit 90-second timeout at actionability before the download click; root cause unestablished. Separate repeat and all six final journeys pass without forced clicks or longer timeouts.',
    'recordedDesktopJourneys': journeys,
    'downloadedMarkdownFiles': 36, 'inputMarkdownFiles': 9, 'browserFiles': files,
    'visualReview': {'editorCaptures': 24, 'sampledFramesPerRecording': 6, 'fullFrameByFramePlayback': False,
        'finding': 'Expected content, links, quote unwrapping, task state and reader content visible; no additional anomaly observed within this scope.'},
    'packedConsumer': packed, 'tarballSHA256': digest(archive),
    'archiveDistFilesByteEqualToVerifiedBuild': archive_dist_files,
    'actualBaselineTarballSHA256': digest(baseline), 'realWorkerdProofContracts': 10,
    'publicDeclarationFiles': 419, 'headlessSourceModules': 122,
    'conformance': {'default': 563, 'explicitCompleteBody': 635, 'denominator': 652, 'scoresChanged': False},
    'sourceExportPerformance': performance, 'sampledCPU': profiles,
    'localLatencyAndRetentionAcceptance': 'passed without changed limits',
    'sizeAcceptance': {'changedLimits': False, 'failures': size_failures, 'individualEntriesAndCSS': 'passed'},
    'remainingScope': ['rejected-draft export cost', 'footnote source ownership', 'nested HTML-adapter ownership',
        'independent inline source ownership', 'full CommonMark', 'fresh full CI', 'aggregate size review'],
    'fullParityOrPublicationCertified': False,
}
(base / 'markdown-source-export-proof-verification-20261104.json').write_bytes((json.dumps(proof, indent=2) + '\n').encode())
print(json.dumps({key: proof[key] for key in ['unitTests', 'unitFiles', 'downloadedMarkdownFiles', 'tarballSHA256', 'archiveDistFilesByteEqualToVerifiedBuild']}))
