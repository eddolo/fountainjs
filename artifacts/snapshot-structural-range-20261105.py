import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
artifacts = root / 'artifacts'

def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

checks = read_json(artifacts / 'structural-range-final-gates-20261105.json')
assert len(checks) == 12
assert all(item['ExitCode'] == (1 if item['Name'] == 'budget' else 0) for item in checks)
unit = (artifacts / 'structural-range-final-unit-20261105.log').read_text(encoding='utf-8-sig')
assert re.search(r'Tests\s+4018 passed \(4018\)', unit)
assert re.search(r'Test Files\s+274 passed \(274\)', unit)
packed = read_json(artifacts / 'structural-range-packed-node-20261105.json')
assert packed['exitCode'] == 0 and packed['allBuildFilesMatch'] == 873
assert packed['proof']['actualTarball'] and packed['proof']['noDOM'] and packed['proof']['cases'] == 14
assert hashlib.sha256(Path(packed['archive']).read_bytes()).hexdigest() == packed['archiveSha256']
build_files = [path for path in (root / 'dist').rglob('*') if path.is_file()]
assert len(build_files) == 873
for path in build_files:
    extracted = Path(packed['consumer']) / 'node_modules/fountainjs-editor/dist' / path.relative_to(root / 'dist')
    assert path.read_bytes() == extracted.read_bytes(), str(path)
native_root = artifacts / 'structural-range-native-visible-browser-20261105'
native = []
for engine in ['chromium', 'firefox', 'webkit']:
    directory = next(path for path in native_root.iterdir() if path.is_dir() and '13852' in path.name and path.name.endswith(engine))
    observations = read_json(directory / 'document-boundary-range-journey/observations.json')
    assert observations['engine'] == engine and not observations['errors']
    assert len(observations['observations']) == 8
    assert all(item['loadedImageWidth'] == 400 and item['completeExportedModel'] and item['originalSourceUndo']
               and item['editedSourceRedo'] and item['reopenedReader'] for item in observations['observations'])
    clipboard_directory = next(path for path in native_root.iterdir() if path.is_dir() and '3297a' in path.name and path.name.endswith(engine))
    clipboard = read_json(clipboard_directory / 'clipboard-observations.json')
    assert len(clipboard['records']) == 2
    assert all(item['trusted'] and item['prevented'] for item in clipboard['records'])
    assert clipboard['records'][0]['fountain'] == clipboard['records'][1]['fountain']
    assert clipboard['externalAndInternalOSPasteChecked'] == (engine == 'chromium')
    native.append({'engine': engine, 'rangeCases': 8, 'trustedCopyAndCut': True,
                   'actualInternalAndExternalOSPaste': engine == 'chromium',
                   'observations': str((directory / 'document-boundary-range-journey/observations.json').relative_to(root))})

source_paths = ['src/core/commands.ts', 'src/core/selection.ts', 'src/core/state.ts',
    'src/core/transaction/index.ts', 'src/core/transaction/mapping.ts',
    'src/core/transaction/nested-range-replacement.ts', 'src/core/transaction/transform.ts',
    'src/core/transaction/document-point.ts', 'src/core/transaction/document-fragment.ts',
    'src/core/transaction/replace-range-step.ts', 'src/view/input.ts',
    'src/view/selection-handler.ts', 'src/view/view.ts', 'src/yjs/index.ts']
inputs = {path: hashlib.sha256((root / path).read_bytes().replace(b'\r\n', b'\n')).hexdigest() for path in source_paths}
mapped = set()
for map_path in (root / 'dist').glob('*.map'):
    source_map = read_json(map_path)
    for path, content in zip(source_map['sources'], source_map.get('sourcesContent', [])):
        source = (map_path.parent / path).resolve()
        relative = source.relative_to(root).as_posix() if source.is_relative_to(root) else ''
        if relative in inputs:
            assert isinstance(content, str)
            assert content.replace('\r\n', '\n') == source.read_text(encoding='utf-8').replace('\r\n', '\n'), relative
            mapped.add(relative)
assert mapped == set(source_paths) - {'src/core/transaction/index.ts'}, mapped
for path in ['scripts/check-build-budgets.mjs', 'scripts/check-performance-budgets.mjs', 'package.json', 'pnpm-lock.yaml']:
    subprocess.run(['git', 'diff', '--exit-code', 'HEAD', '--', path], cwd=root, check=True, capture_output=True)

