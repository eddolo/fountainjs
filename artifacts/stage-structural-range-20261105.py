from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent.parent
artifacts = root / 'artifacts'
files = [
    '.gitattributes', '.github/workflows/ci.yml', 'CHANGELOG.md', 'api-surface.json',
    'docs/API.md', 'docs/PORTABILITY_AUDIT.md', 'docs/ROADMAP.md', 'docs/SELECTION_RANGES.md', 'docs/VIRTUALIZATION.md',
    'src/core/commands.ts', 'src/core/selection.ts', 'src/core/state.ts', 'src/core/transaction/index.ts',
    'src/core/transaction/mapping.ts', 'src/core/transaction/nested-range-replacement.ts', 'src/core/transaction/transform.ts',
    'src/core/transaction/document-point.ts', 'src/core/transaction/document-fragment.ts', 'src/core/transaction/replace-range-step.ts',
    'src/view/input.ts', 'src/view/selection-handler.ts', 'src/view/view.ts', 'src/yjs/index.ts',
    'tests/browser/editor.spec.ts', 'tests/extensions.test.ts', 'tests/virtual-view.test.ts',
    'tests/browser/document-boundary-range-journey.ts', 'tests/manual/document-boundary-range-real.spec.ts',
    'tests/document-range-selection.test.ts', 'tests/replace-document-range.test.ts',
    'tests/document-range-commands.test.ts', 'tests/document-range-clipboard.test.ts', 'tests/yjs-document-range.test.ts',
]
artifact_names = [
    'structural-range-native-browser-20261105.config.ts', 'structural-range-regression-browser-20261105.config.ts',
    'structural-range-smoke-browser-20261105.config.ts', 'structural-range-packed-probe-20261105.mjs',
    'run-structural-range-packed-20261105.mjs', 'snapshot-structural-range-20261105.py',
    'review-structural-range-20261105.py', 'stage-structural-range-20261105.py',
    'structural-range-packed-node-20261105.json', 'structural-range-packed-node-20261105.log',
    'structural-range-verification-20261105.json', 'structural-range-loaded-size-20261105.json',
    'structural-range-loaded-size-20261105.log', 'structural-range-final-gates-20261105.json',
    'structural-range-visual-review-final-20261105.json', 'structural-range-native-visible-20261105.log',
    'structural-range-yjs-before-20261105.log', 'structural-range-viewport-before-20261105.log',
    'structural-range-paste-caret-before-20261105.log', 'structural-range-caret-visible-before-20261105.log',
    'structural-range-verified-unit-20261105.log',
]
files += ['artifacts/' + name for name in artifact_names]
files += [path.relative_to(root).as_posix() for path in artifacts.glob('structural-range-final-*-20261105.log')]
native = artifacts / 'structural-range-native-visible-browser-20261105'
files += [path.relative_to(root).as_posix() for path in native.rglob('*') if path.is_file() and path.suffix in ['.md', '.json']]
contacts = artifacts / 'structural-range-visual-review-final-20261105'
files += [path.relative_to(root).as_posix() for path in contacts.glob('*.png') if 'frame-' not in path.name]
for file in files:
    path = (root / file).resolve()
    assert path.is_relative_to(root) and path.is_file(), file
pathspec = artifacts / 'structural-range-stage-pathspec-20261105.bin'
pathspec.write_bytes(b'\0'.join(path.encode('utf-8') for path in sorted(set(files))) + b'\0')
subprocess.run(['git', '-c', 'core.longpaths=true', 'add', '-f', '--pathspec-from-file=' + str(pathspec), '--pathspec-file-nul'], cwd=root, check=True)
print(f'Staged {len(set(files))} explicit source/documentation/evidence paths.')
