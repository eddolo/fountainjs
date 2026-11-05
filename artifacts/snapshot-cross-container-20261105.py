from pathlib import Path
from hashlib import sha256
import json
import subprocess
import sys
import tarfile

root = Path(__file__).resolve().parents[1]
base = 'b6fc8e905c6190b90e2091c6c160b78489b1276b'
def read(path): return json.loads((root / path).read_text(encoding='utf-8-sig'))
def digest(path): return sha256((root / path).read_bytes()).hexdigest()
def record(path): return dict(path=path, sha256=digest(path), bytes=(root / path).stat().st_size)

checks = read('artifacts/cross-container-final-checks-20261105.json')
assert len(checks) == 9
assert {item['name']: item['exitCode'] for item in checks if item['exitCode']} == {'budget': 1}
runtime = read('artifacts/cross-container-final-runtime-checks-20261105.json')
assert runtime == dict(browser=0, packedNode=0, unit=0, performance=1)
assert '3934 passed (3934)' in (root / 'artifacts/cross-container-final-unit-20261105.log').read_text()
assert '6 passed' in (root / 'artifacts/cross-container-final-browser-20261105.log').read_text()
assert '15 failed (15)' in (root / 'artifacts/cross-container-parent-baseline-20261105.log').read_text()
baseline = read('artifacts/cross-container-parent-baseline-20261105.json')
assert baseline['exitCode'] == 1 and baseline['restoredExactly']
assert baseline['testSha256'] == digest('tests/cross-container-range.test.ts')
retention = read('artifacts/cross-container-retention-checks-20261105.json')
assert len(retention) == 2 and all(item['exitCode'] == 0 for item in retention)
for path in ['scripts/check-build-budgets.mjs', 'scripts/check-performance-budgets.mjs', 'api-surface.json']:
    assert subprocess.check_output(['git', 'diff', base, '--', path], cwd=root) == b'', path

performance = (root / 'artifacts/cross-container-performance-20261105.log').read_text()
assert '1000-block server HTML p95 122.84 ms exceeds 120 ms' in performance
assert '2,000-edit live-session heap growth: 0.00 MiB / 8 MiB' in performance
probe = json.loads((root / 'artifacts/cross-container-packed-node-20261105.log').read_text())
assert probe['actualTarball'] and probe['noDOM'] and probe['cases'] == 28
package = read('artifacts/cross-container-package-20261105.json')
assert package['sha256'] == digest(package['archive'])
count = 0
with tarfile.open(root / package['archive'], 'r:gz') as archive:
    for member in archive:
        if member.isfile() and member.name.startswith('package/dist/'):
            assert archive.extractfile(member).read() == (root / member.name.removeprefix('package/')).read_bytes(), member.name
            count += 1
assert count == package['distFilesMatch'] == 867

# Verify the built/packed implementation contains the current tested TS source.
sourceMaps = []
for path in (root / 'dist').glob('*.map'):
    data = json.loads(path.read_text())
    for source, content in zip(data.get('sources', []), data.get('sourcesContent', [])):
        if not source.endswith('/src/core/transaction/nested-range-replacement.ts'):
            continue
        actual = (root / 'src/core/transaction/nested-range-replacement.ts').read_text()
        assert content.replace('\r\n', '\n') == actual.replace('\r\n', '\n'), path
        sourceMaps.append(path.relative_to(root).as_posix())
assert sourceMaps

previous = read('artifacts/server-html-loaded-size-20261105.json')['entries']
current = read('artifacts/cross-container-loaded-size-20261105.json')['entries']
deltas = {}
for entry in current:
    if entry['entry'] not in ['.', './core', './react', './docx', './html/server']:
        continue
    old = next(item for item in previous if item['entry'] == entry['entry'])
    deltas[entry['entry']] = {key: entry[key] - old[key] for key in ['closureRawBytes', 'closureGzipBytes', 'closureBrotliBytes']}
assert all(value == 0 for name in ['./docx', './html/server'] for value in deltas[name].values())
for name in ['./docx', './html/server']:
    chunks = next(item['chunks'] for item in current if item['entry'] == name)
    assert all(Path(path).name.removesuffix('.map') not in chunks for path in sourceMaps), name

visual = read('artifacts/cross-container-visual-review-20261105/index.json')
assert visual['nativeCases'] == 24 and len(visual['captures']) == 72 and len(visual['videos']) == 6
assert all(len(video['samples']) == 8 for video in visual['videos'])
sources = [record(path.relative_to(root).as_posix()) for path in sorted((root / 'artifacts/cross-container-native-final-browser-20261105').rglob('*'))
           if path.is_file() and path.suffix in ['.md', '.json'] and path.name != '.last-run.json']
