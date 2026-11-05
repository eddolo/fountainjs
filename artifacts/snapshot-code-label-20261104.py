from pathlib import Path
from hashlib import sha256
import json, subprocess, tarfile

base = '3d1b2ee20e7dca8aaeae7227e4f7d386b8667ec9'
def read(path): return json.loads(Path(path).read_text(encoding='utf-8-sig'))
def sha(data): return sha256(data).hexdigest()
checks = read('artifacts/code-label-check-results-20261104.json')
assert {item['name']: item['exitCode'] for item in checks if item['exitCode']} == {'final-browser': 1, 'size': 1, 'latency': 1}
assert '3918 passed (3918)' in Path('artifacts/code-label-pointer-final-unit-20261104.log').read_text()
assert '5 passed' in Path('artifacts/code-label-verified-browser-20261104.log').read_text()
assert '419 declaration files' in Path('artifacts/code-label-pointer-final-api-20261104.log').read_text()
assert '122 modules' in Path('artifacts/code-label-pointer-final-headless-20261104.log').read_text()
before_api = json.loads(subprocess.check_output(['git', 'show', base + ':api-surface.json']))
after_api = read('api-surface.json')
assert set(before_api['files']) == set(after_api['files'])
changed_api = [name for name in after_api['files'] if after_api['files'][name] != before_api['files'][name]]
assert changed_api == ['dist/core/plugin.d.cts', 'dist/core/plugin.d.ts']
assert Path('scripts/check-build-budgets.mjs').read_bytes() == subprocess.check_output(['git', 'show', base + ':scripts/check-build-budgets.mjs'])
archive = Path('artifacts/code-label-tarball-20261104/fountainjs-editor-0.4.0-beta.2.tgz')
dist_files = 0
with tarfile.open(archive, 'r:gz') as package:
    for member in package:
        if member.isfile() and member.name.startswith('package/dist/'):
            assert package.extractfile(member).read() == Path(member.name.removeprefix('package/')).read_bytes(), member.name
            dist_files += 1
assert dist_files == 865
old = read('artifacts/nested-sibling-loaded-size-20261104.json')['entries']
new = read('artifacts/code-label-loaded-size-20261104.json')['entries']
deltas = {}
for item in new:
    if item['entry'] not in ['.', './core', './react', './docx']: continue
    previous = next(entry for entry in old if entry['entry'] == item['entry'])
    deltas[item['entry']] = {key: item[key] - previous[key] for key in ['closureRawBytes', 'closureGzipBytes', 'closureBrotliBytes']}
pointer = []
retained = []
for version in ['before', 'after']:
    for path in sorted(Path(f'artifacts/code-label-pointer-{version}-browser-20261104').rglob('pointer-events.json')):
        item = read(path)
        pointer.append({'version': version, 'engine': item['engine'], 'heading': item['heading'], 'code': item['code']})
        if version == 'after':
            assert item['heading'] == 'Code label handoff' and item['code'] == 'example 1 edited'
            delivery = [event for event in item['events'] if event['event'] == 'pointerdown' and event['phase'] == 'bubble']
            assert delivery and delivery[0]['prevented'] and delivery[0]['anchor'] == 'SPAN:2.0' and delivery[0]['anchorOffset'] == 0
        retained.append(path.as_posix())
for path in sorted(Path('artifacts/code-label-verified-browser-20261104').rglob('*.md')):
    retained.append(path.as_posix())
source = [{'path': path, 'sha256': sha(Path(path).read_bytes()), 'bytes': Path(path).stat().st_size} for path in retained]
report = {
    'baseCommit': base, 'releaseCertified': False, 'acceptanceLimitsChanged': False,
    'apiChange': {'kind': 'additive optional PluginProps.handlePointerDown', 'changedDeclarations': changed_api, 'declarationCount': 419, 'noDOMBoundaryModules': 122},
    'unit': {'passed': 3918, 'files': 268}, 'initialQueue': checks, 'finalTypeCheckExitCode': 0,
    'finalWorkflows': {'passed': 5, 'engines': ['chromium', 'firefox', 'webkit', 'mobile-chrome', 'mobile-safari'], 'physicalMobileCertification': False,
        'checks': ['native code caret before typing', 'heading unchanged', 'backward source Shift-click replacement and undo', 'history', 'actual download/reopen', 'desktop and narrow reader', 'empty imported text leaf entry, undo, exact source download and reader']},
    'pointerControl': pointer,
    'fixtureCorrections': ['Initial unit asserted NodeSelection.path instead of nodePath; retain failure and correct the semantic-node assertion.', 'Initial added empty Markdown workflow wrongly expected a childless node. Actual importer retains one empty text leaf. Replace the wrong class assertion with a native code-owned caret assertion; retain all five failed attempts. No typing, history or source-retention assertion was removed.'],
    'package': {'path': archive.as_posix(), 'sha256': sha(archive.read_bytes()), 'distFilesMatch': dist_files, 'entries': ['root ESM', 'core ESM', 'root CommonJS', 'core CommonJS'], 'sourceReferenceCases': 244, 'nestedRangeCases': 12, 'inertNoDOMPointerGuards': 2},
    'sizeDeltaBytes': deltas,
    'performance': {'status': 'unresolved', 'first': '5000-block server HTML p95 713.02 ms > 500 ms', 'unchangedIsolatedRecheck': '1000-block server HTML p95 138.50 ms > 120 ms; 5000-block p95 334.61 ms passes', 'causalConclusion': 'Not established. Core and DOCX static closure byte counts are unchanged; both failures remain evidence.', 'limitsChanged': False},
    'visualReview': {'workflowCaptureContactSheets': 5, 'capturesInThoseSheets': 30, 'sampledWorkflowRecordings': 5, 'framesPerRecording': 6,
        'additionalReadableCrops': ['Firefox reader', 'mobile Safari reader', 'mobile Chromium empty-code reader'], 'scope': 'Contact sheets, sampled frames and three readable crops inspected; not every raw full-page image pixel or complete video playback. Grey recording padding follows viewport changes.'},
    'open': ['Server HTML latency gate failures', 'Mixed structural/cross-ancestor ranges and terminal-image selection', 'Earlier intermittent Chromium download timeout', 'Mobile suggestion-menu overflow retry', 'Aggregate ESM/CJS capacity', 'Full fresh CI and remaining parity/production work'],
    'retainedSources': source,
}
Path('artifacts/code-label-verification-20261104.json').write_bytes(json.dumps(report, indent=2).encode() + b'\n')
Path('artifacts/code-label-source-paths-20261104.txt').write_bytes(('\n'.join(retained) + '\n').encode())
print(json.dumps({'unit': report['unit'], 'archiveDistFilesMatch': dist_files, 'retainedSources': len(source), 'sizeDeltaBytes': deltas, 'performance': 'unresolved'}))
