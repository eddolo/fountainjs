from pathlib import Path
import hashlib
import json
import re

base = Path('artifacts')
read_json = lambda name: json.loads((base / name).read_text(encoding='utf-8-sig'))
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
checks = read_json('markdown-html-source-check-results-20261104.json')
assert {item['name']: item['exitCode'] for item in checks} == {
    'unit': 0, 'types': 0, 'api': 0, 'headless': 0, 'conformance': 0, 'package': 0,
    'worker': 0, 'size': 1, 'loaded-size': 0, 'latency': 1,
    'direction-retention': 0, 'mapping-retention': 0,
}
unit_log = (base / 'markdown-html-source-unit-20261104.log').read_text(encoding='utf-8-sig')
assert re.search(r'Tests\s+3787 passed', unit_log)
assert re.search(r'Test Files\s+263 passed', unit_log)
assert '3 passed' in (base / 'markdown-html-source-browser-20261104.log').read_text(encoding='utf-8-sig')
first_latency = read_json('markdown-html-source-latency-20261104.json')
repeat_latency = read_json('markdown-html-source-latency-repeat-20261104.json')
assert len(first_latency['failures']) == 1 and '100-block server HTML' in first_latency['failures'][0]
assert repeat_latency['failures'] == [] and first_latency['limits'] == repeat_latency['limits']
packed = read_json('markdown-html-source-packed-consumer-20261104.log')
assert packed == {'actualTarball': True, 'entries': 4, 'checks': 200, 'noFakeDOM': True, 'results': [50] * 4}
assert '50 HTML-adapted Markdown source contracts passed' in (base / 'markdown-html-source-worker-20261104.log').read_text(encoding='utf-8-sig')
size_log = (base / 'markdown-html-source-size-20261104.log').read_text(encoding='utf-8-sig')
size_failures = re.findall(r'^- (.+ exceeds its budget by .+)$', size_log, re.MULTILINE)
assert len(size_failures) == 2 and all('all ESM' in value or 'all CommonJS' in value for value in size_failures)
files = []
folders = sorted((base / 'markdown-html-source-browser-20261104').glob('*/issue-html-source-journey'))
assert len(folders) == 3
for folder in folders:
    observations = json.loads((folder / 'observations.json').read_text())
    for name in ['actualIssueHTMLBlockPolicy', 'nativeEnterAndTyping', 'actualFileReopened',
                 'expectedCompleteModelChecked', 'undoRedo', 'sourceAndReaderModes', 'CRLFDownloadsRetained']:
        assert observations[name] is True
    assert observations['errors'] == [] and len(list(folder.glob('*.md'))) == 5
    for path in sorted(folder.glob('*.md')):
        data = path.read_bytes()
        assert b'\r\n' in data and b'\n' not in data.replace(b'\r\n', b'') and b'\r' not in data.replace(b'\r\n', b'')
        files.append({'path': path.as_posix(), 'kind': 'input' if path.name == 'original.md' else 'download',
            'bytes': len(data), 'sha256': digest(path)})
assert len(files) == 15 and sum(item['kind'] == 'download' for item in files) == 12
before = next((base / 'markdown-html-source-before-browser-20261104').glob('*/issue-html-source-journey/edited.md'))
assert b'~~~~js\r\nfirst\r\n\r\n[ref]:' in before.read_bytes()
assert '1 failed' in (base / 'markdown-html-source-before-browser-20261104.log').read_text(encoding='utf-8-sig')
assert '1 passed' in (base / 'markdown-html-source-negative-20261104.log').read_text(encoding='utf-8-sig')
negative_image = next((base / 'markdown-html-source-negative-20261104').glob('*/actual-old-download-current-viewer.png'))
paths = ['src/core/exporters/markdown-exporter.ts', 'src/core/importers/markdown-importer.ts', 'src/core/markdown-source-boundary.ts']
maps = [json.loads(path.read_text(encoding='utf-8')) for path in Path('dist').glob('*.js.map')]
for name in paths:
    matches = [content for source_map in maps for source, content in zip(source_map['sources'], source_map['sourcesContent'])
               if source.replace('\\', '/').endswith(name)]
    assert matches and all(content.replace('\r\n', '\n').encode() == Path(name).read_bytes().replace(b'\r\n', b'\n') for content in matches), name
for engine in ['chromium', 'firefox', 'webkit']:
    assert (base / f'markdown-html-source-{engine}-visual-review-20261104.png').is_file()
    assert (base / f'markdown-html-source-{engine}-recording-review-20261104.png').is_file()
proof = {
    'branch': 'fix/markdown-html-source-boundaries-20261104',
    'parentSourceCommit': '588be248e66767b0f4c7efd5d5b75596d5224077',
    'runtimeSourceSHA256': {name: digest(Path(name)) for name in paths},
    'builtSourceMapMatchesCurrentRuntimeSources': True,
    'unitTests': 3787, 'unitFiles': 263, 'newCases': 68,
    'recordedDesktopJourneys': 3, 'downloadedMarkdownFiles': 12, 'inputMarkdownFiles': 3,
    'visualReview': {'editorReaderCaptures': 12, 'sampledFramesPerRecording': 6, 'fullFrameByFramePlayback': False,
        'negativeImage': negative_image.as_posix(), 'negativeImageMeaning': 'Actual pre-repair download reopened in current viewer'},
    'browserFiles': files, 'oldActualDownload': {'path': before.as_posix(), 'sha256': digest(before)},
    'beforeBuildSourceProof': read_json('markdown-html-source-before-build-20261104.json'),
    'packedConsumer': packed,
    'tarballSHA256': digest(base / 'markdown-html-source-tarball-20261104/fountainjs-editor-0.4.0-beta.2.tgz'),
    'realWorkerdContracts': 50, 'publicDeclarationFiles': 419, 'headlessSourceModules': 122,
    'conformance': {'default': 563, 'explicitCompleteBody': 635, 'denominator': 652, 'scoresChanged': False},
    'localPerformance': {'firstRun': first_latency['failures'], 'separateRepeat': repeat_latency['failures'], 'limitsChanged': False},
    'sizeAcceptance': {'changedLimits': False, 'failures': size_failures, 'individualEntriesAndCSS': 'passed'},
    'sourceExportPerformance': read_json('markdown-html-source-performance-review-20261104.json'),
    'remainingScope': ['nested ownership with HTML/reference/footnote scopes', 'inline source ownership',
        'full CommonMark', 'fresh full CI', 'aggregate size review'],
    'fullParityOrPublicationCertified': False,
}
(base / 'markdown-html-source-verification-20261104.json').write_bytes((json.dumps(proof, indent=2) + '\n').encode())
print(json.dumps({key: proof[key] for key in ['unitTests', 'unitFiles', 'downloadedMarkdownFiles', 'tarballSHA256']}))