assert len(sources) == 108
inputs = [record(path) for path in ['src/core/transaction/nested-range-replacement.ts', 'src/core/transaction/replace-text-range-step.ts',
          'tests/cross-container-range.test.ts', 'tests/browser/cross-container-range-journey.ts', 'tests/manual/cross-container-range-real.spec.ts',
          'tests/fixtures/cross-container-figure.png']]
report = dict(baseCommit=base, releaseCertified=False, apiChanged=False, acceptanceLimitsChanged=False,
              implementation='Schema-checked cut-edge fitting with retained-unit provenance. No new selection kind or arbitrary open-slice contract.',
              unit=dict(passed=3934, files=269, newRegressions=15, orderedCharacterMappingCases=63),
              parentNegativeControl=baseline, checks=checks, runtimeChecks=runtime, retentionChecks=retention,
              declarations=419, headlessModules=123, package=package, packedCases=28, builtSourceMapMatches=sourceMaps,
              sizeDeltaBytes=deltas, performance=dict(passed=False, log='artifacts/cross-container-performance-20261105.log',
                failure='1,000-block server HTML p95 122.84 ms > 120 ms; no retry or ceiling change.',
                localEditingP95MsAt10000Blocks=.18, incrementalRemoteP95MsAt10000Blocks=.24,
                scope='Standalone engine timing, not complete UI latency. HTML-server closure is unchanged; causation is not established.'),
              visualReview=dict(index='artifacts/cross-container-visual-review-20261105/index.json', nativeCases=24, captures=72,
                captureContactsInspected=6, recordings=6, sampledFramesPerRecording=8,
                scope='Three desktop engines; Markdown issue drafts and JSON conversion drafts, forward/backward native selection, replacement, history, export/reopen/reader. No physical mobile certification.'),
              controls=dict(attributeFailure='artifacts/cross-container-attribute-control-20261105.log',
                policyFixtureFailure='artifacts/cross-container-policy-fixture-browser-20261105.log',
                policyFixtureExplanation='Raw HTML quotes are deliberately literal in the issue demo. All three failed before selection. The attribute workflow uses supported JSON import in Conversion Lab without changing the Markdown policy.',
                packedScopeControl='artifacts/cross-container-packed-scope-control-20261105.log',
                packedScopeExplanation='The initial guard rejected repository self-reference. An independent consumer package scope now proves actual archive resolution for ESM and CommonJS root/core.',
                imageFixtureVisual='artifacts/cross-container-image-fixture-before-20261105',
                imageFixtureExplanation='Visual review found blocked remote SVGs in the JSON fixture, as required by Conversion Lab CSP. The final JSON fixture embeds PNGs and both native workflows require image load completion before selection. Privacy policy is unchanged.',
                intermediateUnit='artifacts/cross-container-units-20261105.log',
                intermediateUnitExplanation='Earlier audit overlapped candidate edits and had two new regressions fail; it is not final-source certification. Final full run was performed after source edits stopped.'),
              retainedSources=sources, implementationInputs=inputs,
              open=['General text/atom/gap endpoint selections and trailing-image boundary shortcut', 'Mixed structural clipboard slices and arbitrary schema fitting',
                    'Server HTML latency variability', 'Aggregate capacity limits', 'Prior intermittent download timeout and mobile menu reliability',
                    'Remaining CommonMark/import/export/native production parity and full fresh CI'])
(root / 'artifacts/cross-container-verification-20261105.json').write_bytes((json.dumps(report, indent=2) + '\n').encode())
(root / 'artifacts/cross-container-source-paths-20261105.txt').write_bytes(('\n'.join(item['path'] for item in sources) + '\n').encode())
if '--git' in sys.argv or '--index' in sys.argv:
    revision = 'HEAD:' if '--git' in sys.argv else ':'
    for item in sources + inputs:
        # Read the blob directly. `git show` first stats a revision:path argument
        # as a possible Windows filename and can hit MAX_PATH on native captures.
        data = subprocess.check_output(['git', '-c', 'core.longpaths=true', 'cat-file', 'blob', revision + item['path']], cwd=root)
        assert sha256(data).hexdigest() == item['sha256'], item['path']
print(json.dumps(dict(unit=report['unit'], packedCases=28, archiveDistMatches=count, nativeCases=24, retainedSources=len(sources),
                      performancePassed=False, sizeDeltaBytes=deltas, gitBytesVerified='--git' in sys.argv)))
