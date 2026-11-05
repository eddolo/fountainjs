import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
artifacts = root / 'artifacts'
base = '217c3d742c8a57ad0ea128a2379e7658f185c874'
read = lambda path: json.loads(path.read_text(encoding='utf-8-sig'))
checks = read(artifacts / 'structural-formatting-checks-20261105.json')
assert len(checks) == 17
for check in checks:
    assert check['exitCode'] == (1 if check['name'] == 'size-verified' else 0), check
    assert (root / check['log']).is_file()
unit = re.sub(r'\x1b\[[0-9;]*m', '', (artifacts / 'structural-formatting-unit-verified-20261105.log').read_text())
assert re.search(r'Test Files\s+275 passed', unit)
assert re.search(r'Tests\s+4045 passed', unit)
native = []
for engine in ['chromium', 'firefox', 'webkit']:
    source = artifacts / 'structural-formatting-verified-browser-20261105'
    directory = next(path for path in source.iterdir() if path.is_dir() and path.name.endswith(engine)) / 'range-formatting'
    observations = read(directory / 'observations.json')
    assert len(observations['observations']) == 2 and not observations['errors']
    for direction in ['forward', 'backward']:
        original = read(directory / f'{direction}-original.json')
        formatted = read(directory / f'{direction}-formatted.json')
        assert read(directory / f'{direction}-undone.json') == original
        assert read(directory / f'{direction}-redone.json') == formatted
        assert formatted['attrs'] == original['attrs']
        assert len(formatted['content']) == 3
        assert formatted['content'][0] == original['content'][0]
        assert formatted['content'][2] == original['content'][2]
        heading = formatted['content'][1]
        assert heading['type'] == 'heading'
        assert heading['attrs']['level'] == 2 and heading['attrs']['align'] == 'center'
        assert heading['attrs']['nodeId'] == 'selected' and heading['attrs']['audit'] == {'owner': 'Ada'}
        assert heading['content'] == original['content'][1]['content']
    native.append({'engine': engine, 'formattingCases': 2, 'observations': str((directory / 'observations.json').relative_to(root))})
table_root = artifacts / 'structural-formatting-table-verified-browser-20261105'
table_directories = [path for path in table_root.iterdir() if path.is_dir() and path.name.endswith(('chromium', 'firefox', 'webkit'))]
assert len(table_directories) == 15
for directory in table_directories:
    report = read(next((directory / 'attachments').glob('table-side-observations-*.json')))
    assert len(report['observations']) == 2 and not report['errors']
    for item in report['observations']:
        a, b = item['activeBox'], item['insertedBox']
        assert b['x'] + b['width'] <= a['x'] + 1 if item['side'] == 'left' else b['x'] >= a['x'] + a['width'] - 1
focus = (artifacts / 'structural-formatting-focus-browser-verified-20261105.log').read_text()
assert re.search(r'12 passed', focus)
packed = read(artifacts / 'structural-formatting-packed-node-20261105.json')
assert packed['exitCode'] == 0 and packed['proof']['cases'] == 14 and packed['proof']['noDOM']
assert packed['allBuildFilesMatch'] > 873
source_paths = ['src/core/commands.ts', 'src/core/schema/node.ts', 'src/core/schema/block-lineage.ts',
    'src/core/transaction/set-block-type-step.ts', 'src/view/selection-handler.ts', 'src/yjs/index.ts']
inputs = {path: hashlib.sha256((root / path).read_bytes().replace(b'\r\n', b'\n')).hexdigest() for path in source_paths}
mapped = set()
for map_path in (root / 'dist').glob('*.map'):
    source_map = read(map_path)
    for path, content in zip(source_map['sources'], source_map.get('sourcesContent', [])):
        source = (map_path.parent / path).resolve()
        relative = source.relative_to(root).as_posix() if source.is_relative_to(root) else ''
        if relative in inputs:
            assert isinstance(content, str)
            assert content.replace('\r\n', '\n') == source.read_text(encoding='utf-8').replace('\r\n', '\n'), relative
            mapped.add(relative)
assert mapped == set(source_paths)
for path in ['scripts/check-build-budgets.mjs', 'scripts/check-performance-budgets.mjs', 'package.json', 'pnpm-lock.yaml']:
    subprocess.run(['git', 'diff', '--exit-code', base, '--', path], cwd=root, check=True, capture_output=True)
visual = read(artifacts / 'structural-formatting-visual-review-20261105.json')
assert len(visual['captures']) == 48 and len(visual['recordings']) == 18
assert visual['inspectionStatus'] == 'reviewed: 48 stage captures and 72 sampled recording frames'
before = json.loads(subprocess.check_output(['git', 'show', f'{base}:artifacts/structural-range-loaded-size-20261105.json'], cwd=root))
after = read(artifacts / 'structural-formatting-loaded-size-20261105.json')
deltas = []
for entry in after['entries']:
    if entry['entry'] in ['.', './core', './react', './yjs', './docx', './html/server']:
        old = next(item for item in before['entries'] if item['entry'] == entry['entry'])
        deltas.append({'entry': entry['entry'], 'closureRawBytes': entry['closureRawBytes'], 'closureGzipBytes': entry['closureGzipBytes'],
            'deltaRawBytes': entry['closureRawBytes'] - old['closureRawBytes'], 'deltaGzipBytes': entry['closureGzipBytes'] - old['closureGzipBytes']})
report = {'baseCommit': base, 'releaseCertified': False, 'publicSignaturesChanged': False, 'privateDeclarationFilesReviewed': 2,
    'acceptanceLimitsChanged': False, 'runtimeDependenciesChanged': False,
    'unit': {'passed': 4045, 'files': 275, 'addedSinceBase': 27},
    'native': {'formattingCases': 6, 'tableWorkflows': 15, 'physicalColumnInsertions': 30, 'existingFocusRegressions': 12, 'engines': native},
    'packed': packed, 'checks': checks, 'sourceInputsNormalizedSha256': inputs, 'sourceMappedRuntimeInputs': sorted(mapped),
    'loadedSize': {'method': after['method'], 'excludes': after['excludes'], 'measuresRuntimeSpeed': False, 'entries': deltas},
    'visual': {'manifest': 'artifacts/structural-formatting-visual-review-20261105.json', 'stageCapturesReviewed': 48,
        'recordingsSampled': 18, 'framesReviewedPerRecording': 4, 'continuousVideoCompletelyReviewed': False},
    'priorCI': {'commit': base, 'run': 41965238651, 'performance': 'success', 'leanIntegration': 'success',
        'verify': 'failure: unchanged size limits', 'browser': 'failure: 15 physical table-column typing workflows',
        'nativeDOCXRun': 41965238603, 'nativeDOCXRendering': 'success'},
    'limits': ['general open-slice transport/fitting remains unfinished', 'full command coverage for RangeSelection remains unfinished',
        'physical mobile not certified', 'large whole-document formatting latency not certified',
        'fresh complete CI and size acceptance remain outstanding',
        'broader CommonMark/source fidelity, conversion and production parity remain open']}
if '--git' in sys.argv:
    for path, digest in inputs.items():
        blob = subprocess.check_output(['git', '-c', 'core.longpaths=true', 'cat-file', 'blob', ':' + path], cwd=root)
        assert hashlib.sha256(blob.replace(b'\r\n', b'\n')).hexdigest() == digest, path
    report['indexVerification'] = {'sourceInputs': len(inputs), 'allEqual': True}
(artifacts / 'structural-formatting-verification-20261105.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'unitPassed': 4045, 'nativeFormattingCases': 6, 'tableWorkflows': 15, 'packedCases': 14, 'releaseCertified': False}))
