from pathlib import Path
import gzip
import hashlib
import json
import re
import subprocess
import tarfile

base = Path('artifacts')
read_json = lambda name: json.loads((base / name).read_text(encoding='utf-8-sig'))
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
checks = read_json('markdown-boundary-repair-check-results-20261104.json')
assert {x['name']: x['exitCode'] for x in checks} == {
    'unit': 0, 'types': 0, 'api': 0, 'headless': 0, 'conformance': 0,
    'package': 0, 'worker': 0, 'size': 1, 'loaded-size': 0, 'latency': 0,
    'direction-retention': 0, 'mapping-retention': 0,
}
unit = (base / 'markdown-boundary-repair-unit-20261104.log').read_text(encoding='utf-8-sig')
assert re.search(r'Tests\s+3888 passed', unit) and re.search(r'Test Files\s+266 passed', unit)
assert '3 passed' in (base / 'markdown-boundary-repair-browser-20261104.log').read_text(encoding='utf-8-sig')
assert read_json('markdown-boundary-repair-browser-20261104/.last-run.json')['status'] == 'passed'
assert read_json('markdown-boundary-repair-latency-20261104.json')['failures'] == []
for log, value in [('api', '419 declaration files'), ('headless', '122 modules'), ('worker', '25 complete source proof contracts passed')]:
    assert value in (base / f'markdown-boundary-repair-{log}-20261104.log').read_text(encoding='utf-8-sig')
packed = read_json('markdown-boundary-repair-packed-consumer-20261104.log')
assert packed == {'actualTarball': True, 'entries': 4, 'checks': 244, 'noFakeDOM': True,
    'proofResults': [25] * 4, 'containerResults': [36] * 4}
size_failures = re.findall(r'^- (.+ exceeds its budget by .+)$',
    (base / 'markdown-boundary-repair-size-20261104.log').read_text(encoding='utf-8-sig'), re.MULTILINE)
assert len(size_failures) == 2 and all('all ESM' in x or 'all CommonJS' in x for x in size_failures)
assert Path('scripts/check-build-budgets.mjs').read_bytes() == subprocess.check_output(['git', 'show', '979c670:scripts/check-build-budgets.mjs'])
files, journeys = [], []
folders = sorted((base / 'markdown-boundary-repair-browser-20261104').glob('*/boundary-repair-journey'))
assert len(folders) == 3
for folder in folders:
    observations = json.loads((folder / 'observations.json').read_text())
    assert observations['errors'] == []
    assert all(value is True for key, value in observations.items() if key not in ['engine', 'errors'])
    assert len(list(folder.glob('*.md'))) == 7
    for path in sorted(folder.glob('*.md')):
        data = path.read_bytes()
        assert b'\r\n' in data and b'\n' not in data.replace(b'\r\n', b'') and b'\r' not in data.replace(b'\r\n', b'')
        files.append({'path': path.as_posix(), 'kind': 'input' if path.name == 'original.md' else 'download',
            'bytes': len(data), 'sha256': digest(path)})
    for suffix in ['visual-review', 'recording-review']:
        assert (base / f"markdown-boundary-repair-{observations['engine']}-{suffix}-20261104.png").is_file()
    journeys.append({'observations': observations, 'videoSHA256': digest(folder.parent / 'video.webm')})
assert len(files) == 21 and sum(x['kind'] == 'download' for x in files) == 18
paths = ['src/core/importers/markdown-importer.ts', 'src/core/markdown-nested-source.ts',
    'src/core/markdown-source-boundary.ts', 'src/core/exporters/markdown-exporter.ts']
maps = [json.loads(path.read_text(encoding='utf-8')) for path in Path('dist').glob('*.js.map')]
for name in paths:
    matches = [content for source_map in maps for source, content in zip(source_map['sources'], source_map['sourcesContent'])
        if source.replace('\\', '/').endswith(name)]
    assert matches and all(content.replace('\r\n', '\n').encode() == Path(name).read_bytes().replace(b'\r\n', b'\n') for content in matches), name