visual = read_json(artifacts / 'structural-range-visual-review-final-20261105.json')
assert len(visual['captures']) == 72 and len(visual['recordings']) == 6 and len(visual['contactSheets']) == 12
assert visual['inspectionStatus'] == 'reviewed: 72 stage captures and 48 sampled recording frames'
baseline_size = read_json(artifacts / 'cross-container-loaded-size-20261105.json')
baseline_blob = subprocess.check_output(['git', 'cat-file', 'blob', '5c5e494e7965088437ddff53d4fef63cfe29161f:artifacts/cross-container-loaded-size-20261105.json'], cwd=root)
assert json.loads(baseline_blob) == baseline_size
current_size = read_json(artifacts / 'structural-range-loaded-size-20261105.json')
size_deltas = []
for entry in current_size['entries']:
    before = next(item for item in baseline_size['entries'] if item['entry'] == entry['entry'])
    if entry['entry'] in ['.', './core', './react', './yjs', './docx', './html/server']:
        size_deltas.append({'entry': entry['entry'], 'facadeRawBytes': entry['facadeRawBytes'],
            'closureRawBytes': entry['closureRawBytes'], 'closureGzipBytes': entry['closureGzipBytes'],
            'deltaRawBytes': entry['closureRawBytes'] - before['closureRawBytes'],
            'deltaGzipBytes': entry['closureGzipBytes'] - before['closureGzipBytes']})
report = {'baseCommit': '5c5e494e7965088437ddff53d4fef63cfe29161f', 'releaseCertified': False,
    'apiChanged': True, 'publicDeclarationFiles': 423, 'acceptanceLimitsChanged': False,
    'runtimeDependenciesChanged': False, 'unit': {'passed': 4018, 'files': 274, 'addedSinceBase': 84,
        'legalMixedEndpointMappingPairs': 245},
    'native': {'newRegisteredTests': 6, 'rangeWorkflowCases': 24, 'existingRegressionTests': 12,
        'unchangedOriginalTerminalRegressionTests': 3, 'engines': native},
    'packed': packed, 'checks': checks, 'loadedSize': {'method': current_size['method'], 'excludes': current_size['excludes'],
        'doesNotApplyConsumerTreeShaking': True, 'measuresRuntimeSpeed': False, 'entries': size_deltas},
    'sourceInputsNormalizedSha256': inputs,
    'sourceMappedRuntimeInputs': sorted(mapped), 'visual': {'manifest': 'artifacts/structural-range-visual-review-final-20261105.json',
        'stageCapturesReviewed': 72, 'recordingsSampled': 6, 'framesReviewedPerRecording': 8,
        'continuousVideoCompletelyReviewed': False},
    'controls': {'priorYjsAdapter': '6 failing / 1 passing cases before the adapter repair; two further cases added afterward',
        'viewportRace': 'deterministic failed caret-position regression before capture-before-render repair',
        'pasteCaret': 'whole-document and gap rich paste selected terminal media before the shared insertion-caret repair',
        'visualVisibility': 'native Chromium test failed when edited text stayed offscreen after a virtual range replacement',
        'intermediateFullSuite': '4013 passed / 2 failed; node-selection handoff repaired and an incidental blank-paragraph lookup replaced with a complete correct-model assertion'},
    'limits': ['general open-slice transport/fitting remains unfinished', 'physical mobile behavior not certified',
        'actual Firefox/WebKit external OS paste not certified by the copy/cut payload checks',
        'full fresh CI and unchanged size-budget acceptance remain outstanding', 'broader CommonMark/source fidelity and production parity remain open']}
if '--git' in sys.argv:
    raw_files = [path for path in native_root.rglob('*') if path.is_file() and path.suffix in ['.md', '.json']]
    for path in raw_files:
        blob = subprocess.check_output(['git', '-c', 'core.longpaths=true', 'cat-file', 'blob', ':' + path.relative_to(root).as_posix()], cwd=root)
        assert blob == path.read_bytes(), str(path)
    for path, digest in inputs.items():
        blob = subprocess.check_output(['git', '-c', 'core.longpaths=true', 'cat-file', 'blob', ':' + path], cwd=root)
        assert hashlib.sha256(blob.replace(b'\r\n', b'\n')).hexdigest() == digest, path
    report['indexVerification'] = {'rawNativeFixtures': len(raw_files), 'sourceInputs': len(inputs), 'allEqual': True}
(artifacts / 'structural-range-verification-20261105.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'unitPassed': 4018, 'nativeRangeCases': 24, 'packedCases': 14, 'sourceMappedInputs': len(mapped), 'releaseCertified': False}))
