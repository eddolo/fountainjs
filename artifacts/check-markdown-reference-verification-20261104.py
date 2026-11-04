from pathlib import Path
import hashlib
import json
import re

base = Path('artifacts')
read_json = lambda name: json.loads((base / name).read_text(encoding='utf-8-sig'))
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
checks = read_json('markdown-reference-boundaries-check-results-20261104.json')
assert {item['name']: item['exitCode'] for item in checks} == {
    'final-unit': 0, 'types': 0, 'api': 0, 'headless': 0, 'conformance': 0, 'package': 0,
    'worker': 0, 'size': 1, 'counterfactual': 0, 'loaded-size': 0, 'latency': 0,
    'direction-retention': 0, 'mapping-retention': 0,
}
unit_log = (base / 'markdown-reference-boundaries-final-unit-20261104.log').read_text(encoding='utf-8-sig')
assert re.search(r'Tests\s+3719 passed', unit_log)
assert re.search(r'Test Files\s+262 passed', unit_log)
assert '3 passed' in (base / 'markdown-reference-boundaries-browser-20261104.log').read_text(encoding='utf-8-sig')
assert read_json('markdown-reference-boundaries-latency-20261104.json')['failures'] == []
packed = read_json('markdown-reference-boundaries-packed-consumer-20261104.log')
assert packed == {'actualTarball': True, 'entries': 4, 'checks': 48, 'noFakeDOM': True,
    'includesNativeEditorEnter': True, 'results': [12] * 4}
counterfactual = read_json('markdown-reference-boundaries-counterfactual-20261104.json')
assert counterfactual['cases'] == counterfactual['baselineFailures'] == counterfactual['repaired'] == 12
size_log = (base / 'markdown-reference-boundaries-size-20261104.log').read_text(encoding='utf-8-sig')
size_failures = re.findall(r'^- (.+ exceeds its budget by .+)$', size_log, re.MULTILINE)
assert len(size_failures) == 2 and all('all ESM' in value or 'all CommonJS' in value for value in size_failures)
files = []
for folder in sorted((base / 'markdown-reference-boundaries-browser-20261104').glob('*/reference-boundary-journey')):
    observations = json.loads((folder / 'observations.json').read_text())
    assert observations['errors'] == [] and observations['nativeEnterAndTyping'] and observations['undoRedo']
    assert observations['completeEditedModelsReopened'] and observations['definitionFooterOutsideFence']
    assert len(list(folder.glob('*.md'))) == 4
    for path in sorted(folder.glob('*.md')):
        data = path.read_bytes()
        assert b'\r\n' in data and b'\n' not in data.replace(b'\r\n', b'') and b'\r' not in data.replace(b'\r\n', b'')
        files.append({'path': path.as_posix(), 'kind': 'input' if path.name == 'original.md' else 'download',
            'bytes': len(data), 'sha256': digest(path)})
assert len(files) == 12 and sum(item['kind'] == 'download' for item in files) == 9
(base / 'markdown-reference-boundaries-browser-files-20261104.json').write_text(json.dumps(files, indent=2) + '\n')
runtime_paths = ['src/core/commands.ts', 'src/core/exporters/markdown-exporter.ts',
    'src/core/importers/markdown-importer.ts', 'src/core/markdown-source-boundary.ts']
proof = {
    'branch': 'fix/markdown-reference-boundaries-20261104',
    'parentSourceCommit': '86a4633c6fcca01f8e7a7a2055c3e280e3057277',
    'runtimeSourceSHA256': {name: digest(Path(name)) for name in runtime_paths},
    'unitTests': 3719, 'unitFiles': 262, 'newReferenceCases': 34, 'newLinkSplitCases': 7,
    'actualParentDataLossCases': 12, 'currentCasesWithFullModelEquality': 12,
    'recordedDesktopJourneys': 3, 'downloadedMarkdownFiles': 9, 'inputMarkdownFiles': 3,
    'visualReview': {'editorCaptures': 9, 'sampledFramesPerRecording': 6, 'fullFrameByFramePlayback': False},
    'packedConsumer': packed,
    'tarballSHA256': digest(base / 'markdown-reference-boundaries-tarball-20261104/fountainjs-editor-0.4.0-beta.2.tgz'),
    'realWorkerdContracts': 12, 'publicDeclarationFiles': 419, 'headlessSourceModules': 122,
    'conformance': {'default': 563, 'explicitCompleteBody': 635, 'denominator': 652, 'scoresChanged': False},
    'localLatencyAndRetentionAcceptance': 'passed without changed limits',
    'sizeAcceptance': {'changedLimits': False, 'failures': size_failures, 'individualEntriesAndCSS': 'passed'},
    'sourceExportPerformance': read_json('markdown-reference-boundaries-performance-review-20261104.json'),
    'uncachedPerformanceEvidence': 'artifacts/markdown-reference-boundaries-uncached-performance-review-20261104.json',
    'remainingScope': ['nested ownership in reference/footnote scopes', 'external HTML projections',
        'inline ownership', 'full CommonMark', 'fresh full CI', 'aggregate size review'],
    'fullParityOrPublicationCertified': False,
}
(base / 'markdown-reference-boundaries-verification-20261104.json').write_text(json.dumps(proof, indent=2) + '\n')
print(json.dumps({key: proof[key] for key in ['unitTests', 'unitFiles', 'downloadedMarkdownFiles', 'tarballSHA256']}))
