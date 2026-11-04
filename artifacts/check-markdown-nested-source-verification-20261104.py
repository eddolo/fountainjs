from pathlib import Path
import hashlib
import json
import re

base = Path('artifacts')
read_json = lambda name: json.loads((base / name).read_text(encoding='utf-8-sig'))
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
checks = read_json('markdown-nested-source-check-results-20261104.json')
assert {item['name']: item['exitCode'] for item in checks} == {
    'units': 0, 'types': 0, 'api': 0, 'headless': 0, 'conformance': 0,
    'package': 0, 'worker': 0, 'size': 1,
}
assert all(item['exitCode'] == 0 for item in read_json('markdown-nested-source-runtime-results-20261104.json'))
unit_log = (base / 'markdown-nested-source-units-20261104.log').read_text(encoding='utf-8-sig')
assert re.search(r'Tests\s+3678 passed', unit_log)
assert re.search(r'Test Files\s+260 passed', unit_log)
assert '3 passed' in (base / 'markdown-nested-source-browser-final-20261104.log').read_text(encoding='utf-8-sig')
assert read_json('markdown-nested-source-latency-20261104.json')['failures'] == []
packed = read_json('markdown-nested-source-packed-consumer-20261104.log')
assert packed == {'actualTarball': True, 'entries': 4, 'checks': 48, 'noFakeDOM': True, 'results': [12] * 4}
size_log = (base / 'markdown-nested-source-size-20261104.log').read_text(encoding='utf-8-sig')
size_failures = re.findall(r'^- (.+ exceeds its budget by .+)$', size_log, re.MULTILINE)
assert len(size_failures) == 2 and all('all ESM' in value or 'all CommonJS' in value for value in size_failures)
files = []
for folder in sorted((base / 'markdown-nested-source-browser-20261104').glob('*/nested-source-journey')):
    observations = json.loads((folder / 'observations.json').read_text())
    assert observations['errors'] == [] and observations['nativeTaskCheckboxRetained']
    assert observations['editedFullModelReopened'] and observations['undoOriginalExact'] and observations['redoExact']
    originals = {'original.md', 'tasks-original.md'}
    assert len(list(folder.glob('*.md'))) == 8
    for path in sorted(folder.glob('*.md')):
        data = path.read_bytes()
        assert b'\r\n' in data and b'\n' not in data.replace(b'\r\n', b'') and b'\r' not in data.replace(b'\r\n', b'')
        files.append({'path': path.as_posix(), 'kind': 'input' if path.name in originals else 'download',
            'bytes': len(data), 'sha256': digest(path)})
assert len(files) == 24 and sum(item['kind'] == 'download' for item in files) == 18
(base / 'markdown-nested-source-browser-files-20261104.json').write_text(json.dumps(files, indent=2) + '\n')
runtime_paths = ['src/core/editing-provenance.ts', 'src/core/exporters/markdown-exporter.ts',
    'src/core/importers/markdown-importer.ts', 'src/core/markdown-nested-source.ts', 'src/core/markdown-source-boundary.ts']
proof = {
    'branch': 'feat/markdown-nested-source-20261104',
    'parentSourceCommit': 'ec07be0f8cc6d9f787db633aa743e9d5d34fbc15',
    'runtimeSourceSHA256': {name: digest(Path(name)) for name in runtime_paths},
    'unitTests': 3678, 'unitFiles': 260, 'newNestedCases': 22,
    'recordedDesktopJourneys': 3, 'downloadedMarkdownFiles': 18, 'inputMarkdownFiles': 6,
    'visualReview': {'editorCaptures': 12, 'sampledFramesPerRecording': 6, 'fullFrameByFramePlayback': False},
    'packedConsumer': packed,
    'tarballSHA256': digest(base / 'markdown-nested-source-tarball-20261104/fountainjs-editor-0.4.0-beta.2.tgz'),
    'realWorkerdNestedContracts': 12, 'publicDeclarationFiles': 419, 'headlessSourceModules': 122,
    'conformance': {'default': 563, 'explicitCompleteBody': 635, 'denominator': 652, 'scoresChanged': False},
    'localLatencyAndRetentionAcceptance': 'passed without changed limits; prior parent failures retained separately',
    'sizeAcceptance': {'changedLimits': False, 'failures': size_failures, 'individualEntriesAndCSS': 'passed'},
    'sourceExportPerformance': read_json('markdown-nested-source-performance-review-20261104.json'),
    'remainingScope': ['inline ownership', 'nested structural retention', 'reference/footnote scope ownership',
        'external HTML projection ownership', 'full CommonMark', 'fresh full CI', 'aggregate size review'],
    'fullParityOrPublicationCertified': False,
}
(base / 'markdown-nested-source-verification-20261104.json').write_text(json.dumps(proof, indent=2) + '\n')
print(json.dumps({key: proof[key] for key in ['unitTests', 'unitFiles', 'downloadedMarkdownFiles', 'tarballSHA256']}))
