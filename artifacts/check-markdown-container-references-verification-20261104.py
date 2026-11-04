from pathlib import Path
import hashlib
import json
import re

base = Path('artifacts')
read_json = lambda name: json.loads((base / name).read_text(encoding='utf-8-sig'))
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
checks = read_json('markdown-container-references-check-results-20261104.json')
assert {item['name']: item['exitCode'] for item in checks} == {
    'unit': 1, 'types': 0, 'api': 1, 'headless': 0, 'conformance': 0, 'package': 0,
    'worker': 0, 'size': 1, 'loaded-size': 0, 'latency': 0, 'direction-retention': 0, 'mapping-retention': 0,
}
unit = (base / 'markdown-container-references-unit-final-20261104.log').read_text(encoding='utf-8-sig')
assert re.search(r'Tests\s+3876 passed', unit) and re.search(r'Test Files\s+265 passed', unit)
initial_unit = (base / 'markdown-container-references-unit-20261104.log').read_text(encoding='utf-8-sig')
assert '1 failed | 3875 passed' in initial_unit and 'uses canonical only for proven definition boundaries' in initial_unit
assert '3 passed' in (base / 'markdown-container-references-browser-20261104.log').read_text(encoding='utf-8-sig')
assert '3 failed' in (base / 'markdown-container-references-wrong-fixture-browser-20261104.log').read_text(encoding='utf-8-sig')
assert read_json('markdown-container-references-latency-20261104.json')['failures'] == []
api_review = read_json('markdown-container-references-api-review-20261104.json')
assert api_review['commentsOnly'] and not api_review['publicSignaturesChanged']
assert all(item['nonCommentDeclarationEqual'] for item in api_review['files']) and len(api_review['files']) == 2
assert '419 declaration files' in (base / 'markdown-container-references-api-reviewed-20261104.log').read_text(encoding='utf-8-sig')
packed = read_json('markdown-container-references-packed-consumer-20261104.log')
assert packed == {'actualTarball': True, 'entries': 4, 'checks': 144, 'noFakeDOM': True, 'results': [36] * 4}
assert '36 container reference source contracts passed' in (base / 'markdown-container-references-worker-20261104.log').read_text(encoding='utf-8-sig')
size_log = (base / 'markdown-container-references-size-20261104.log').read_text(encoding='utf-8-sig')
size_failures = re.findall(r'^- (.+ exceeds its budget by .+)$', size_log, re.MULTILINE)
assert len(size_failures) == 2 and all('all ESM' in value or 'all CommonJS' in value for value in size_failures)
counterfactual = read_json('markdown-container-references-counterfactual-20261104.json')
assert counterfactual['baselineStopsAtFirstFailure'] and counterfactual['currentChecks'] == 36
files = []
folders = sorted((base / 'markdown-container-references-browser-20261104').glob('*/container-reference-journey'))
assert len(folders) == 3
for folder in folders:
    observations = json.loads((folder / 'observations.json').read_text())
    for name in ['nativeTyping', 'untouchedNestedSourceRetained', 'crossBlockReferenceDestinationsRetained',
        'undoOriginalExact', 'redoExact', 'nativeTaskCheckboxRetained', 'duplicateDefinitionPrecedenceRetained',
        'nativeQuoteUnwrap', 'quoteUndoRestoresSource', 'expectedUnwrappedCompleteModelChecked',
        'actualDownloadUploadedAgain', 'editedFullModelReopened', 'CRLFDownloadsRetained']:
        assert observations[name] is True
    assert observations['errors'] == [] and len(list(folder.glob('*.md'))) == 10
    for path in sorted(folder.glob('*.md')):
        data = path.read_bytes()
        assert b'\r\n' in data and b'\n' not in data.replace(b'\r\n', b'') and b'\r' not in data.replace(b'\r\n', b'')
        files.append({'path': path.as_posix(), 'kind': 'input' if path.name in ['original.md', 'tasks-original.md'] else 'download',
            'bytes': len(data), 'sha256': digest(path)})
assert len(files) == 30 and sum(item['kind'] == 'download' for item in files) == 24
paths = ['src/core/importers/markdown-importer.ts', 'src/core/markdown-nested-source.ts',
    'src/core/markdown-source-boundary.ts', 'src/core/exporters/markdown-exporter.ts']
maps = [json.loads(path.read_text(encoding='utf-8')) for path in Path('dist').glob('*.js.map')]
for name in paths:
    matches = [content for source_map in maps for source, content in zip(source_map['sources'], source_map['sourcesContent'])
        if source.replace('\\', '/').endswith(name)]
    assert matches and all(content.replace('\r\n', '\n').encode() == Path(name).read_bytes().replace(b'\r\n', b'\n') for content in matches), name
for engine in ['chromium', 'firefox', 'webkit']:
    assert (base / f'markdown-container-references-{engine}-visual-review-20261104.png').is_file()
    assert (base / f'markdown-container-references-{engine}-recording-review-20261104.png').is_file()
wrong_fixture = next((base / 'markdown-container-references-wrong-fixture-browser-20261104').glob('*chromium/container-reference-journey/tasks-original.md'))
assert b'      Review [proof][ref].' in wrong_fixture.read_bytes()
proof = {
    'branch': 'feat/markdown-nested-reference-source-20261104',
    'parentRuntimeCommit': '126e4463dfb22b597ab6468fc0754457854da8ef',
    'runtimeSourceSHA256': {name: digest(Path(name)) for name in paths},
    'builtSourceMapMatchesCurrentRuntimeSources': True,
    'unitTests': 3876, 'unitFiles': 265, 'newCases': 36,
    'initialUnitFailure': 'One old canonical-only expectation; updated to require exact source while keeping complete model equality, then full suite rerun.',
    'apiDocumentationReview': api_review,
    'initialBrowserFailure': {'reason': 'Wrongly indented task sample became code; corrected to a linked paragraph and asserted before interaction.',
        'input': wrong_fixture.as_posix(), 'sha256': digest(wrong_fixture)},
    'recordedDesktopJourneys': 3, 'downloadedMarkdownFiles': 24, 'inputMarkdownFiles': 6,
    'visualReview': {'editorCaptures': 12, 'sampledFramesPerRecording': 6, 'fullFrameByFramePlayback': False},
    'browserFiles': files, 'packedConsumer': packed,
    'tarballSHA256': digest(base / 'markdown-container-references-tarball-20261104/fountainjs-editor-0.4.0-beta.2.tgz'),
    'actualParentSourceRetentionCounterfactual': counterfactual,
    'realWorkerdContracts': 36, 'publicDeclarationFiles': 419, 'headlessSourceModules': 122,
    'conformance': {'default': 563, 'explicitCompleteBody': 635, 'denominator': 652, 'scoresChanged': False},
    'localLatencyAndRetentionAcceptance': 'passed without changed limits',
    'sizeAcceptance': {'changedLimits': False, 'failures': size_failures, 'individualEntriesAndCSS': 'passed'},
    'sourceExportPerformance': read_json('markdown-container-references-performance-review-20261104.json'),
    'remainingScope': ['footnote source ownership', 'nested HTML-adapter ownership', 'inline source ownership',
        'large source-export optimization', 'full CommonMark', 'fresh full CI', 'aggregate size review'],
    'fullParityOrPublicationCertified': False,
}
(base / 'markdown-container-references-verification-20261104.json').write_bytes((json.dumps(proof, indent=2) + '\n').encode())
print(json.dumps({key: proof[key] for key in ['unitTests', 'unitFiles', 'downloadedMarkdownFiles', 'tarballSHA256']}))