archive = base / 'markdown-boundary-repair-tarball-20261104/fountainjs-editor-0.4.0-beta.2.tgz'
archive_dist_files = 0
with tarfile.open(archive, 'r:gz') as package:
    for member in package:
        if member.isfile() and member.name.startswith('package/dist/'):
            assert package.extractfile(member).read() == Path(member.name.removeprefix('package/')).read_bytes(), member.name
            archive_dist_files += 1
assert archive_dist_files == 865
baseline = base / 'markdown-source-export-proof-tarball-20261104/fountainjs-editor-0.4.0-beta.2.tgz'
assert digest(baseline) == 'e811388990beeb3611de2f6f065c99ef51676b7d45f03d3cfa1e60abdd76e1ea'
profiles = {}
for name in ['before', 'after']:
    raw = base / f'boundary-repair-cpu-20261104/{name}.cpuprofile'
    compressed = raw.with_suffix('.cpuprofile.gz')
    assert gzip.decompress(compressed.read_bytes()) == raw.read_bytes()
    profiles[name] = {'rawSHA256': digest(raw), 'gzipSHA256': digest(compressed),
        'summary': read_json(f'markdown-boundary-repair-cpu-{name}-summary-20261104.json')}
performance = read_json('markdown-boundary-repair-performance-review-20261104.json')
assert all(x[label]['retainedUnrelatedSource'] for x in performance['records'] for label in ['before', 'after'])
assert performance['baseline'] == 'actual 979c670 tarball' and performance['rejectedDraftProbe']['count'] == 1000
assert 'runMarkdownBoundaryRepairJourney(page, info)' in Path('tests/browser/editor.spec.ts').read_text()
assert 'test-results/**/boundary-repair-journey/**' in Path('.github/workflows/ci.yml').read_text()
proof = {
    'branch': 'perf/markdown-boundary-repair-20261104',
    'parentRuntimeCommit': '979c670a754422aeadd1c99861e4c7f2d62f3705',
    'runtimeSourceSHA256': {name: digest(Path(name)) for name in paths},
    'builtSourceMapMatchesCurrentRuntimeSources': True,
    'unitTests': 3888, 'unitFiles': 266, 'newParameterizedUnitTests': 3,
    'quoteAndCodeKindChangeCombinations': 9, 'additionalPortableListCombinations': 6,
    'recordedDesktopJourneys': journeys, 'downloadedMarkdownFiles': 18, 'inputMarkdownFiles': 3, 'browserFiles': files,
    'visualReview': {'editorCaptures': 12, 'sampledFramesPerRecording': 6, 'fullFrameByFramePlayback': False,
        'finding': 'Expected demotion, preserved nested quotes/links, native text edit and matching reopened document visible; no additional anomaly observed within this scope.'},
    'permanentCIJourneyRegistered': True, 'packedConsumer': packed,
    'tarballSHA256': digest(archive), 'archiveDistFilesByteEqualToVerifiedBuild': archive_dist_files,
    'actualBaselineTarballSHA256': digest(baseline), 'realWorkerdProofContracts': 25,
    'publicDeclarationFiles': 419, 'headlessSourceModules': 122,
    'conformance': {'default': 563, 'explicitCompleteBody': 635, 'denominator': 652, 'scoresChanged': False},
    'sourceExportPerformance': performance, 'sampledCPU': profiles,
    'localLatencyAndRetentionAcceptance': 'passed without changed limits',
    'sizeAcceptance': {'changedLimits': False, 'failures': size_failures, 'individualEntriesAndCSS': 'passed'},
    'remainingScope': ['other failed-draft costs', 'large-workflow input responsiveness and eager host serialization',
        'footnote source ownership', 'nested HTML-adapter ownership', 'independent inline source ownership',
        'full CommonMark', 'fresh full CI', 'aggregate size review'],
    'fullParityOrPublicationCertified': False,
}
(base / 'markdown-boundary-repair-verification-20261104.json').write_bytes((json.dumps(proof, indent=2) + '\n').encode())
print(json.dumps({key: proof[key] for key in ['unitTests', 'unitFiles', 'downloadedMarkdownFiles', 'tarballSHA256']}))
