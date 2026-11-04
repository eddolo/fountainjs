from pathlib import Path
import hashlib
import json
import re

base = Path('artifacts')
read_json = lambda name: json.loads((base / name).read_text(encoding='utf-8-sig'))
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
checks = read_json('markdown-nested-references-check-results-20261104.json')
assert {item['name']: item['exitCode'] for item in checks} == {
    'unit': 0, 'types': 0, 'api': 0, 'headless': 0, 'conformance': 0, 'package': 0,
    'worker': 0, 'size': 1, 'loaded-size': 1, 'latency': 0, 'direction-retention': 0, 'mapping-retention': 0,
}
unit_log = (base / 'markdown-nested-references-unit-20261104.log').read_text(encoding='utf-8-sig')
assert re.search(r'Tests\s+3840 passed', unit_log) and re.search(r'Test Files\s+264 passed', unit_log)
assert '3 passed' in (base / 'markdown-nested-references-browser-20261104.log').read_text(encoding='utf-8-sig')
assert read_json('markdown-nested-references-latency-20261104.json')['failures'] == []
packed = read_json('markdown-nested-references-packed-consumer-20261104.log')
assert packed == {'actualTarball': True, 'entries': 4, 'checks': 168, 'noFakeDOM': True, 'results': [42] * 4}
assert '42 nested reference source contracts passed' in (base / 'markdown-nested-references-worker-20261104.log').read_text(encoding='utf-8-sig')
assert 'ENOENT' in (base / 'markdown-nested-references-loaded-size-20261104.log').read_text(encoding='utf-8-sig')
closure = read_json('nested-reference-loaded-build-size-review-20261104.json')
assert len(closure['entries']) > 4 and closure['acceptanceLimitsChanged'] is False
assert '736.1' in (base / 'markdown-nested-references-loaded-size-corrected-20261104.log').read_text(encoding='utf-8-sig')
size_log = (base / 'markdown-nested-references-size-20261104.log').read_text(encoding='utf-8-sig')
size_failures = re.findall(r'^- (.+ exceeds its budget by .+)$', size_log, re.MULTILINE)
assert len(size_failures) == 2 and all('all ESM' in value or 'all CommonJS' in value for value in size_failures)
counterfactual = read_json('markdown-nested-references-counterfactual-20261104.json')
assert counterfactual['baselineStopsAtFirstFailure'] and counterfactual['currentChecks'] == 42
files = []
folders = sorted((base / 'markdown-nested-references-browser-20261104').glob('*/nested-reference-journey'))
assert len(folders) == 3
for folder in folders:
    observations = json.loads((folder / 'observations.json').read_text())
    for name in ['nativeTyping', 'untouchedNestedSourceRetained', 'referenceDestinationsAndTitlesRetained',
        'undoOriginalExact', 'redoExact', 'nativeTaskCheckboxRetained', 'duplicateDefinitionPrecedenceRetained',
        'actualDownloadUploadedAgain', 'editedFullModelReopened', 'CRLFDownloadsRetained']:
        assert observations[name] is True
    assert observations['errors'] == [] and len(list(folder.glob('*.md'))) == 8
    for path in sorted(folder.glob('*.md')):
        data = path.read_bytes()
        assert b'\r\n' in data and b'\n' not in data.replace(b'\r\n', b'') and b'\r' not in data.replace(b'\r\n', b'')
        files.append({'path': path.as_posix(), 'kind': 'input' if path.name in ['original.md', 'tasks-original.md'] else 'download',
            'bytes': len(data), 'sha256': digest(path)})
assert len(files) == 24 and sum(item['kind'] == 'download' for item in files) == 18
paths = ['src/core/importers/markdown-importer.ts', 'src/core/markdown-nested-source.ts',
    'src/core/markdown-source-boundary.ts', 'src/core/exporters/markdown-exporter.ts']
maps = [json.loads(path.read_text(encoding='utf-8')) for path in Path('dist').glob('*.js.map')]
for name in paths:
    matches = [content for source_map in maps for source, content in zip(source_map['sources'], source_map['sourcesContent'])
        if source.replace('\\', '/').endswith(name)]
    assert matches and all(content.replace('\r\n', '\n').encode() == Path(name).read_bytes().replace(b'\r\n', b'\n') for content in matches), name
for engine in ['chromium', 'firefox', 'webkit']:
    assert (base / f'markdown-nested-references-{engine}-visual-review-20261104.png').is_file()
    assert (base / f'markdown-nested-references-{engine}-recording-review-20261104.png').is_file()
proof = {
    'branch': 'feat/markdown-nested-reference-source-20261104',
    'parentAuditCommit': 'c78121b', 'parentRuntimeCommit': 'a9db185340912ed8ad6cc8527a7c90b47faa10d9',
    'runtimeSourceSHA256': {name: digest(Path(name)) for name in paths},
    'builtSourceMapMatchesCurrentRuntimeSources': True,
    'unitTests': 3840, 'unitFiles': 264, 'newCases': 53,
    'recordedDesktopJourneys': 3, 'downloadedMarkdownFiles': 18, 'inputMarkdownFiles': 6,
    'visualReview': {'editorCaptures': 12, 'sampledFramesPerRecording': 6, 'fullFrameByFramePlayback': False},
    'browserFiles': files, 'packedConsumer': packed,
    'tarballSHA256': digest(base / 'markdown-nested-references-tarball-20261104/fountainjs-editor-0.4.0-beta.2.tgz'),
    'actualParentSourceRetentionCounterfactual': counterfactual,
    'realWorkerdContracts': 42, 'publicDeclarationFiles': 419, 'headlessSourceModules': 122,
    'conformance': {'default': 563, 'explicitCompleteBody': 635, 'denominator': 652, 'scoresChanged': False},
    'localLatencyAndRetentionAcceptance': 'passed without changed limits',
    'diagnosticInvocationCorrection': {'initialError': 'dist passed as package root',
        'correctedPackageRoot': '.', 'correctedLog': 'artifacts/markdown-nested-references-loaded-size-corrected-20261104.log'},
    'sizeAcceptance': {'changedLimits': False, 'failures': size_failures, 'individualEntriesAndCSS': 'passed'},
    'sourceExportPerformance': read_json('markdown-nested-references-performance-review-20261104.json'),
    'remainingScope': ['container-owned shared definitions', 'footnote source ownership', 'nested HTML-adapter ownership',
        'inline source ownership', 'full CommonMark', 'fresh full CI', 'aggregate size review'],
    'fullParityOrPublicationCertified': False,
}
(base / 'markdown-nested-references-verification-20261104.json').write_bytes((json.dumps(proof, indent=2) + '\n').encode())
print(json.dumps({key: proof[key] for key in ['unitTests', 'unitFiles', 'downloadedMarkdownFiles', 'tarballSHA256']}))
